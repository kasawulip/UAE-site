import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Calendar, MapPin, Mail, Phone, User, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const response = await axios.get(`${API}/appointments`);
      setAppointments(response.data);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAppointments = filter === 'all' 
    ? appointments 
    : appointments.filter(apt => apt.location === filter);

  const stats = {
    total: appointments.length,
    abuDhabi: appointments.filter(apt => apt.location === 'Abu Dhabi').length,
    dubai: appointments.filter(apt => apt.location === 'Dubai').length
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-900 rounded-md flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Admin Dashboard</h1>
                <p className="text-sm text-slate-600">Manage Appointments</p>
              </div>
            </div>
            <Button 
              onClick={() => navigate('/')} 
              variant="outline"
              className="border-slate-300"
              data-testid="back-to-booking-btn"
            >
              Back to Booking
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6" data-testid="stat-total">
              <p className="text-sm font-medium text-slate-600 mb-2">Total Appointments</p>
              <p className="text-4xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6" data-testid="stat-abu-dhabi">
              <p className="text-sm font-medium text-slate-600 mb-2">Abu Dhabi</p>
              <p className="text-4xl font-bold text-slate-900">{stats.abuDhabi}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6" data-testid="stat-dubai">
              <p className="text-sm font-medium text-slate-600 mb-2">Dubai</p>
              <p className="text-4xl font-bold text-slate-900">{stats.dubai}</p>
            </div>
          </div>

          <div className="flex gap-3 mb-6">
            <Button
              onClick={() => setFilter('all')}
              variant={filter === 'all' ? 'default' : 'outline'}
              className={filter === 'all' ? 'bg-slate-900 text-white' : ''}
              data-testid="filter-all"
            >
              All Locations
            </Button>
            <Button
              onClick={() => setFilter('Abu Dhabi')}
              variant={filter === 'Abu Dhabi' ? 'default' : 'outline'}
              className={filter === 'Abu Dhabi' ? 'bg-slate-900 text-white' : ''}
              data-testid="filter-abu-dhabi"
            >
              Abu Dhabi
            </Button>
            <Button
              onClick={() => setFilter('Dubai')}
              variant={filter === 'Dubai' ? 'default' : 'outline'}
              className={filter === 'Dubai' ? 'bg-slate-900 text-white' : ''}
              data-testid="filter-dubai"
            >
              Dubai
            </Button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="appointments-table">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">NIN</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                        No appointments found
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((appointment, index) => (
                      <motion.tr
                        key={appointment.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-slate-50"
                        data-testid={`appointment-row-${index}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <User className="w-4 h-4 text-slate-400 mr-2" />
                            <div className="text-sm font-medium text-slate-900">
                              {appointment.firstname} {appointment.surname}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {appointment.nin}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-600">
                            <div className="flex items-center mb-1">
                              <Phone className="w-3 h-3 mr-1" />
                              {appointment.phone}
                            </div>
                            <div className="flex items-center">
                              <Mail className="w-3 h-3 mr-1" />
                              {appointment.email}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 text-amber-600 mr-1" />
                            <span className="text-sm font-medium text-slate-900">{appointment.location}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 text-slate-400 mr-1" />
                            <span className="text-sm text-slate-600">
                              {format(new Date(appointment.appointment_date), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default AdminDashboard;
