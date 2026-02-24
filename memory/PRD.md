# National ID Issuance Appointment System - PRD

## Original Problem Statement
Build a full-stack web-based appointment system for National ID Issuance. Applicants provide personal information (Surname, FirstName, NIN, Phone, Email) and select a pickup location (Abu Dhabi or Dubai). The system includes a calendar for date selection, admin portal for managing appointments, and email notifications.

## Core Requirements

### Public Booking Portal
- Form fields: Surname, FirstName, NIN, Phone, Email, Location, Date
- All fields mandatory
- NIN validation: 14 characters, starts with 'CM' or 'CF'
- UAE Phone Number validation
- Email format validation
- Name fields accept only alphabets

### Calendar & Slots
- **Available days**: Monday to Friday (9am-3pm)
- **Disabled**: Saturdays, Sundays, and Public Holidays (Uganda & UAE)
- **Daily slot limits**:
  - Abu Dhabi: 150 slots
  - Dubai: 80 slots
- Full days automatically disabled
- NIN must be unique for a given day

### Admin Portal
- JWT-based authentication
- Two roles: 'admin' (full control) and 'viewer' (read-only)
- View all appointments
- Filter by location and date
- Search by Name or NIN
- Export to Excel, CSV, and PDF

### User Appointment Management
- Lookup appointment using NIN and date
- Cancel or modify existing appointments
- Public-facing (no login required)

### Email Notifications
- Confirmation emails sent via Resend
- Custom templates by location:
  - Abu Dhabi: "Uganda Embassy, Abu Dhabi"
  - Dubai: "Uganda Consulate, Dubai"
- Support email: paul.kasawuli@nira.go.ug

### UI/UX
- Modern, minimal, mobile-responsive design
- Fingerprint/iris background image on homepage
- Navigation buttons for Admin Login and Manage Appointment

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn/UI, date-fns, xlsx, jspdf
- **Backend**: FastAPI, Pydantic, PyJWT
- **Database**: MongoDB
- **Email**: Resend API

## What's Been Implemented

### Completed (as of February 2026)
- [x] Full appointment booking form with live validation
- [x] Calendar with Mon-Fri availability (excluding public holidays)
- [x] Slot limits: Abu Dhabi (150), Dubai (80)
- [x] Admin authentication with JWT (admin/viewer roles)
- [x] Admin dashboard with search, filter, and export (Excel, CSV, PDF)
- [x] User self-service portal (modify/cancel appointments)
- [x] Resend email integration with custom templates
- [x] Mobile-responsive UI with fingerprint background
- [x] Uganda and UAE public holidays (2024-2026) disabled in calendar
- [x] Code cleanup - removed obsolete CancelAppointment.js

## API Endpoints
- `POST /api/appointments` - Create new appointment
- `DELETE /api/appointments/cancel` - Cancel appointment (public)
- `GET /api/appointments/lookup` - Public lookup by NIN and date
- `GET /api/slots/{location}/{date}` - Get slot availability
- `POST /api/admin/login` - Admin login (returns JWT)
- `GET /api/admin/appointments` - Get all appointments (protected)
- `POST /api/admin/appointments/reject` - Reject appointment and send email (admin/superadmin only)
- `GET /api/admin/users` - List all admins (superadmin only)
- `POST /api/admin/users` - Create admin user (superadmin only)
- `DELETE /api/admin/users/{username}` - Delete admin user (superadmin only)

## Auto-Created Admin Accounts

The application automatically creates the following admin accounts on startup if they don't exist. This ensures accounts are available in fresh production deployments.

### Super Admin Account
| Name | Username | Password | Role |
|------|----------|----------|------|
| Paul Kasawuli | paul.kasawuli | SuperAdmin@2026 | superadmin |

**Superadmin Capabilities:**
- View all admin users (`GET /api/admin/users`)
- Create new admin/viewer users (`POST /api/admin/users`)
- Delete admin/viewer users (`DELETE /api/admin/users/{username}`)

### Staff Admin Accounts (Role: admin)
| Name | Username | Password |
|------|----------|----------|
| Ashah Nabbanja | ashah.nabbanja | Admin@2026 |
| Erina Zalwango | erina.zalwango | Admin@2026 |
| Ceasar Kotevu | ceasar.kotevu | Admin@2026 |
| Arthur Magooba | arthur.magooba | Admin@2026 |

### Demo Accounts
| Username | Password | Role |
|----------|----------|------|
| admin | password | admin |
| viewer | password | viewer |

**Note:** These accounts are defined in `backend/server.py` in the `DEFAULT_ADMIN_ACCOUNTS` list and are created automatically via the `startup_create_default_admins()` function.

## Key Files
- `backend/server.py` - All backend API logic
- `frontend/src/components/AppointmentForm.js` - Booking form
- `frontend/src/components/AdminDashboard.js` - Admin panel
- `frontend/src/components/ManageAppointment.js` - User self-service
- `frontend/src/components/AdminLogin.js` - Admin login page

## Future Enhancements (Backlog)
- [ ] Super-admin UI for managing admin/viewer accounts
- [ ] SMS notifications option
- [ ] Appointment reminders (email 24h before)
- [ ] Analytics dashboard for appointment trends
