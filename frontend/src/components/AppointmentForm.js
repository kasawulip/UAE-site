import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Calendar, MapPin, User, Mail, Phone, ShieldCheck, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { format, addDays, getDay, startOfDay, parseISO } from 'date-fns';

// Public holidays for Uganda and UAE (2024-2026)
const PUBLIC_HOLIDAYS = [
  // Uganda Public Holidays 2024
  '2024-01-01', // New Year's Day
  '2024-01-26', // NRM Liberation Day
  '2024-03-08', // International Women's Day
  '2024-03-29', // Good Friday
  '2024-04-01', // Easter Monday
  '2024-04-10', // Eid al-Fitr (approximate)
  '2024-05-01', // Labour Day
  '2024-06-03', // Martyrs' Day
  '2024-06-09', // National Heroes' Day
  '2024-06-17', // Eid al-Adha (approximate)
  '2024-10-09', // Independence Day
  '2024-12-25', // Christmas Day
  '2024-12-26', // Boxing Day
  
  // UAE Public Holidays 2024
  '2024-01-01', // New Year's Day
  '2024-04-10', // Eid al-Fitr
  '2024-04-11', // Eid al-Fitr
  '2024-04-12', // Eid al-Fitr
  '2024-06-16', // Arafat Day
  '2024-06-17', // Eid al-Adha
  '2024-06-18', // Eid al-Adha
  '2024-06-19', // Eid al-Adha
  '2024-07-07', // Islamic New Year
  '2024-09-15', // Prophet's Birthday
  '2024-12-02', // UAE National Day
  '2024-12-03', // UAE National Day
  
  // Uganda Public Holidays 2025
  '2025-01-01', // New Year's Day
  '2025-01-26', // NRM Liberation Day
  '2025-03-08', // International Women's Day
  '2025-03-30', // Eid al-Fitr (approximate)
  '2025-04-18', // Good Friday
  '2025-04-21', // Easter Monday
  '2025-05-01', // Labour Day
  '2025-06-03', // Martyrs' Day
  '2025-06-06', // Eid al-Adha (approximate)
  '2025-06-09', // National Heroes' Day
  '2025-10-09', // Independence Day
  '2025-12-25', // Christmas Day
  '2025-12-26', // Boxing Day
  
  // UAE Public Holidays 2025
  '2025-01-01', // New Year's Day
  '2025-03-30', // Eid al-Fitr
  '2025-03-31', // Eid al-Fitr
  '2025-04-01', // Eid al-Fitr
  '2025-06-05', // Arafat Day
  '2025-06-06', // Eid al-Adha
  '2025-06-07', // Eid al-Adha
  '2025-06-08', // Eid al-Adha
  '2025-06-26', // Islamic New Year
  '2025-09-04', // Prophet's Birthday
  '2025-12-02', // UAE National Day
  '2025-12-03', // UAE National Day
  
  // Uganda Public Holidays 2026
  '2026-01-01', // New Year's Day
  '2026-01-26', // NRM Liberation Day
  '2026-03-08', // International Women's Day
  '2026-03-20', // Eid al-Fitr (approximate)
  '2026-04-03', // Good Friday
  '2026-04-06', // Easter Monday
  '2026-05-01', // Labour Day
  '2026-05-27', // Eid al-Adha (approximate)
  '2026-06-03', // Martyrs' Day
  '2026-06-09', // National Heroes' Day
  '2026-10-09', // Independence Day
  '2026-12-25', // Christmas Day
  '2026-12-26', // Boxing Day
  
  // UAE Public Holidays 2026
  '2026-01-01', // New Year's Day
  '2026-03-20', // Eid al-Fitr
  '2026-03-21', // Eid al-Fitr
  '2026-03-22', // Eid al-Fitr
  '2026-05-26', // Arafat Day
  '2026-05-27', // Eid al-Adha
  '2026-05-28', // Eid al-Adha
  '2026-05-29', // Eid al-Adha
  '2026-06-16', // Islamic New Year
  '2026-08-25', // Prophet's Birthday
  '2026-12-02', // UAE National Day
  '2026-12-03', // UAE National Day
];

// Helper function to check if a date is a public holiday
const isPublicHoliday = (date) => {
  const dateStr = format(date, 'yyyy-MM-dd');
  return PUBLIC_HOLIDAYS.includes(dateStr);
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AppointmentForm = () => {
  const [formData, setFormData] = useState({
    surname: '',
    firstname: '',
    nin: '',
    phone: '',
    email: '',
    location: '',
    appointment_date: ''
  });
  
  const [errors, setErrors] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [disabledDates, setDisabledDates] = useState([]);

  // Validation functions
  const validateNIN = (nin) => {
    if (!nin) return 'NIN number is required';
    if (nin.length !== 14) return 'NIN must be exactly 14 characters';
    if (!nin.startsWith('CM') && !nin.startsWith('CF')) {
      return 'NIN must start with CM or CF';
    }
    return '';
  };

  const validatePhone = (phone) => {
    if (!phone) return 'Phone number is required';
    
    // Remove all non-digit characters for validation
    const digitsOnly = phone.replace(/\D/g, '');
    
    // UAE phone format: +971XXXXXXXXX (12 digits total) or 05XXXXXXXX (10 digits)
    if (phone.startsWith('+971')) {
      if (digitsOnly.length !== 12) {
        return 'UAE phone must be in format +971XXXXXXXXX (12 digits)';
      }
    } else if (phone.startsWith('05') || phone.startsWith('04') || phone.startsWith('02')) {
      if (digitsOnly.length !== 10) {
        return 'UAE phone must be 10 digits (e.g., 05XXXXXXXX)';
      }
    } else if (phone.startsWith('971')) {
      if (digitsOnly.length !== 12) {
        return 'UAE phone must be in format 971XXXXXXXXX (12 digits)';
      }
    } else {
      return 'Enter valid UAE phone number (+971XXXXXXXXX or 05XXXXXXXX)';
    }
    
    return '';
  };

  const validateName = (name, fieldName) => {
    if (!name) return `${fieldName} is required`;
    if (!/^[A-Za-z\s]+$/.test(name)) {
      return `${fieldName} must contain only letters`;
    }
    return '';
  };

  const validateEmail = (email) => {
    if (!email) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    return '';
  };

  // Handle input changes with live validation
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // For phone field, only allow numbers, +, and spaces
    if (name === 'phone') {
      const filteredValue = value.replace(/[^\d+\s]/g, '');
      setFormData(prev => ({ ...prev, [name]: filteredValue }));
      
      // Live validation for phone
      const phoneError = validatePhone(filteredValue);
      setErrors(prev => ({ ...prev, phone: phoneError }));
      return;
    }
    
    // For name fields, only allow letters and spaces
    if (name === 'surname' || name === 'firstname') {
      const filteredValue = value.replace(/[^A-Za-z\s]/g, '');
      setFormData(prev => ({ ...prev, [name]: filteredValue }));
      
      // Live validation for names
      const fieldLabel = name === 'surname' ? 'Surname' : 'First name';
      const nameError = validateName(filteredValue, fieldLabel);
      setErrors(prev => ({ ...prev, [name]: nameError }));
      return;
    }
    
    // Update form data
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Live validation based on field
    let error = '';
    if (name === 'nin') {
      error = validateNIN(value);
    } else if (name === 'email') {
      error = validateEmail(value);
    }
    
    setErrors(prev => ({ ...prev, [name]: error }));
  };

  // Handle location selection
  const selectLocation = (location) => {
    setFormData(prev => ({ ...prev, location }));
    if (errors.location) {
      setErrors(prev => ({ ...prev, location: '' }));
    }
    setSelectedDate(null);
    setFormData(prev => ({ ...prev, appointment_date: '' }));
    checkDisabledDates(location);
  };

  // Check which dates should be disabled
  const checkDisabledDates = async (location) => {
    if (!location) return;
    
    const disabled = [];
    for (let i = 0; i < 60; i++) {
      const date = addDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      try {
        const response = await axios.get(`${API}/slots/${location}/${dateStr}`);
        if (response.data.available_slots === 0) {
          disabled.push(startOfDay(date));
        }
      } catch (error) {
        console.error('Error checking slots:', error);
      }
    }
    setDisabledDates(disabled);
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    
    // Validate surname
    const surnameError = validateName(formData.surname, 'Surname');
    if (surnameError) newErrors.surname = surnameError;
    
    // Validate firstname
    const firstnameError = validateName(formData.firstname, 'First name');
    if (firstnameError) newErrors.firstname = firstnameError;
    
    // Validate NIN
    const ninError = validateNIN(formData.nin);
    if (ninError) newErrors.nin = ninError;
    
    // Validate phone
    const phoneError = validatePhone(formData.phone);
    if (phoneError) newErrors.phone = phoneError;
    
    // Validate email
    const emailError = validateEmail(formData.email);
    if (emailError) newErrors.email = emailError;
    
    // Validate location
    if (!formData.location) newErrors.location = 'Please select a location';
    
    // Validate date
    if (!formData.appointment_date) newErrors.appointment_date = 'Please select a date';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    
    try {
      await axios.post(`${API}/appointments`, formData);
      toast.success('Appointment confirmed! Check your email for details.');
      setSubmitted(true);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to book appointment';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Matcher for calendar - disable weekends, public holidays, and past dates
  const disabledMatcher = (date) => {
    const day = getDay(date);
    // Disable Saturday (6) and Sunday (0) - Allow Monday to Friday
    if (day === 0 || day === 6) return true;
    
    // Disable past dates
    if (date < startOfDay(new Date())) return true;
    
    // Disable public holidays (Uganda and UAE)
    if (isPublicHoliday(date)) return true;
    
    // Disable dates with no slots
    const isDisabled = disabledDates.some(disabledDate => 
      format(disabledDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    );
    
    return isDisabled;
  };

  const handleDateSelect = (date) => {
    if (date) {
      setSelectedDate(date);
      const dateStr = format(date, 'yyyy-MM-dd');
      setFormData(prev => ({ ...prev, appointment_date: dateStr }));
      if (errors.appointment_date) {
        setErrors(prev => ({ ...prev, appointment_date: '' }));
      }
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4"
      >
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Appointment Confirmed!</h2>
          <p className="text-slate-600 mb-6">
            Your appointment has been successfully booked. A confirmation email has been sent to <strong>{formData.email}</strong>.
          </p>
          <div className="bg-slate-50 rounded-md p-4 mb-6 text-left">
            <p className="text-sm text-slate-600 mb-1"><strong>Name:</strong> {formData.firstname} {formData.surname}</p>
            <p className="text-sm text-slate-600 mb-1"><strong>Location:</strong> {formData.location}</p>
            <p className="text-sm text-slate-600"><strong>Date:</strong> {format(new Date(formData.appointment_date), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full bg-slate-900 hover:bg-slate-800"
            data-testid="book-another-btn"
          >
            Book Another Appointment
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 relative">
      {/* Fingerprint Background */}
      <div className="homepage-background"></div>
      
      {/* Content */}
      <div className="relative z-10">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-900 rounded-md flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">National ID Issuance</h1>
                <p className="text-sm text-slate-600">Book Your Appointment</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                onClick={() => window.location.href = '/manage'}
                variant="outline"
                size="sm"
                className="border-amber-300 text-amber-700 hover:bg-amber-50 w-full sm:w-auto"
                data-testid="manage-appointment-nav-btn"
              >
                <XCircle className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Cancel/Modify</span>
                <span className="sm:hidden">Manage Appointment</span>
              </Button>
              <Button
                onClick={() => window.location.href = '/admin/login'}
                variant="outline"
                size="sm"
                className="border-slate-300 w-full sm:w-auto"
                data-testid="admin-login-nav-btn"
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                Admin Login
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <form onSubmit={handleSubmit} className="space-y-8" data-testid="appointment-form">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 md:p-8">
              <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <User className="w-6 h-6 text-amber-600" />
                Personal Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="surname" className="text-sm font-medium text-slate-700 mb-2 block">Surname *</Label>
                  <Input
                    id="surname"
                    name="surname"
                    value={formData.surname}
                    onChange={handleChange}
                    placeholder="Enter your surname"
                    className={errors.surname ? 'border-red-500' : ''}
                    data-testid="surname-input"
                  />
                  {errors.surname && <p className="text-red-500 text-sm mt-1" data-testid="surname-error">{errors.surname}</p>}
                </div>
                
                <div>
                  <Label htmlFor="firstname" className="text-sm font-medium text-slate-700 mb-2 block">First Name *</Label>
                  <Input
                    id="firstname"
                    name="firstname"
                    value={formData.firstname}
                    onChange={handleChange}
                    placeholder="Enter your first name"
                    className={errors.firstname ? 'border-red-500' : ''}
                    data-testid="firstname-input"
                  />
                  {errors.firstname && <p className="text-red-500 text-sm mt-1" data-testid="firstname-error">{errors.firstname}</p>}
                </div>
                
                <div>
                  <Label htmlFor="nin" className="text-sm font-medium text-slate-700 mb-2 block">NIN Number *</Label>
                  <Input
                    id="nin"
                    name="nin"
                    value={formData.nin}
                    onChange={handleChange}
                    placeholder="Enter your NIN"
                    className={errors.nin ? 'border-red-500' : ''}
                    data-testid="nin-input"
                  />
                  {errors.nin && <p className="text-red-500 text-sm mt-1" data-testid="nin-error">{errors.nin}</p>}
                </div>
                
                <div>
                  <Label htmlFor="phone" className="text-sm font-medium text-slate-700 mb-2 block">Phone Number *</Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Enter your phone number"
                    className={errors.phone ? 'border-red-500' : ''}
                    data-testid="phone-input"
                  />
                  {errors.phone && <p className="text-red-500 text-sm mt-1" data-testid="phone-error">{errors.phone}</p>}
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="email" className="text-sm font-medium text-slate-700 mb-2 block">Email Address *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email address"
                    className={errors.email ? 'border-red-500' : ''}
                    data-testid="email-input"
                  />
                  {errors.email && <p className="text-red-500 text-sm mt-1" data-testid="email-error">{errors.email}</p>}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 md:p-8">
              <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <MapPin className="w-6 h-6 text-amber-600" />
                Select Pickup Location *
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div
                  whileHover={{ y: -4 }}
                  onClick={() => selectLocation('Abu Dhabi')}
                  className={`location-card cursor-pointer rounded-lg border-2 overflow-hidden ${
                    formData.location === 'Abu Dhabi' 
                      ? 'border-amber-500 ring-2 ring-amber-500/20' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  data-testid="location-abu-dhabi"
                >
                  <div className="h-48 overflow-hidden">
                    <img 
                      src="https://images.unsplash.com/photo-1628005926467-5530202e5327?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHw0fHxhYnUlMjBkaGFiaSUyMHNoZWlraCUyMHpheWVkJTIwbW9zcXVlJTIwbWluaW1hbCUyMGFyY2hpdGVjdHVyZXxlbnwwfHx8fDE3NzE3NzE3ODJ8MA&ixlib=rb-4.1.0&q=85"
                      alt="Abu Dhabi"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-slate-900">Abu Dhabi</h3>
                    <p className="text-sm text-slate-600 mt-1">150 slots available daily</p>
                  </div>
                </motion.div>
                
                <motion.div
                  whileHover={{ y: -4 }}
                  onClick={() => selectLocation('Dubai')}
                  className={`location-card cursor-pointer rounded-lg border-2 overflow-hidden ${
                    formData.location === 'Dubai' 
                      ? 'border-amber-500 ring-2 ring-amber-500/20' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  data-testid="location-dubai"
                >
                  <div className="h-48 overflow-hidden">
                    <img 
                      src="https://images.unsplash.com/photo-1721235421626-a5c5ce155842?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHw0fHxkdWJhaSUyMGJ1cmolMjBraGFsaWZhJTIwbWluaW1hbCUyMGFyY2hpdGVjdHVyZXxlbnwwfHx8fDE3NzE3NzE3ODl8MA&ixlib=rb-4.1.0&q=85"
                      alt="Dubai"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-slate-900">Dubai</h3>
                    <p className="text-sm text-slate-600 mt-1">80 slots available daily</p>
                  </div>
                </motion.div>
              </div>
              {errors.location && <p className="text-red-500 text-sm mt-3" data-testid="location-error">{errors.location}</p>}
            </div>

            {formData.location && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 md:p-8"
              >
                <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                  <Calendar className="w-6 h-6 text-amber-600" />
                  Select Appointment Date *
                </h2>
                
                <div className="flex justify-center">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    disabled={disabledMatcher}
                    fromDate={new Date()}
                    className="rounded-md border shadow" 
                    data-testid="appointment-calendar"
                  />
                </div>
                
                <p className="text-sm text-slate-600 mt-4 text-center">
                  Available days: Monday to Thursday (9:00 AM - 3:00 PM)
                </p>
                {selectedDate && (
                  <p className="text-sm font-medium text-amber-600 mt-2 text-center" data-testid="selected-date-display">
                    Selected: {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </p>
                )}
                {errors.appointment_date && <p className="text-red-500 text-sm mt-2 text-center" data-testid="date-error">{errors.appointment_date}</p>}
              </motion.div>
            )}

            <div className="flex justify-center">
              <Button
                type="submit"
                disabled={loading}
                className="btn-primary bg-slate-900 hover:bg-slate-800 text-white px-12 py-6 text-lg font-semibold rounded-md shadow-lg"
                data-testid="submit-appointment-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Appointment'
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
      </div>
    </div>
  );
};

export default AppointmentForm;
