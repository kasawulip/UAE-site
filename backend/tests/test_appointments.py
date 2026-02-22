"""
Backend tests for National ID Appointment System
Testing: Slot limits (Abu Dhabi: 150, Dubai: 80), appointment creation, validation, admin endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nira-appointments.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

class TestSlotLimits:
    """Tests for slot availability endpoint with new limits (Abu Dhabi: 150, Dubai: 80)"""
    
    def test_abu_dhabi_slot_limit_is_150(self):
        """Verify Abu Dhabi slot limit is 150 (changed from 200)"""
        response = requests.get(f"{API_URL}/slots/Abu%20Dhabi/2025-02-03")
        assert response.status_code == 200
        data = response.json()
        assert data['total_slots'] == 150, f"Expected total_slots=150 for Abu Dhabi, got {data['total_slots']}"
        assert data['location'] == 'Abu Dhabi'
        print(f"✓ Abu Dhabi slot limit is correct: {data['total_slots']}")
    
    def test_dubai_slot_limit_is_80(self):
        """Verify Dubai slot limit is 80 (changed from 100)"""
        response = requests.get(f"{API_URL}/slots/Dubai/2025-02-03")
        assert response.status_code == 200
        data = response.json()
        assert data['total_slots'] == 80, f"Expected total_slots=80 for Dubai, got {data['total_slots']}"
        assert data['location'] == 'Dubai'
        print(f"✓ Dubai slot limit is correct: {data['total_slots']}")
    
    def test_invalid_location_returns_400(self):
        """Verify invalid location returns 400 error"""
        response = requests.get(f"{API_URL}/slots/InvalidCity/2025-02-03")
        assert response.status_code == 400
        data = response.json()
        assert 'Invalid location' in data['detail']
        print("✓ Invalid location properly rejected")
    
    def test_slot_availability_format(self):
        """Verify slot response contains required fields"""
        response = requests.get(f"{API_URL}/slots/Abu%20Dhabi/2025-02-04")
        assert response.status_code == 200
        data = response.json()
        required_fields = ['location', 'date', 'available_slots', 'total_slots']
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        assert data['available_slots'] <= data['total_slots']
        print(f"✓ Slot availability response format is correct")


class TestAppointmentCreation:
    """Tests for appointment creation with new slot limits"""
    
    def test_create_appointment_abu_dhabi(self):
        """Test creating appointment in Abu Dhabi"""
        unique_nin = f"CM{uuid.uuid4().hex[:12].upper()}"
        payload = {
            "surname": "TestUser",
            "firstname": "ApiTest",
            "nin": unique_nin,
            "phone": "+971501234567",
            "email": f"test_{uuid.uuid4().hex[:8]}@test.com",
            "location": "Abu Dhabi",
            "appointment_date": "2025-02-10"
        }
        response = requests.post(f"{API_URL}/appointments", json=payload)
        assert response.status_code == 200, f"Failed to create appointment: {response.text}"
        data = response.json()
        assert data['location'] == 'Abu Dhabi'
        assert data['appointment_date'] == '2025-02-10'
        print(f"✓ Appointment created in Abu Dhabi for NIN: {unique_nin}")
    
    def test_create_appointment_dubai(self):
        """Test creating appointment in Dubai"""
        unique_nin = f"CF{uuid.uuid4().hex[:12].upper()}"
        payload = {
            "surname": "TestUser",
            "firstname": "ApiTest",
            "nin": unique_nin,
            "phone": "0512345678",
            "email": f"test_{uuid.uuid4().hex[:8]}@test.com",
            "location": "Dubai",
            "appointment_date": "2025-02-11"
        }
        response = requests.post(f"{API_URL}/appointments", json=payload)
        assert response.status_code == 200, f"Failed to create appointment: {response.text}"
        data = response.json()
        assert data['location'] == 'Dubai'
        print(f"✓ Appointment created in Dubai for NIN: {unique_nin}")
    
    def test_invalid_location_rejected(self):
        """Test that invalid location is rejected"""
        payload = {
            "surname": "TestUser",
            "firstname": "ApiTest",
            "nin": "CM12345678901234"[:14],
            "phone": "+971501234567",
            "email": "test@test.com",
            "location": "InvalidCity",
            "appointment_date": "2025-02-10"
        }
        response = requests.post(f"{API_URL}/appointments", json=payload)
        assert response.status_code == 400
        print("✓ Invalid location properly rejected for appointment creation")
    
    def test_duplicate_nin_same_date_rejected(self):
        """Test that duplicate NIN on same date is rejected"""
        unique_nin = f"CM{uuid.uuid4().hex[:12].upper()}"
        payload = {
            "surname": "TestUser",
            "firstname": "ApiTest",
            "nin": unique_nin,
            "phone": "+971501234567",
            "email": f"test_{uuid.uuid4().hex[:8]}@test.com",
            "location": "Abu Dhabi",
            "appointment_date": "2025-02-12"
        }
        # Create first appointment
        response1 = requests.post(f"{API_URL}/appointments", json=payload)
        assert response1.status_code == 200, "First appointment should succeed"
        
        # Try to create duplicate
        payload['email'] = f"test_{uuid.uuid4().hex[:8]}@test.com"  # Different email
        response2 = requests.post(f"{API_URL}/appointments", json=payload)
        assert response2.status_code == 400, "Duplicate NIN on same date should be rejected"
        assert 'already exists' in response2.json()['detail']
        print(f"✓ Duplicate NIN properly rejected for NIN: {unique_nin}")


class TestValidation:
    """Tests for input validation"""
    
    def test_invalid_nin_length(self):
        """Test that NIN with invalid length is rejected"""
        payload = {
            "surname": "TestUser",
            "firstname": "ApiTest",
            "nin": "CM123",  # Too short
            "phone": "+971501234567",
            "email": "test@test.com",
            "location": "Abu Dhabi",
            "appointment_date": "2025-02-10"
        }
        response = requests.post(f"{API_URL}/appointments", json=payload)
        assert response.status_code == 422, f"Expected 422 for invalid NIN, got {response.status_code}"
        print("✓ Invalid NIN length properly rejected")
    
    def test_invalid_nin_prefix(self):
        """Test that NIN with invalid prefix is rejected"""
        payload = {
            "surname": "TestUser",
            "firstname": "ApiTest",
            "nin": "AB123456789012",  # Invalid prefix
            "phone": "+971501234567",
            "email": "test@test.com",
            "location": "Abu Dhabi",
            "appointment_date": "2025-02-10"
        }
        response = requests.post(f"{API_URL}/appointments", json=payload)
        assert response.status_code == 422
        print("✓ Invalid NIN prefix properly rejected")
    
    def test_invalid_email(self):
        """Test that invalid email is rejected"""
        payload = {
            "surname": "TestUser",
            "firstname": "ApiTest",
            "nin": "CM12345678901234"[:14],
            "phone": "+971501234567",
            "email": "invalid-email",  # Invalid format
            "location": "Abu Dhabi",
            "appointment_date": "2025-02-10"
        }
        response = requests.post(f"{API_URL}/appointments", json=payload)
        assert response.status_code == 422
        print("✓ Invalid email properly rejected")
    
    def test_invalid_phone_format(self):
        """Test that invalid UAE phone is rejected"""
        payload = {
            "surname": "TestUser",
            "firstname": "ApiTest",
            "nin": f"CM{uuid.uuid4().hex[:12].upper()}",
            "phone": "123456",  # Invalid format
            "email": "test@test.com",
            "location": "Abu Dhabi",
            "appointment_date": "2025-02-10"
        }
        response = requests.post(f"{API_URL}/appointments", json=payload)
        assert response.status_code == 422
        print("✓ Invalid phone format properly rejected")


class TestAdminEndpoints:
    """Tests for admin authentication and endpoints"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        payload = {
            "username": "admin",
            "password": "password"
        }
        response = requests.post(f"{API_URL}/admin/login", json=payload)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert 'access_token' in data
        assert data['token_type'] == 'bearer'
        assert data['role'] in ['admin', 'viewer']
        print(f"✓ Admin login successful, role: {data['role']}")
        return data['access_token']
    
    def test_admin_login_failure(self):
        """Test admin login with invalid credentials"""
        payload = {
            "username": "admin",
            "password": "wrongpassword"
        }
        response = requests.post(f"{API_URL}/admin/login", json=payload)
        assert response.status_code == 401
        print("✓ Invalid admin credentials properly rejected")
    
    def test_viewer_login_success(self):
        """Test viewer login with valid credentials"""
        payload = {
            "username": "viewer",
            "password": "password"
        }
        response = requests.post(f"{API_URL}/admin/login", json=payload)
        assert response.status_code == 200, f"Viewer login failed: {response.text}"
        data = response.json()
        assert 'access_token' in data
        assert data['role'] == 'viewer'
        print(f"✓ Viewer login successful")
    
    def test_get_appointments_requires_auth(self):
        """Test that GET appointments requires authentication"""
        response = requests.get(f"{API_URL}/appointments")
        assert response.status_code in [401, 403]
        print("✓ GET appointments properly requires authentication")
    
    def test_get_appointments_with_auth(self):
        """Test GET appointments with valid auth token"""
        # First login
        login_response = requests.post(f"{API_URL}/admin/login", json={
            "username": "admin",
            "password": "password"
        })
        assert login_response.status_code == 200
        token = login_response.json()['access_token']
        
        # Get appointments with token
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{API_URL}/appointments", headers=headers)
        assert response.status_code == 200, f"Failed to get appointments: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET appointments returned {len(data)} appointments")


class TestAppointmentLookup:
    """Tests for appointment lookup functionality"""
    
    def test_lookup_appointment(self):
        """Test appointment lookup by NIN and date"""
        # First create an appointment
        unique_nin = f"CM{uuid.uuid4().hex[:12].upper()}"
        create_payload = {
            "surname": "LookupTest",
            "firstname": "User",
            "nin": unique_nin,
            "phone": "+971501234567",
            "email": f"lookup_{uuid.uuid4().hex[:8]}@test.com",
            "location": "Dubai",
            "appointment_date": "2025-02-13"
        }
        create_response = requests.post(f"{API_URL}/appointments", json=create_payload)
        assert create_response.status_code == 200
        
        # Now lookup the appointment
        lookup_response = requests.get(f"{API_URL}/appointments/lookup?nin={unique_nin}&appointment_date=2025-02-13")
        assert lookup_response.status_code == 200
        data = lookup_response.json()
        assert data['nin'] == unique_nin
        assert data['location'] == 'Dubai'
        print(f"✓ Appointment lookup successful for NIN: {unique_nin}")
    
    def test_lookup_nonexistent_appointment(self):
        """Test lookup for non-existent appointment"""
        response = requests.get(f"{API_URL}/appointments/lookup?nin=CM99999999999999&appointment_date=2030-01-01")
        assert response.status_code == 404
        print("✓ Non-existent appointment lookup returns 404")


class TestAppointmentCancellation:
    """Tests for appointment cancellation via /manage page"""
    
    def test_cancel_appointment(self):
        """Test cancelling an appointment"""
        # First create an appointment
        unique_nin = f"CM{uuid.uuid4().hex[:12].upper()}"
        create_payload = {
            "surname": "CancelTest",
            "firstname": "User",
            "nin": unique_nin,
            "phone": "+971501234567",
            "email": f"cancel_{uuid.uuid4().hex[:8]}@test.com",
            "location": "Abu Dhabi",
            "appointment_date": "2025-02-14"
        }
        create_response = requests.post(f"{API_URL}/appointments", json=create_payload)
        assert create_response.status_code == 200
        
        # Now cancel the appointment
        cancel_response = requests.delete(f"{API_URL}/appointments/cancel?nin={unique_nin}&appointment_date=2025-02-14")
        assert cancel_response.status_code == 200, f"Cancel failed: {cancel_response.text}"
        data = cancel_response.json()
        assert 'cancelled successfully' in data['message']
        print(f"✓ Appointment cancelled successfully for NIN: {unique_nin}")
        
        # Verify appointment is gone
        lookup_response = requests.get(f"{API_URL}/appointments/lookup?nin={unique_nin}&appointment_date=2025-02-14")
        assert lookup_response.status_code == 404
        print("✓ Cancelled appointment no longer exists")
    
    def test_cancel_nonexistent_appointment(self):
        """Test cancelling non-existent appointment"""
        response = requests.delete(f"{API_URL}/appointments/cancel?nin=CM00000000000000&appointment_date=2030-01-01")
        assert response.status_code == 404
        print("✓ Non-existent appointment cancellation returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
