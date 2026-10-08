"""
Tests for Thursday-only appointment restriction and slot limits.
- Abu Dhabi: 300, Dubai: 200
- Only Thursdays allowed (weekday()==3). Public holidays on Thursday still excluded.
"""
import os
import uuid
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"


def _next_weekday(target_weekday: int, min_days_ahead: int = 2):
    """Return YYYY-MM-DD for the next date with given weekday, at least min_days_ahead from today."""
    d = datetime.utcnow().date() + timedelta(days=min_days_ahead)
    while d.weekday() != target_weekday:
        d += timedelta(days=1)
    return d.strftime('%Y-%m-%d')


def _payload(date_str, location="Abu Dhabi"):
    # NIN must start with CM/CF and be 14 chars total
    nin = "CM" + uuid.uuid4().hex[:12].upper()
    return {
        "firstname": "Test",
        "surname": "Thursday",
        "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
        "phone": "+971501234567",
        "nin": nin,
        "location": location,
        "appointment_date": date_str,
    }


# --- Slot limits ---

def test_abu_dhabi_slot_limit_is_300():
    r = requests.get(f"{API}/slots/Abu%20Dhabi/{_next_weekday(3)}")
    assert r.status_code == 200
    assert r.json()['total_slots'] == 300


def test_dubai_slot_limit_is_200():
    r = requests.get(f"{API}/slots/Dubai/{_next_weekday(3)}")
    assert r.status_code == 200
    assert r.json()['total_slots'] == 200


# --- Thursday restriction ---

def test_reject_friday_appointment():
    friday = _next_weekday(4)  # Friday
    r = requests.post(f"{API}/appointments", json=_payload(friday))
    assert r.status_code == 400
    detail = r.json().get('detail', '')
    assert 'Thursday' in detail, f"Expected 'Thursday' in error, got: {detail}"


def test_reject_monday_appointment():
    monday = _next_weekday(0)
    r = requests.post(f"{API}/appointments", json=_payload(monday))
    assert r.status_code == 400
    assert 'Thursday' in r.json().get('detail', '')


def test_reject_wednesday_appointment():
    wed = _next_weekday(2)
    r = requests.post(f"{API}/appointments", json=_payload(wed))
    assert r.status_code == 400
    assert 'Thursday' in r.json().get('detail', '')


def test_reject_saturday_appointment():
    sat = _next_weekday(5)
    r = requests.post(f"{API}/appointments", json=_payload(sat))
    assert r.status_code == 400
    assert 'Thursday' in r.json().get('detail', '')


def test_accept_thursday_appointment():
    thursday = _next_weekday(3, min_days_ahead=7)  # a thursday at least a week out
    payload = _payload(thursday)
    r = requests.post(f"{API}/appointments", json=payload)
    assert r.status_code == 200, f"Thursday booking failed: {r.status_code} {r.text}"
    data = r.json()
    assert data['appointment_date'] == thursday
    assert data['location'] == 'Abu Dhabi'


def test_thursday_fixed_date_2026_09_24():
    """2026-09-24 is a Thursday — should be accepted by date validation."""
    date = "2026-09-24"
    assert datetime.strptime(date, "%Y-%m-%d").weekday() == 3
    r = requests.post(f"{API}/appointments", json=_payload(date))
    # Could succeed (200) or fail only due to slot/NIN uniqueness - must NOT fail due to weekday
    if r.status_code == 400:
        assert 'Thursday' not in r.json().get('detail', ''), \
            "Thursday Sep 24, 2026 should not be rejected as non-Thursday"


def test_friday_fixed_date_future():
    """A Friday far in the future — must be rejected with Thursday error."""
    # Pick a Friday ~2 months out to avoid 24-hour cutoff
    d = datetime.utcnow().date() + timedelta(days=60)
    while d.weekday() != 4:
        d += timedelta(days=1)
    date = d.strftime('%Y-%m-%d')
    r = requests.post(f"{API}/appointments", json=_payload(date))
    assert r.status_code == 400, f"Got {r.status_code}: {r.text}"
    assert 'Thursday' in r.json().get('detail', ''), f"Got: {r.json()}"
