import { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Edit, XCircle, Loader2, ShieldCheck, Calendar as CalendarIcon, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format, addDays, getDay, startOfDay } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ManageAppointment = () => {
  const [step, setStep] = useState(1); // 1: lookup, 2: action choice, 3: modify form
  const [action, setAction] = useState(''); // 'cancel' or 'modify'
  const [lookupData, setLookupData] = useState({ nin: '', appointment_date: '' });
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedAction, setCompletedAction] = useState('');
  
  // Modification form data
  const [newLocation, setNewLocation] = useState('');
  const [newDate, setNewDate] = useState(null);
  const [disabledDates, setDisabledDates] = useState([]);
  
  const navigate = useNavigate();

  const handleLookupChange = (e) => {
    const { name, value } = e.target;
    setLookupData(prev => ({ ...prev, [name]: value }));
  };

  // Check disabled dates for modification
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

  const handleLookup = async (e) => {
    e.preventDefault();
    
    if (!lookupData.nin || !lookupData.appointment_date) {
      toast.error('Please enter both NIN and appointment date');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.get(`${API}/appointments/lookup`, {
        params: {
          nin: lookupData.nin,
          appointment_date: lookupData.appointment_date
        }
      });
      
      setAppointment(response.data);
      setNewLocation(response.data.location);
      setStep(2);
    } catch (error) {
      const errorMsg = error.response?.status === 404 
        ? 'No appointment found with this NIN and date'
        : 'Error finding appointment. Please try again.';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    
    try {
      await axios.delete(`${API}/appointments/cancel`, {
        params: {
          nin: lookupData.nin,
          appointment_date: lookupData.appointment_date
        }
      });
      
      setCompletedAction('cancelled');
      setCompleted(true);
      toast.success('Appointment cancelled successfully');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to cancel appointment';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleModifySubmit = async () => {
    if (!newLocation || !newDate) {
      toast.error('Please select both location and new date');
      return;
    }
    
    const newDateStr = format(newDate, 'yyyy-MM-dd');
    
    // Check if trying to keep the same date and location
    if (newLocation === appointment.location && newDateStr === appointment.appointment_date) {
      toast.error('Please select a different date or location to modify');
      return;
    }
    
    setLoading(true);
    
    try {
      // First delete the old appointment
      await axios.delete(`${API}/appointments/cancel`, {
        params: {
          nin: lookupData.nin,
          appointment_date: lookupData.appointment_date
        }
      });
      
      // Then create a new one with updated details
      await axios.post(`${API}/appointments`, {
        surname: appointment.surname,
        firstname: appointment.firstname,
        nin: appointment.nin,
        phone: appointment.phone,
        email: appointment.email,
        location: newLocation,
        appointment_date: newDateStr
      });
      
      setCompletedAction('modified');
      setCompleted(true);
      toast.success('Appointment modified successfully! Check your email.');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to modify appointment';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const disabledMatcher = (date) => {
    const day = getDay(date);
    if (day === 0 || day === 5 || day === 6) return true;
    if (date < startOfDay(new Date())) return true;
    
    return disabledDates.some(disabledDate => 
      format(disabledDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    );
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center px-4 relative">
        {/* Fingerprint Background */}
        <div className="homepage-background"></div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center"
        >
          <div className={`w-16 h-16 ${completedAction === 'cancelled' ? 'bg-red-100' : 'bg-green-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
            {completedAction === 'cancelled' ? (
              <XCircle className="w-10 h-10 text-red-600" />
            ) : (
              <Edit className="w-10 h-10 text-green-600" />
            )}
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            {completedAction === 'cancelled' ? 'Appointment Cancelled' : 'Appointment Modified'}
          </h2>
          <p className="text-slate-600 mb-6">
            {completedAction === 'cancelled' 
              ? 'Your appointment has been successfully cancelled.'
              : 'Your appointment has been successfully updated. A new confirmation email has been sent.'}
          </p>
          
          {completedAction === 'modified' && newDate && (
            <div className="bg-slate-50 rounded-md p-4 mb-6 text-left">
              <p className="text-sm text-slate-600 mb-1"><strong>New Location:</strong> {newLocation}</p>
              <p className="text-sm text-slate-600"><strong>New Date:</strong> {format(newDate, 'EEEE, MMMM d, yyyy')}</p>
            </div>
          )}
          
          <div className="space-y-3">
            <Button 
              onClick={() => navigate('/')} 
              className="w-full bg-slate-900 hover:bg-slate-800"
            >
              Back to Home
            </Button>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="w-full"
            >
              Manage Another Appointment
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 relative">
      {/* Fingerprint Background */}
      <div className="homepage-background"></div>
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 rounded-md flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-amber-500" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">Manage Appointment</h1>
                <p className="text-xs sm:text-sm text-slate-600">Cancel or Modify</p>
              </div>
            </div>
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              size="sm"
              className="border-slate-300 w-full sm:w-auto"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Step 1: Lookup Appointment */}
          {step === 1 && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <Edit className="w-6 h-6 sm:w-8 sm:h-8 text-amber-600 flex-shrink-0" />
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Find Your Appointment</h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    Enter your details to cancel or modify
                  </p>
                </div>
              </div>

              <form onSubmit={handleLookup} className="space-y-6">
                <div>
                  <Label htmlFor="nin" className="text-sm font-medium text-slate-700 mb-2 block">
                    NIN Number *
                  </Label>
                  <Input
                    id="nin"
                    name="nin"
                    value={lookupData.nin}
                    onChange={handleLookupChange}
                    placeholder="Enter your 14-character NIN"
                    maxLength={14}
                    className="text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="appointment_date" className="text-sm font-medium text-slate-700 mb-2 block">
                    Appointment Date *
                  </Label>
                  <Input
                    id="appointment_date"
                    name="appointment_date"
                    type="date"
                    value={lookupData.appointment_date}
                    onChange={handleLookupChange}
                    className="text-base"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-5 sm:py-6 text-base sm:text-lg font-semibold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Finding...
                    </>
                  ) : (
                    'Find Appointment'
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* Step 2: Choose Action */}
          {step === 2 && !action && appointment && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-4">Appointment Found</h2>
              
              <div className="bg-slate-50 rounded-md p-4 mb-6">
                <p className="text-sm text-slate-600 mb-1"><strong>Name:</strong> {appointment.firstname} {appointment.surname}</p>
                <p className="text-sm text-slate-600 mb-1"><strong>Location:</strong> {appointment.location}</p>
                <p className="text-sm text-slate-600"><strong>Date:</strong> {format(new Date(appointment.appointment_date), 'EEEE, MMMM d, yyyy')}</p>
              </div>

              <p className="text-slate-700 mb-6">What would you like to do?</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button
                  onClick={() => {
                    setAction('modify');
                    checkDisabledDates(newLocation);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6"
                >
                  <Edit className="w-5 h-5 mr-2" />
                  Modify Appointment
                </Button>
                <Button
                  onClick={handleCancel}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-6"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 mr-2" />
                      Cancel Appointment
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Modify Form */}
          {step === 2 && action === 'modify' && appointment && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-6">Modify Appointment</h2>

              <div className="space-y-6">
                {/* Location Selection */}
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-3 block">
                    Select New Location
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div
                      onClick={() => {
                        setNewLocation('Abu Dhabi');
                        checkDisabledDates('Abu Dhabi');
                        setNewDate(null);
                      }}
                      className={`cursor-pointer rounded-lg border-2 p-4 ${
                        newLocation === 'Abu Dhabi'
                          ? 'border-amber-500 ring-2 ring-amber-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <MapPin className="w-5 h-5 text-amber-600 mb-2" />
                      <h3 className="font-semibold text-slate-900">Abu Dhabi</h3>
                      <p className="text-xs text-slate-600">200 slots/day</p>
                    </div>
                    <div
                      onClick={() => {
                        setNewLocation('Dubai');
                        checkDisabledDates('Dubai');
                        setNewDate(null);
                      }}
                      className={`cursor-pointer rounded-lg border-2 p-4 ${
                        newLocation === 'Dubai'
                          ? 'border-amber-500 ring-2 ring-amber-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <MapPin className="w-5 h-5 text-amber-600 mb-2" />
                      <h3 className="font-semibold text-slate-900">Dubai</h3>
                      <p className="text-xs text-slate-600">100 slots/day</p>
                    </div>
                  </div>
                </div>

                {/* Date Selection */}
                {newLocation && (
                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-3 block">
                      Select New Date
                    </Label>
                    <div className="flex justify-center">
                      <CalendarComponent
                        mode="single"
                        selected={newDate}
                        onSelect={setNewDate}
                        disabled={disabledMatcher}
                        fromDate={new Date()}
                        className="rounded-md border shadow"
                      />
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-4 text-center">
                      Available: Monday to Thursday
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    onClick={() => setAction('')}
                    variant="outline"
                    className="w-full sm:w-1/3"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleModifySubmit}
                    disabled={loading || !newDate}
                    className="w-full sm:w-2/3 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Confirm Modification'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
        
        {/* Help Section */}
        {!completed && (
          <div className="mt-6 text-center text-sm text-slate-600">
            <p>Need help? Contact us at <a href="mailto:paul.kasawuli@nira.go.ug" className="text-amber-600 hover:text-amber-700 font-medium">paul.kasawuli@nira.go.ug</a></p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ManageAppointment;
