"""Tests for Abu Dhabi slot override (300 on 2026-09-24) and Dubai unchanged."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nira-appointments.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestSlotLimits:
    def test_abu_dhabi_override_date_has_300(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/slots/Abu Dhabi/2026-09-24")
        assert r.status_code == 200
        data = r.json()
        assert data["total_slots"] == 300
        assert data["location"] == "Abu Dhabi"
        assert data["date"] == "2026-09-24"
        assert data["available_slots"] <= 300

    def test_abu_dhabi_next_day_reverts_to_150(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/slots/Abu Dhabi/2026-09-25")
        assert r.status_code == 200
        assert r.json()["total_slots"] == 150

    def test_abu_dhabi_arbitrary_other_date_150(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/slots/Abu Dhabi/2026-10-15")
        assert r.status_code == 200
        assert r.json()["total_slots"] == 150

    def test_dubai_override_date_unchanged_80(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/slots/Dubai/2026-09-24")
        assert r.status_code == 200
        assert r.json()["total_slots"] == 80

    def test_dubai_next_day_unchanged_80(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/slots/Dubai/2026-09-25")
        assert r.status_code == 200
        assert r.json()["total_slots"] == 80

    def test_invalid_location_returns_400(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/slots/Kampala/2026-09-24")
        assert r.status_code == 400


class TestAdminLoginAndDailySummary:
    @pytest.fixture(scope="class")
    def token(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/admin/login",
                            json={"username": "paul.kasawuli", "password": "SuperAdmin@2026"})
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    def test_login_success(self, token):
        assert isinstance(token, str) and len(token) > 0

    def test_daily_summary_reflects_300_slots(self, api_client, token):
        r = api_client.get(f"{BASE_URL}/api/admin/daily-summary?date=2026-09-24",
                           headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["abu_dhabi"]["total_slots"] == 300
        assert data["dubai"]["total_slots"] == 80

    def test_daily_summary_next_day_150(self, api_client, token):
        r = api_client.get(f"{BASE_URL}/api/admin/daily-summary?date=2026-09-25",
                           headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["abu_dhabi"]["total_slots"] == 150
        assert data["dubai"]["total_slots"] == 80
