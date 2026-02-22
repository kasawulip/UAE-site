import requests
import sys
import json
from datetime import datetime, timedelta
import time

class NIDAppointmentTester:
    def __init__(self, base_url="https://nira-appointments.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        self.test_results.append({
            "test": name,
            "status": "PASS" if success else "FAIL",
            "details": details
        })
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"   Details: {details}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if endpoint else self.api_url
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}, Expected: {expected_status}"
            
            if not success:
                try:
                    error_data = response.json()
                    details += f", Response: {error_data}"
                except:
                    details += f", Response: {response.text[:200]}"
            
            self.log_test(name, success, details)
            
            return success, response.json() if response.status_code < 400 else response.text

        except Exception as e:
            self.log_test(name, False, f"Error: {str(e)}")
            return False, {}

    def test_api_connectivity(self):
        """Test basic API connectivity"""
        return self.run_test("API Root Endpoint", "GET", "", 200)

    def test_slot_availability_valid_locations(self):
        """Test slot availability for valid locations"""
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Test Abu Dhabi
        success1, _ = self.run_test(
            "Slot Availability - Abu Dhabi", 
            "GET", 
            f"slots/Abu Dhabi/{today}", 
            200
        )
        
        # Test Dubai  
        success2, _ = self.run_test(
            "Slot Availability - Dubai", 
            "GET", 
            f"slots/Dubai/{today}", 
            200
        )
        
        return success1 and success2

    def test_slot_availability_invalid_location(self):
        """Test slot availability with invalid location"""
        today = datetime.now().strftime('%Y-%m-%d')
        return self.run_test(
            "Slot Availability - Invalid Location", 
            "GET", 
            f"slots/InvalidCity/{today}", 
            400
        )

    def test_create_appointment_valid(self):
        """Test creating a valid appointment"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        appointment_data = {
            "surname": "TestSurname",
            "firstname": "TestFirstname", 
            "nin": f"TEST{int(time.time())}",  # Unique NIN
            "phone": "+971501234567",
            "email": "test@example.com",
            "location": "Abu Dhabi",
            "appointment_date": tomorrow
        }
        
        success, response = self.run_test(
            "Create Valid Appointment", 
            "POST", 
            "appointments", 
            200, 
            appointment_data
        )
        
        if success:
            self.test_appointment_id = response.get('id')
            self.test_nin = appointment_data['nin']
            self.test_date = appointment_data['appointment_date']
        
        return success

    def test_create_appointment_missing_fields(self):
        """Test appointment creation with missing required fields"""
        incomplete_data = {
            "surname": "TestSurname",
            # Missing firstname, nin, phone, email, location, appointment_date
        }
        
        return self.run_test(
            "Create Appointment - Missing Fields", 
            "POST", 
            "appointments", 
            422,  # FastAPI validation error
            incomplete_data
        )

    def test_create_appointment_invalid_location(self):
        """Test appointment creation with invalid location"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        invalid_data = {
            "surname": "TestSurname",
            "firstname": "TestFirstname",
            "nin": f"INVALID{int(time.time())}",
            "phone": "+971501234567", 
            "email": "test@example.com",
            "location": "InvalidCity",
            "appointment_date": tomorrow
        }
        
        return self.run_test(
            "Create Appointment - Invalid Location", 
            "POST", 
            "appointments", 
            400,
            invalid_data
        )

    def test_create_appointment_invalid_email(self):
        """Test appointment creation with invalid email"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        invalid_email_data = {
            "surname": "TestSurname",
            "firstname": "TestFirstname",
            "nin": f"EMAIL{int(time.time())}",
            "phone": "+971501234567",
            "email": "invalid-email",  # Invalid email format
            "location": "Dubai",
            "appointment_date": tomorrow
        }
        
        return self.run_test(
            "Create Appointment - Invalid Email", 
            "POST", 
            "appointments", 
            422,  # Pydantic validation error
            invalid_email_data
        )

    def test_duplicate_nin_same_date(self):
        """Test NIN duplicate prevention for same date"""
        if not hasattr(self, 'test_nin') or not hasattr(self, 'test_date'):
            self.log_test("NIN Duplicate Check", False, "Previous appointment creation failed")
            return False
        
        duplicate_data = {
            "surname": "DuplicateSurname",
            "firstname": "DuplicateFirstname",
            "nin": self.test_nin,  # Same NIN
            "phone": "+971507654321",
            "email": "duplicate@example.com",
            "location": "Dubai",
            "appointment_date": self.test_date  # Same date
        }
        
        return self.run_test(
            "NIN Duplicate Prevention", 
            "POST", 
            "appointments", 
            400,
            duplicate_data
        )

    def test_same_nin_different_date(self):
        """Test same NIN can book for different date"""
        if not hasattr(self, 'test_nin'):
            self.log_test("Same NIN Different Date", False, "Previous appointment creation failed")
            return False
            
        different_date = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        
        different_date_data = {
            "surname": "SamePerson",
            "firstname": "SamePersonFirst",
            "nin": self.test_nin,  # Same NIN
            "phone": "+971507654321",
            "email": "sameperson@example.com",
            "location": "Dubai",
            "appointment_date": different_date  # Different date
        }
        
        return self.run_test(
            "Same NIN Different Date", 
            "POST", 
            "appointments", 
            200,
            different_date_data
        )

    def test_get_all_appointments(self):
        """Test admin endpoint to get all appointments"""
        return self.run_test(
            "Get All Appointments (Admin)", 
            "GET", 
            "appointments", 
            200
        )

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting National ID Appointment System Backend Tests")
        print("=" * 60)
        
        # Basic connectivity
        self.test_api_connectivity()
        
        # Slot availability tests
        self.test_slot_availability_valid_locations()
        self.test_slot_availability_invalid_location()
        
        # Appointment creation tests
        self.test_create_appointment_valid()
        self.test_create_appointment_missing_fields() 
        self.test_create_appointment_invalid_location()
        self.test_create_appointment_invalid_email()
        
        # Duplicate prevention tests
        self.test_duplicate_nin_same_date()
        self.test_same_nin_different_date()
        
        # Admin functionality
        self.test_get_all_appointments()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
        else:
            print("⚠️  Some tests failed. Check details above.")
            
        return self.tests_passed, self.tests_run, self.test_results

def main():
    tester = NIDAppointmentTester()
    passed, total, results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())