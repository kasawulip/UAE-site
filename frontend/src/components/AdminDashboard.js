import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Calendar, MapPin, Mail, Phone, User, ShieldCheck, Loader2, Download, Filter, Search, LogOut, FileSpreadsheet, FileText, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [adminInfo, setAdminInfo] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('admin_token');
    const username = localStorage.getItem('admin_username');
    const role = localStorage.getItem('admin_role');
    
    if (!token) {
      navigate('/admin/login');
      return;
    }

    setAdminInfo({ username, role });
    await fetchAppointments(token);
  };

  const fetchAppointments = async (token) => {
    try {
      // Fetch all appointments (limit=0 means no limit)
      const response = await axios.get(`${API}/appointments?limit=0`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointments(response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Session expired. Please login again');
        handleLogout();
      } else {
        console.error('Error fetching appointments:', error);
        toast.error('Failed to fetch appointments');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
    localStorage.removeItem('admin_role');
    navigate('/admin/login');
  };

  // Reject appointment function
  const handleRejectAppointment = async (appointment) => {
    if (adminInfo?.role === 'viewer') {
      toast.error('Viewers cannot reject appointments');
      return;
    }

    const confirmReject = window.confirm(
      `Are you sure you want to reject the appointment for ${appointment.firstname} ${appointment.surname}?\n\nThis will send a rejection email to ${appointment.email} informing them that their National ID card is not yet available.`
    );

    if (!confirmReject) return;

    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.post(
        `${API}/admin/appointments/reject`,
        { appointment_id: appointment.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.email_sent) {
        toast.success(`Appointment rejected. Rejection email sent to ${appointment.email}`);
      } else {
        toast.warning('Appointment rejected but email could not be sent');
      }

      // Refresh appointments list
      await fetchAppointments(token);
    } catch (error) {
      console.error('Error rejecting appointment:', error);
      toast.error(error.response?.data?.detail || 'Failed to reject appointment');
    }
  };

  // Apply filters and search
  const filteredAppointments = appointments.filter(apt => {
    // Location filter
    const locationMatch = filter === 'all' || apt.location === filter;
    
    // Date filter
    const dateMatch = !dateFilter || apt.appointment_date === dateFilter;
    
    // Search filter (name or NIN)
    const searchMatch = !searchQuery || 
      `${apt.firstname} ${apt.surname}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      apt.nin.toLowerCase().includes(searchQuery.toLowerCase());
    
    return locationMatch && dateMatch && searchMatch;
  });

  const stats = {
    total: appointments.length,
    abuDhabi: appointments.filter(apt => apt.location === 'Abu Dhabi').length,
    dubai: appointments.filter(apt => apt.location === 'Dubai').length,
    filtered: filteredAppointments.length
  };

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredAppointments.map(apt => ({
      'Name': `${apt.firstname} ${apt.surname}`,
      'NIN': apt.nin,
      'Phone': apt.phone,
      'Email': apt.email,
      'Location': apt.location,
      'Appointment Date': format(new Date(apt.appointment_date), 'MMM d, yyyy'),
      'Booked On': format(new Date(apt.created_at), 'MMM d, yyyy HH:mm')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 30 },
      { wch: 12 }, { wch: 15 }, { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Appointments');

    let filename = 'National_ID_Appointments';
    if (filter !== 'all') filename += `_${filter.replace(' ', '_')}`;
    if (dateFilter) filename += `_${dateFilter}`;
    filename += `_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

    XLSX.writeFile(wb, filename);
    toast.success('Excel file downloaded successfully');
  };

  // Export to CSV
  const exportToCSV = () => {
    const exportData = filteredAppointments.map(apt => ({
      'Name': `${apt.firstname} ${apt.surname}`,
      'NIN': apt.nin,
      'Phone': apt.phone,
      'Email': apt.email,
      'Location': apt.location,
      'Appointment Date': format(new Date(apt.appointment_date), 'MMM d, yyyy'),
      'Booked On': format(new Date(apt.created_at), 'MMM d, yyyy HH:mm')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    let filename = 'National_ID_Appointments';
    if (filter !== 'all') filename += `_${filter.replace(' ', '_')}`;
    if (dateFilter) filename += `_${dateFilter}`;
    filename += `_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('CSV file downloaded successfully');
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('National ID Appointments', 14, 20);
    
    // Info
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 14, 28);
    doc.text(`Total Records: ${filteredAppointments.length}`, 14, 34);
    
    if (filter !== 'all') {
      doc.text(`Location: ${filter}`, 14, 40);
    }
    if (dateFilter) {
      doc.text(`Date: ${format(new Date(dateFilter), 'MMM d, yyyy')}`, 14, filter !== 'all' ? 46 : 40);
    }
    
    // Table
    const tableData = filteredAppointments.map(apt => [
      `${apt.firstname} ${apt.surname}`,
      apt.nin,
      apt.phone,
      apt.email,
      apt.location,
      format(new Date(apt.appointment_date), 'MMM d, yyyy')
    ]);

    doc.autoTable({
      startY: filter !== 'all' || dateFilter ? 52 : 40,
      head: [['Name', 'NIN', 'Phone', 'Email', 'Location', 'Date']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
    });

    let filename = 'National_ID_Appointments';
    if (filter !== 'all') filename += `_${filter.replace(' ', '_')}`;
    if (dateFilter) filename += `_${dateFilter}`;
    filename += `_${format(new Date(), 'yyyy-MM-dd')}.pdf`;

    doc.save(filename);
    toast.success('PDF file downloaded successfully');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 relative">
      {/* Fingerprint Background */}
      <div className="homepage-background"></div>
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-900 rounded-md flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Admin Dashboard</h1>
                <p className="text-sm text-slate-600">
                  {adminInfo?.username} ({adminInfo?.role})
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={() => navigate('/')} 
                variant="outline"
                className="border-slate-300"
                data-testid="back-to-booking-btn"
              >
                Back to Booking
              </Button>
              <Button 
                onClick={handleLogout} 
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Stats Cards */}
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

          {/* Search Box */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900">Search Appointments</h3>
            </div>
            <Input
              type="text"
              placeholder="Search by name or NIN number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
              data-testid="search-input"
            />
          </div>

          {/* Filters Section */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900">Filter Appointments</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Location Filter */}
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-3 block">Filter by Location</Label>
                <div className="flex gap-3">
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
              </div>

              {/* Date Filter */}
              <div>
                <Label htmlFor="date-filter" className="text-sm font-medium text-slate-700 mb-3 block">
                  Filter by Date
                </Label>
                <div className="flex gap-3 items-center">
                  <Input
                    id="date-filter"
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="flex-1"
                    data-testid="date-filter-input"
                  />
                  {dateFilter && (
                    <Button
                      onClick={() => setDateFilter('')}
                      variant="outline"
                      size="sm"
                      data-testid="clear-date-filter"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Export and Results Summary */}
            <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-600">
                  Showing <span className="font-semibold text-slate-900">{stats.filtered}</span> of <span className="font-semibold text-slate-900">{stats.total}</span> appointments
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={exportToExcel}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={filteredAppointments.length === 0}
                  data-testid="export-excel-btn"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel
                </Button>
                <Button
                  onClick={exportToCSV}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={filteredAppointments.length === 0}
                  data-testid="export-csv-btn"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  CSV
                </Button>
                <Button
                  onClick={exportToPDF}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={filteredAppointments.length === 0}
                  data-testid="export-pdf-btn"
                >
                  <Download className="w-4 h-4 mr-2" />
                  PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Filter Badges */}
          {(filter !== 'all' || dateFilter || searchQuery) && (
            <div className="flex gap-2 mb-4">
              {filter !== 'all' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
                  Location: {filter}
                </span>
              )}
              {dateFilter && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  Date: {format(new Date(dateFilter), 'MMM d, yyyy')}
                </span>
              )}
              {searchQuery && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                  Search: {searchQuery}
                </span>
              )}
            </div>
          )}

          {/* Appointments Table */}
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
                    {adminInfo?.role !== 'viewer' && (
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={adminInfo?.role !== 'viewer' ? 6 : 5} className="px-6 py-12 text-center text-slate-500">
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
                        {adminInfo?.role !== 'viewer' && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Button
                              onClick={() => handleRejectAppointment(appointment)}
                              variant="outline"
                              size="sm"
                              className="border-red-300 text-red-600 hover:bg-red-50"
                              data-testid={`reject-btn-${index}`}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </td>
                        )}
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
