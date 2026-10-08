"""Tests for Auto-Expire Appointments feature.
Covers:
- Partial unique index on NIN (only for pending)
- Rebooking after expiration
- Blocking rebook when existing appointment is still pending
- Slot availability counts only pending appointments
- Startup auto-expiration (via DB inspection)
"""
import os
import random
import string
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nira-appointments.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_USER = "paul.kasawuli"
ADMIN_PASS = "SuperAdmin@2026"


def _next_thursday(min_days_ahead: int = 8) -> str:
    """Return a Thursday date at least `min_days_ahead` days ahead."""
    d = datetime.now(timezone.utc) + timedelta(days=min_days_ahead)
    while d.weekday() != 3:  # Thursday
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def _random_nin(prefix: str = "CM") -> str:
    """Generate a 14-char NIN starting with CM/CF."""
    tail = "".join(random.choices(string.ascii_uppercase + string.digits, k=12))
    return f"{prefix}{tail}"


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    try:
        # Attempt to resolve the correct DB; try both common names
        db = client[DB_NAME]
        # Verify by checking if appointments collection has the known index name
        yield db
    finally:
        client.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def unique_nin():
    return _random_nin("CM")


@pytest.fixture
def cleanup_nins(mongo_db):
    nins = []
    yield nins
    if nins:
        mongo_db.appointments.delete_many({"nin": {"$in": nins}})


# --- Startup indicators -----------------------------------------------------

def test_partial_unique_index_exists(mongo_db):
    """Verify the `unique_nin_pending` partial unique index was created on startup."""
    indexes = list(mongo_db.appointments.list_indexes())
    names = [idx["name"] for idx in indexes]
    assert "unique_nin_pending" in names, f"Partial unique index missing. Found: {names}"
    idx = next(i for i in indexes if i["name"] == "unique_nin_pending")
    assert idx.get("unique") is True
    pf = idx.get("partialFilterExpression")
    assert pf == {"status": "pending"}, f"Unexpected partialFilterExpression: {pf}"


def test_no_pending_appointments_in_past(mongo_db):
    """After startup auto-expiration, there should be no pending appointments with past date."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    leftover = mongo_db.appointments.count_documents(
        {"status": "pending", "appointment_date": {"$lt": today}}
    )
    assert leftover == 0, f"Found {leftover} pending appointments with past dates (auto-expire failed)"


# --- Booking / slot logic ---------------------------------------------------

def test_create_appointment_success(unique_nin, cleanup_nins):
    """Baseline: a fresh NIN can book an appointment on a future Thursday."""
    cleanup_nins.append(unique_nin)
    date = _next_thursday(min_days_ahead=14)
    payload = {
        "surname": "Expire",
        "firstname": "TestUser",
        "nin": unique_nin,
        "phone": "+971501234567",
        "email": "test_expire@example.com",
        "location": "Abu Dhabi",
        "appointment_date": date,
    }
    r = requests.post(f"{API}/appointments", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["nin"] == unique_nin
    assert data["status"] == "pending"


def test_duplicate_pending_nin_blocked(unique_nin, cleanup_nins):
    """A NIN with an existing PENDING appointment cannot create another."""
    cleanup_nins.append(unique_nin)
    date = _next_thursday(min_days_ahead=14)
    payload = {
        "surname": "Dup", "firstname": "User", "nin": unique_nin,
        "phone": "+971501234567", "email": "dup@example.com",
        "location": "Dubai", "appointment_date": date,
    }
    r1 = requests.post(f"{API}/appointments", json=payload)
    assert r1.status_code == 200, r1.text

    # Try again with different date — same NIN still pending
    date2 = _next_thursday(min_days_ahead=21)
    r2 = requests.post(f"{API}/appointments", json={**payload, "appointment_date": date2})
    assert r2.status_code == 400
    assert "pending appointment" in r2.json()["detail"].lower()


def test_rebook_after_expiration(mongo_db, unique_nin, cleanup_nins):
    """A NIN whose previous appointment is 'expired' CAN create a new booking."""
    cleanup_nins.append(unique_nin)
    date = _next_thursday(min_days_ahead=14)
    payload = {
        "surname": "Rebook", "firstname": "User", "nin": unique_nin,
        "phone": "+971501234567", "email": "rebook@example.com",
        "location": "Abu Dhabi", "appointment_date": date,
    }
    r1 = requests.post(f"{API}/appointments", json=payload)
    assert r1.status_code == 200, r1.text
    first_id = r1.json()["id"]

    # Simulate expiration by directly updating the DB
    upd = mongo_db.appointments.update_one(
        {"id": first_id}, {"$set": {"status": "expired"}}
    )
    assert upd.modified_count == 1

    # Now the same NIN should be able to book a new appointment
    date2 = _next_thursday(min_days_ahead=21)
    r2 = requests.post(f"{API}/appointments", json={**payload, "appointment_date": date2})
    assert r2.status_code == 200, f"Rebook failed: {r2.status_code} {r2.text}"
    assert r2.json()["status"] == "pending"


def test_rebook_after_completed(mongo_db, unique_nin, cleanup_nins):
    """Completed appointments should also not block rebooking (parity)."""
    cleanup_nins.append(unique_nin)
    date = _next_thursday(min_days_ahead=14)
    payload = {
        "surname": "Comp", "firstname": "User", "nin": unique_nin,
        "phone": "+971501234567", "email": "comp@example.com",
        "location": "Dubai", "appointment_date": date,
    }
    r1 = requests.post(f"{API}/appointments", json=payload)
    assert r1.status_code == 200, r1.text
    first_id = r1.json()["id"]

    mongo_db.appointments.update_one({"id": first_id}, {"$set": {"status": "completed"}})

    date2 = _next_thursday(min_days_ahead=21)
    r2 = requests.post(f"{API}/appointments", json={**payload, "appointment_date": date2})
    assert r2.status_code == 200, r2.text


def test_slot_availability_counts_only_pending(mongo_db, unique_nin, cleanup_nins):
    """Slot availability must only count 'pending' appointments."""
    cleanup_nins.append(unique_nin)
    date = _next_thursday(min_days_ahead=14)
    location = "Dubai"

    # Baseline count
    r0 = requests.get(f"{API}/slots/{location}/{date}")
    assert r0.status_code == 200, r0.text
    baseline_available = r0.json()["available_slots"]

    # Create a pending appointment
    r1 = requests.post(f"{API}/appointments", json={
        "surname": "Slot", "firstname": "User", "nin": unique_nin,
        "phone": "+971501234567", "email": "slot@example.com",
        "location": location, "appointment_date": date,
    })
    assert r1.status_code == 200, r1.text
    apt_id = r1.json()["id"]

    r_after_pending = requests.get(f"{API}/slots/{location}/{date}")
    assert r_after_pending.json()["available_slots"] == baseline_available - 1

    # Mark it expired — slot should become available again
    mongo_db.appointments.update_one({"id": apt_id}, {"$set": {"status": "expired"}})

    r_after_expired = requests.get(f"{API}/slots/{location}/{date}")
    assert r_after_expired.json()["available_slots"] == baseline_available, (
        f"Expected expired appointment to free the slot. baseline={baseline_available}, "
        f"after_expired={r_after_expired.json()['available_slots']}"
    )


def test_admin_sees_expired_status(mongo_db, admin_token, unique_nin, cleanup_nins):
    """Admin appointments list should include expired appointments with status='expired'."""
    cleanup_nins.append(unique_nin)
    date = _next_thursday(min_days_ahead=14)
    r1 = requests.post(f"{API}/appointments", json={
        "surname": "AdminView", "firstname": "User", "nin": unique_nin,
        "phone": "+971501234567", "email": "adminview@example.com",
        "location": "Abu Dhabi", "appointment_date": date,
    })
    assert r1.status_code == 200
    apt_id = r1.json()["id"]
    mongo_db.appointments.update_one({"id": apt_id}, {"$set": {"status": "expired"}})

    r = requests.get(f"{API}/appointments?limit=0",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    appts = r.json()
    match = next((a for a in appts if a["id"] == apt_id), None)
    assert match is not None, "Expired appointment missing from admin list"
    assert match["status"] == "expired"
