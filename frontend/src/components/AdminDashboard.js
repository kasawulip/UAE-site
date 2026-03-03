import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Calendar, MapPin, Mail, Phone, User, ShieldCheck, Loader2, Download, Filter, Search, LogOut, FileSpreadsheet, FileText, XCircle, CheckCircle, Clock, BarChart3 } from 'lucide-react';
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [adminInfo, setAdminInfo] = useState(null);
  const [dailySummary, setDailySummary] = useState(null);
  const [summaryDate, setSummaryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showDailySummary, setShowDailySummary] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
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

  // Update appointment status
  const handleUpdateStatus = async (appointment, newStatus) => {
    if (adminInfo?.role === 'viewer') {
      toast.error('Viewers cannot update appointment status');
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(
        `${API}/admin/appointments/status`,
        { appointment_id: appointment.id, status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`Appointment marked as ${newStatus}`);
      await fetchAppointments(token);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
  };

  // Fetch daily summary
  const fetchDailySummary = async (date) => {
    setSummaryLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API}/admin/daily-summary?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDailySummary(response.data);
      setShowDailySummary(true);
    } catch (error) {
      console.error('Error fetching daily summary:', error);
      toast.error('Failed to fetch daily summary');
    } finally {
      setSummaryLoading(false);
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
    
    // Status filter
    const statusMatch = statusFilter === 'all' || apt.status === statusFilter;
    
    return locationMatch && dateMatch && searchMatch && statusMatch;
  });

  const stats = {
    total: appointments.length,
    abuDhabi: appointments.filter(apt => apt.location === 'Abu Dhabi').length,
    dubai: appointments.filter(apt => apt.location === 'Dubai').length,
    filtered: filteredAppointments.length,
    completed: appointments.filter(apt => apt.status === 'completed').length,
    pending: appointments.filter(apt => apt.status !== 'completed').length
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4" data-testid="stat-total">
              <p className="text-xs font-medium text-slate-600 mb-1">Total Appointments</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4" data-testid="stat-abu-dhabi">
              <p className="text-xs font-medium text-slate-600 mb-1">Abu Dhabi</p>
              <p className="text-2xl font-bold text-slate-900">{stats.abuDhabi}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4" data-testid="stat-dubai">
              <p className="text-xs font-medium text-slate-600 mb-1">Dubai</p>
              <p className="text-2xl font-bold text-slate-900">{stats.dubai}</p>
            </div>
            <div className="bg-green-50 rounded-lg border border-green-200 shadow-sm p-4" data-testid="stat-completed">
              <p className="text-xs font-medium text-green-700 mb-1">Completed</p>
              <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-200 shadow-sm p-4" data-testid="stat-pending">
              <p className="text-xs font-medium text-amber-700 mb-1">Pending</p>
              <p className="text-2xl font-bold text-amber-700">{stats.pending}</p>
            </div>
          </div>

          {/* Daily Summary Panel */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-600" />
                Daily Booking & Slot Summary
              </h3>
              {dailySummary && (
                <Button
                  onClick={() => setShowDailySummary(!showDailySummary)}
                  variant="outline"
                  size="sm"
                  className="border-slate-300"
                >
                  {showDailySummary ? 'Hide' : 'Show'} Details
                </Button>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm text-slate-600">Select Date:</Label>
                <Input
                  type="date"
                  value={summaryDate}
                  onChange={(e) => setSummaryDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button
                onClick={() => fetchDailySummary(summaryDate)}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                disabled={summaryLoading}
              >
                {summaryLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Get Summary'
                )}
              </Button>
            </div>

            {showDailySummary && dailySummary && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Abu Dhabi Summary */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <h4 className="font-semibold text-slate-900 mb-3">Abu Dhabi</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Bookings:</span>
                        <span className="font-medium">{dailySummary.abu_dhabi.total_bookings}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">Completed:</span>
                        <span className="font-medium text-green-600">{dailySummary.abu_dhabi.completed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-600">Pending:</span>
                        <span className="font-medium text-amber-600">{dailySummary.abu_dhabi.pending}</span>
                      </div>
                      <hr className="border-slate-300" />
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Slots:</span>
                        <span className="font-medium">{dailySummary.abu_dhabi.total_slots}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Available:</span>
                        <span className="font-bold text-blue-600">{dailySummary.abu_dhabi.available_slots}</span>
                      </div>
                    </div>
                  </div>

                  {/* Dubai Summary */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <h4 className="font-semibold text-slate-900 mb-3">Dubai</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Bookings:</span>
                        <span className="font-medium">{dailySummary.dubai.total_bookings}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">Completed:</span>
                        <span className="font-medium text-green-600">{dailySummary.dubai.completed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-600">Pending:</span>
                        <span className="font-medium text-amber-600">{dailySummary.dubai.pending}</span>
                      </div>
                      <hr className="border-slate-300" />
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Slots:</span>
                        <span className="font-medium">{dailySummary.dubai.total_slots}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Available:</span>
                        <span className="font-bold text-blue-600">{dailySummary.dubai.available_slots}</span>
                      </div>
                    </div>
                  </div>

                  {/* Combined Totals */}
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <h4 className="font-semibold text-slate-900 mb-3">Combined Totals</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Bookings:</span>
                        <span className="font-bold">{dailySummary.totals.total_bookings}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">Completed:</span>
                        <span className="font-bold text-green-600">{dailySummary.totals.completed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-600">Pending:</span>
                        <span className="font-bold text-amber-600">{dailySummary.totals.pending}</span>
                      </div>
                      <hr className="border-amber-300" />
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Slots:</span>
                        <span className="font-bold">{dailySummary.totals.total_slots}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Available:</span>
                        <span className="font-bold text-blue-600">{dailySummary.totals.available_slots}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
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

            {/* Status Filter */}
            <div className="mt-4">
              <Label className="text-sm font-medium text-slate-700 mb-3 block">Filter by Status</Label>
              <div className="flex gap-3">
                <Button
                  onClick={() => setStatusFilter('all')}
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  className={statusFilter === 'all' ? 'bg-slate-900 text-white' : ''}
                  data-testid="status-filter-all"
                >
                  All
                </Button>
                <Button
                  onClick={() => setStatusFilter('pending')}
                  variant={statusFilter === 'pending' ? 'default' : 'outline'}
                  className={statusFilter === 'pending' ? 'bg-amber-600 text-white' : 'border-amber-300 text-amber-700'}
                  data-testid="status-filter-pending"
                >
                  <Clock className="w-4 h-4 mr-1" />
                  Pending
                </Button>
                <Button
                  onClick={() => setStatusFilter('completed')}
                  variant={statusFilter === 'completed' ? 'default' : 'outline'}
                  className={statusFilter === 'completed' ? 'bg-green-600 text-white' : 'border-green-300 text-green-700'}
                  data-testid="status-filter-completed"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Completed
                </Button>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">NIN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Status</th>
                    {adminInfo?.role !== 'viewer' && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={adminInfo?.role !== 'viewer' ? 7 : 6} className="px-6 py-12 text-center text-slate-500">
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
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 text-amber-600 mr-1" />
                            <span className="text-sm font-medium text-slate-900">{appointment.location}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 text-slate-400 mr-1" />
                            <span className="text-sm text-slate-600">
                              {format(new Date(appointment.appointment_date), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {appointment.status === 'completed' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </span>
                          )}
                        </td>
                        {adminInfo?.role !== 'viewer' && (
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex gap-2">
                              {appointment.status !== 'completed' ? (
                                <Button
                                  onClick={() => handleUpdateStatus(appointment, 'completed')}
                                  variant="outline"
                                  size="sm"
                                  className="border-green-300 text-green-600 hover:bg-green-50"
                                  data-testid={`complete-btn-${index}`}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Complete
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => handleUpdateStatus(appointment, 'pending')}
                                  variant="outline"
                                  size="sm"
                                  className="border-amber-300 text-amber-600 hover:bg-amber-50"
                                  data-testid={`revert-btn-${index}`}
                                >
                                  <Clock className="w-4 h-4 mr-1" />
                                  Revert
                                </Button>
                              )}
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
                            </div>
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
