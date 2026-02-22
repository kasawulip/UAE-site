import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Calendar, MapPin, User, Mail, Phone, ShieldCheck, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { format, addDays, getDay, isMonday, isTuesday, isWednesday, isThursday, startOfDay } from 'date-fns';

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

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
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
    
    if (!formData.surname.trim()) newErrors.surname = 'Surname is required';
    if (!formData.firstname.trim()) newErrors.firstname = 'First name is required';
    if (!formData.nin.trim()) newErrors.nin = 'NIN number is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.location) newErrors.location = 'Please select a location';
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

  // Date matcher for calendar (only Monday-Thursday)
  const isWeekday = (date) => {
    return isMonday(date) || isTuesday(date) || isWednesday(date) || isThursday(date);
  };

  const isDateDisabled = (date) => {
    if (!isWeekday(date)) return true;
    if (date < startOfDay(new Date())) return true;
    return disabledDates.some(disabledDate => 
      format(disabledDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    );
  };

  const handleDateSelect = (date) => {
    if (date && !isDateDisabled(date)) {
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-slate-900 rounded-md flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">National ID Issuance</h1>
              <p className="text-sm text-slate-600">Book Your Appointment</p>
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
                    <p className="text-sm text-slate-600 mt-1">200 slots available daily</p>
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
                    <p className="text-sm text-slate-600 mt-1">100 slots available daily</p>
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
                    disabled={isDateDisabled}
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
  );
};

export default AppointmentForm;
