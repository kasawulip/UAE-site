import { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { XCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CancelAppointment = () => {
  const [formData, setFormData] = useState({
    nin: '',
    appointment_date: ''
  });
  const [loading, setLoading] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelledInfo, setCancelledInfo] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nin || !formData.appointment_date) {
      toast.error('Please enter both NIN and appointment date');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.delete(`${API}/appointments/cancel`, {
        params: {
          nin: formData.nin,
          appointment_date: formData.appointment_date
        }
      });
      
      setCancelledInfo(response.data.cancelled_appointment);
      setCancelled(true);
      toast.success('Appointment cancelled successfully');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to cancel appointment';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (cancelled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Appointment Cancelled</h2>
          <p className="text-slate-600 mb-6">
            Your appointment has been successfully cancelled.
          </p>
          {cancelledInfo && (
            <div className="bg-slate-50 rounded-md p-4 mb-6 text-left">
              <p className="text-sm text-slate-600 mb-1"><strong>Name:</strong> {cancelledInfo.name}</p>
              <p className="text-sm text-slate-600 mb-1"><strong>Location:</strong> {cancelledInfo.location}</p>
              <p className="text-sm text-slate-600"><strong>Date:</strong> {cancelledInfo.date}</p>
            </div>
          )}
          <div className="space-y-3">
            <Button 
              onClick={() => navigate('/')} 
              className="w-full bg-slate-900 hover:bg-slate-800"
              data-testid="book-new-appointment-btn"
            >
              Book New Appointment
            </Button>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="w-full"
              data-testid="cancel-another-btn"
            >
              Cancel Another Appointment
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-900 rounded-md flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Cancel Appointment</h1>
                <p className="text-sm text-slate-600">National ID Issuance</p>
              </div>
            </div>
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="border-slate-300"
              data-testid="back-to-home-btn"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <XCircle className="w-8 h-8 text-red-600" />
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Cancel Your Appointment</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Enter your NIN and appointment date to cancel
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Once cancelled, your appointment slot will be released and made available to others. 
                You can book a new appointment anytime.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" data-testid="cancel-form">
              <div>
                <Label htmlFor="nin" className="text-sm font-medium text-slate-700 mb-2 block">
                  NIN Number *
                </Label>
                <Input
                  id="nin"
                  name="nin"
                  value={formData.nin}
                  onChange={handleChange}
                  placeholder="Enter your 14-character NIN (e.g., CM12345678901A)"
                  maxLength={14}
                  data-testid="cancel-nin-input"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Must be 14 characters starting with CM or CF
                </p>
              </div>

              <div>
                <Label htmlFor="appointment_date" className="text-sm font-medium text-slate-700 mb-2 block">
                  Appointment Date *
                </Label>
                <Input
                  id="appointment_date"
                  name="appointment_date"
                  type="date"
                  value={formData.appointment_date}
                  onChange={handleChange}
                  data-testid="cancel-date-input"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold"
                data-testid="cancel-submit-btn"
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
            </form>
          </div>

          {/* Help Text */}
          <div className="mt-6 text-center text-sm text-slate-600">
            <p>Need help? Contact us at support@nira.gov</p>
            <p className="mt-2">
              Want to reschedule instead? <button onClick={() => navigate('/')} className="text-amber-600 hover:text-amber-700 font-medium">Book a new appointment</button>
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default CancelAppointment;
