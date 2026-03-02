from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import asyncio
import resend
import re
from passlib.context import CryptContext
from jose import JWTError, jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Security
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Resend configuration
resend.api_key = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define Models
class AppointmentCreate(BaseModel):
    surname: str
    firstname: str
    nin: str
    phone: str
    email: EmailStr
    location: str
    appointment_date: str
    
    @field_validator('surname', 'firstname')
    @classmethod
    def validate_name(cls, v, info):
        if not v or not v.strip():
            raise ValueError(f'{info.field_name} is required')
        if not re.match(r'^[A-Za-z\s]+$', v):
            raise ValueError(f'{info.field_name} must contain only letters')
        return v.strip()
    
    @field_validator('nin')
    @classmethod
    def validate_nin(cls, v):
        if not v or not v.strip():
            raise ValueError('NIN is required')
        v = v.strip()
        if len(v) != 14:
            raise ValueError('NIN must be exactly 14 characters')
        if not v.startswith('CM') and not v.startswith('CF'):
            raise ValueError('NIN must start with CM or CF')
        return v
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if not v or not v.strip():
            raise ValueError('Phone number is required')
        
        # Remove spaces for validation
        phone_clean = v.replace(' ', '')
        digits_only = re.sub(r'\D', '', phone_clean)
        
        # UAE phone validation
        if phone_clean.startswith('+971'):
            if len(digits_only) != 12:
                raise ValueError('UAE phone must be in format +971XXXXXXXXX (12 digits)')
        elif phone_clean.startswith('971'):
            if len(digits_only) != 12:
                raise ValueError('UAE phone must be in format 971XXXXXXXXX (12 digits)')
        elif phone_clean.startswith('05') or phone_clean.startswith('04') or phone_clean.startswith('02'):
            if len(digits_only) != 10:
                raise ValueError('UAE phone must be 10 digits (e.g., 05XXXXXXXX)')
        else:
            raise ValueError('Enter valid UAE phone number (+971XXXXXXXXX or 05XXXXXXXX)')
        
        return v

class Appointment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    surname: str
    firstname: str
    nin: str
    phone: str
    email: str
    location: str
    appointment_date: str
    status: str = "pending"  # pending, completed
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SlotAvailability(BaseModel):
    location: str
    date: str
    available_slots: int
    total_slots: int

# Admin Models
class AdminUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: EmailStr
    hashed_password: str
    role: str = "viewer"  # viewer, admin, or superadmin
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AdminCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "viewer"

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminListResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    created_at: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str

# Auth helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        admin = await db.admins.find_one({"username": username}, {"_id": 0})
        if admin is None:
            raise HTTPException(status_code=401, detail="Admin not found")
        return AdminUser(**admin)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Helper function to send email
async def send_confirmation_email(recipient_email: str, firstname: str, surname: str, location: str, appointment_date: str):
    # Format date properly
    from datetime import datetime
    date_obj = datetime.strptime(appointment_date, '%Y-%m-%d')
    formatted_date = date_obj.strftime('%A, %B %d, %Y')
    
    # Customize message based on location
    if location == "Abu Dhabi":
        venue = "Uganda Embassy, Abu Dhabi"
    else:  # Dubai
        venue = "Uganda Consulate, Dubai"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #0F172A; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9f9f9; }}
            .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            .highlight {{ color: #D97706; font-weight: bold; }}
            .info-box {{ background-color: white; border-left: 4px solid #D97706; padding: 15px; margin: 20px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>National ID Appointment Confirmation</h1>
            </div>
            <div class="content">
                <p>Dear <strong>{firstname} {surname}</strong>,</p>
                
                <p>Thank you for booking your National ID Issuance Appointment.</p>
                
                <div class="info-box">
                    <p style="margin: 5px 0;"><strong>Venue:</strong> {venue}</p>
                    <p style="margin: 5px 0;"><strong>Date:</strong> <span class="highlight">{formatted_date}</span></p>
                </div>
                
                <p><strong>Please note that our work hours are between 9am to 1pm</strong></p>
                
                <p>If you need to reschedule, you can go back to the booking page and choose another date.</p>
                
                <p style="margin-top: 30px;">Warm regards,<br>
                <strong>NIRA Diaspora Desk for Middle East</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [recipient_email],
        "subject": "National ID Appointment Confirmation - NIRA",
        "html": html_content
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return False

# Helper function to send rejection email
async def send_rejection_email(recipient_email: str, firstname: str, surname: str):
    """Send rejection email when admin rejects an appointment"""
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.8; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #0F172A; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 30px; background-color: #f9f9f9; }}
            .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>National ID Card Collection</h1>
            </div>
            <div class="content">
                <p>Dear Sir/Madam,</p>
                
                <p>Thank you for your appointment request regarding the collection of your National Identification Card.</p>
                
                <p>We regret to inform you that your card is not yet available for collection at this time. Please be assured that the processing of your card is ongoing and is being actively worked upon.</p>
                
                <p>We kindly request that you check again after one (1) month to confirm its availability. Once the card is ready, you will be able to book a new appointment for collection.</p>
                
                <p>We appreciate your patience and understanding and thank you for your continued cooperation.</p>
                
                <p style="margin-top: 30px;">Yours faithfully,</p>
                <p><strong>Embassy of the Republic of Uganda, UAE</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message. For inquiries, please contact paul.kasawuli@nira.go.ug</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [recipient_email],
        "subject": "National ID Card Collection - Update on Your Appointment",
        "html": html_content
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Rejection email sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send rejection email: {str(e)}")
        return False

# Routes
@api_router.get("/")
async def root():
    return {"message": "National ID Appointment System API"}

# Admin Authentication Routes
@api_router.post("/admin/register", response_model=AdminUser)
async def register_admin(admin: AdminCreate):
    """Register a new admin (for initial setup only)"""
    # Check if username exists
    existing = await db.admins.find_one({"username": admin.username}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Create admin
    admin_obj = AdminUser(
        username=admin.username,
        email=admin.email,
        hashed_password=get_password_hash(admin.password),
        role=admin.role
    )
    
    doc = admin_obj.model_dump()
    await db.admins.insert_one(doc)
    
    # Return without password
    return admin_obj

@api_router.post("/admin/login", response_model=Token)
async def login_admin(credentials: AdminLogin):
    """Admin login"""
    admin = await db.admins.find_one({"username": credentials.username}, {"_id": 0})
    
    if not admin or not verify_password(credentials.password, admin['hashed_password']):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": admin['username'], "role": admin['role']},
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=admin['role'],
        username=admin['username']
    )

@api_router.get("/admin/me", response_model=AdminUser)
async def get_current_admin_info(current_admin: AdminUser = Depends(get_current_admin)):
    """Get current admin info"""
    return current_admin

# Superadmin-only helper
async def require_superadmin(current_admin: AdminUser = Depends(get_current_admin)):
    """Require superadmin role for access"""
    if current_admin.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return current_admin

@api_router.get("/admin/users", response_model=List[AdminListResponse])
async def list_all_admins(current_admin: AdminUser = Depends(require_superadmin)):
    """List all admin users (superadmin only)"""
    admins = await db.admins.find({}, {"_id": 0, "hashed_password": 0}).to_list(100)
    return admins

@api_router.post("/admin/users", response_model=AdminListResponse)
async def create_admin_user(admin: AdminCreate, current_admin: AdminUser = Depends(require_superadmin)):
    """Create a new admin user (superadmin only)"""
    # Check if username exists
    existing = await db.admins.find_one({"username": admin.username}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Prevent creating another superadmin
    if admin.role == "superadmin":
        raise HTTPException(status_code=400, detail="Cannot create another superadmin")
    
    # Create admin
    admin_obj = AdminUser(
        username=admin.username,
        email=admin.email,
        hashed_password=get_password_hash(admin.password),
        role=admin.role
    )
    
    doc = admin_obj.model_dump()
    await db.admins.insert_one(doc)
    
    return AdminListResponse(
        id=admin_obj.id,
        username=admin_obj.username,
        email=admin_obj.email,
        role=admin_obj.role,
        created_at=admin_obj.created_at
    )

@api_router.delete("/admin/users/{username}")
async def delete_admin_user(username: str, current_admin: AdminUser = Depends(require_superadmin)):
    """Delete an admin user (superadmin only)"""
    # Cannot delete yourself
    if username == current_admin.username:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    # Check if user exists
    existing = await db.admins.find_one({"username": username}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Admin user not found")
    
    # Cannot delete another superadmin
    if existing.get('role') == 'superadmin':
        raise HTTPException(status_code=400, detail="Cannot delete a superadmin account")
    
    # Delete the admin
    result = await db.admins.delete_one({"username": username})
    
    if result.deleted_count == 1:
        return {"message": f"Admin user '{username}' deleted successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete admin user")

@api_router.get("/slots/{location}/{date}")
async def get_slot_availability(location: str, date: str):
    """Get available slots for a specific location and date"""
    # Define slot limits
    slot_limits = {
        "Abu Dhabi": 150,
        "Dubai": 80
    }
    
    if location not in slot_limits:
        raise HTTPException(status_code=400, detail="Invalid location")
    
    # Count existing appointments for this location and date
    count = await db.appointments.count_documents({
        "location": location,
        "appointment_date": date
    })
    
    total_slots = slot_limits[location]
    available_slots = max(0, total_slots - count)
    
    return SlotAvailability(
        location=location,
        date=date,
        available_slots=available_slots,
        total_slots=total_slots
    )

@api_router.post("/appointments", response_model=Appointment)
async def create_appointment(appointment: AppointmentCreate):
    """Create a new appointment"""
    # Validate location
    if appointment.location not in ["Abu Dhabi", "Dubai"]:
        raise HTTPException(status_code=400, detail="Invalid location. Must be 'Abu Dhabi' or 'Dubai'")
    
    # Check if NIN already has ANY active appointment in the system
    existing = await db.appointments.find_one({
        "nin": appointment.nin
    }, {"_id": 0})
    
    if existing:
        existing_date = existing.get('appointment_date', 'Unknown date')
        existing_location = existing.get('location', 'Unknown location')
        raise HTTPException(
            status_code=400, 
            detail=f"Booking rejected: You already have a confirmed appointment under this NIN. Your existing appointment is scheduled for {existing_date} at {existing_location}. Please cancel your existing appointment to make a new booking."
        )
    
    # Check slot availability
    slot_limits = {"Abu Dhabi": 150, "Dubai": 80}
    count = await db.appointments.count_documents({
        "location": appointment.location,
        "appointment_date": appointment.appointment_date
    })
    
    if count >= slot_limits[appointment.location]:
        raise HTTPException(
            status_code=400, 
            detail=f"No available slots for {appointment.location} on {appointment.appointment_date}"
        )
    
    # Create appointment object
    appointment_obj = Appointment(**appointment.model_dump())
    doc = appointment_obj.model_dump()
    
    # Save to database - unique index on NIN prevents duplicates even with concurrent requests
    try:
        await db.appointments.insert_one(doc)
    except DuplicateKeyError:
        # Race condition: another request created an appointment for this NIN
        existing = await db.appointments.find_one({"nin": appointment.nin}, {"_id": 0})
        existing_date = existing.get('appointment_date', 'Unknown date') if existing else 'Unknown date'
        existing_location = existing.get('location', 'Unknown location') if existing else 'Unknown location'
        raise HTTPException(
            status_code=400, 
            detail=f"Booking rejected: You already have a confirmed appointment under this NIN. Your existing appointment is scheduled for {existing_date} at {existing_location}. Please cancel your existing appointment to make a new booking."
        )
    
    # Send confirmation email
    await send_confirmation_email(
        recipient_email=appointment.email,
        firstname=appointment.firstname,
        surname=appointment.surname,
        location=appointment.location,
        appointment_date=appointment.appointment_date
    )
    
    return appointment_obj

@api_router.get("/appointments/lookup")
async def lookup_appointment(nin: str, appointment_date: str):
    """Public endpoint to lookup appointment by NIN and date (returns minimal info)"""
    if not nin or not appointment_date:
        raise HTTPException(status_code=400, detail="NIN and appointment date are required")
    
    appointment = await db.appointments.find_one({
        "nin": nin,
        "appointment_date": appointment_date
    }, {"_id": 0})
    
    if not appointment:
        raise HTTPException(
            status_code=404, 
            detail="No appointment found with this NIN for the specified date"
        )
    
    # Return appointment data
    return Appointment(**appointment)

@api_router.get("/appointments", response_model=List[Appointment])
async def get_appointments(
    current_admin: AdminUser = Depends(get_current_admin),
    skip: int = 0,
    limit: int = 0
):
    """Get all appointments (protected - admin only). Set limit=0 to get all."""
    if limit == 0:
        # Get all appointments (no limit)
        appointments = await db.appointments.find(
            {}, 
            {"_id": 0}
        ).sort("created_at", -1).to_list(None)
    else:
        # Apply pagination with max limit of 1000
        limit = min(limit, 1000)
        appointments = await db.appointments.find(
            {}, 
            {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return appointments

# Model for status update request
class UpdateStatusRequest(BaseModel):
    appointment_id: str
    status: str  # "pending" or "completed"

@api_router.put("/admin/appointments/status")
async def update_appointment_status(
    request: UpdateStatusRequest,
    current_admin: AdminUser = Depends(get_current_admin)
):
    """Update appointment status (admin only)"""
    # Only admin and superadmin can update status (not viewer)
    if current_admin.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot update appointment status")
    
    # Validate status
    if request.status not in ["pending", "completed"]:
        raise HTTPException(status_code=400, detail="Status must be 'pending' or 'completed'")
    
    # Update the appointment status
    result = await db.appointments.update_one(
        {"id": request.appointment_id},
        {"$set": {"status": request.status}}
    )
    
    if result.modified_count == 1:
        return {"message": f"Appointment status updated to '{request.status}'", "status": request.status}
    elif result.matched_count == 1:
        return {"message": "Status unchanged (already set to this value)", "status": request.status}
    else:
        raise HTTPException(status_code=404, detail="Appointment not found")

@api_router.get("/admin/daily-summary")
async def get_daily_summary(
    date: str,
    current_admin: AdminUser = Depends(get_current_admin)
):
    """Get daily booking summary with slot availability for a specific date"""
    slot_limits = {"Abu Dhabi": 150, "Dubai": 80}
    
    # Execute all count queries in parallel for better performance
    abu_dhabi_total, dubai_total, abu_dhabi_completed, dubai_completed = await asyncio.gather(
        db.appointments.count_documents({
            "location": "Abu Dhabi",
            "appointment_date": date
        }),
        db.appointments.count_documents({
            "location": "Dubai",
            "appointment_date": date
        }),
        db.appointments.count_documents({
            "location": "Abu Dhabi",
            "appointment_date": date,
            "status": "completed"
        }),
        db.appointments.count_documents({
            "location": "Dubai",
            "appointment_date": date,
            "status": "completed"
        })
    )
    
    return {
        "date": date,
        "abu_dhabi": {
            "total_bookings": abu_dhabi_total,
            "completed": abu_dhabi_completed,
            "pending": abu_dhabi_total - abu_dhabi_completed,
            "total_slots": slot_limits["Abu Dhabi"],
            "available_slots": slot_limits["Abu Dhabi"] - abu_dhabi_total
        },
        "dubai": {
            "total_bookings": dubai_total,
            "completed": dubai_completed,
            "pending": dubai_total - dubai_completed,
            "total_slots": slot_limits["Dubai"],
            "available_slots": slot_limits["Dubai"] - dubai_total
        },
        "totals": {
            "total_bookings": abu_dhabi_total + dubai_total,
            "completed": abu_dhabi_completed + dubai_completed,
            "pending": (abu_dhabi_total - abu_dhabi_completed) + (dubai_total - dubai_completed),
            "total_slots": slot_limits["Abu Dhabi"] + slot_limits["Dubai"],
            "available_slots": (slot_limits["Abu Dhabi"] - abu_dhabi_total) + (slot_limits["Dubai"] - dubai_total)
        }
    }

# Model for rejection request
class RejectAppointmentRequest(BaseModel):
    appointment_id: str
    
@api_router.post("/admin/appointments/reject")
async def reject_appointment(
    request: RejectAppointmentRequest,
    current_admin: AdminUser = Depends(get_current_admin)
):
    """Reject an appointment (admin only) - sends rejection email to applicant"""
    # Only admin and superadmin can reject (not viewer)
    if current_admin.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot reject appointments")
    
    # Find the appointment by ID
    appointment = await db.appointments.find_one({"id": request.appointment_id}, {"_id": 0})
    
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    # Delete the appointment
    result = await db.appointments.delete_one({"id": request.appointment_id})
    
    if result.deleted_count == 1:
        # Send rejection email to the applicant
        email_sent = await send_rejection_email(
            recipient_email=appointment['email'],
            firstname=appointment['firstname'],
            surname=appointment['surname']
        )
        
        return {
            "message": "Appointment rejected successfully",
            "email_sent": email_sent,
            "rejected_appointment": {
                "name": f"{appointment['firstname']} {appointment['surname']}",
                "nin": appointment['nin'],
                "email": appointment['email'],
                "location": appointment['location'],
                "date": appointment['appointment_date']
            },
            "rejected_by": current_admin.username
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to reject appointment")

@api_router.delete("/appointments/cancel")
async def cancel_appointment(nin: str, appointment_date: str):
    """Cancel an appointment by NIN and date"""
    if not nin or not appointment_date:
        raise HTTPException(status_code=400, detail="NIN and appointment date are required")
    
    # Find the appointment
    appointment = await db.appointments.find_one({
        "nin": nin,
        "appointment_date": appointment_date
    }, {"_id": 0})
    
    if not appointment:
        raise HTTPException(
            status_code=404, 
            detail="No appointment found with this NIN for the specified date"
        )
    
    # Delete the appointment
    result = await db.appointments.delete_one({
        "nin": nin,
        "appointment_date": appointment_date
    })
    
    if result.deleted_count == 1:
        return {
            "message": "Appointment cancelled successfully",
            "cancelled_appointment": {
                "name": f"{appointment['firstname']} {appointment['surname']}",
                "location": appointment['location'],
                "date": appointment['appointment_date']
            }
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to cancel appointment")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default admin accounts to create on startup
DEFAULT_ADMIN_ACCOUNTS = [
    # Superadmin
    {"username": "paul.kasawuli", "email": "paul.kasawuli@nira.go.ug", "password": "SuperAdmin@2026", "role": "superadmin"},
    # Staff Admins
    {"username": "ashah.nabbanja", "email": "ashah.nabbanja@nira.go.ug", "password": "Admin@2026", "role": "admin"},
    {"username": "zalwango.erina", "email": "zalwango.erina@nira.go.ug", "password": "Zalwango@2026", "role": "admin"},
    {"username": "ceasar.kotevu", "email": "ceasar.kotevu@nira.go.ug", "password": "Admin@2026", "role": "admin"},
    {"username": "arthur.magooba", "email": "arthur.magooba@nira.go.ug", "password": "Admin@2026", "role": "admin"},
]

@app.on_event("startup")
async def startup_create_default_admins():
    """Create default admin accounts and database indexes on application startup"""
    
    # Drop old index if exists and create unique index on NIN only
    # This enforces "one active appointment per NIN" at the database level
    logger.info("Creating database indexes...")
    try:
        # Try to drop the old compound index if it exists
        try:
            await db.appointments.drop_index("unique_nin_date")
            logger.info("Dropped old compound index (nin + appointment_date)")
        except Exception:
            pass  # Index might not exist
        
        # Create new unique index on NIN only
        await db.appointments.create_index(
            [("nin", 1)],
            unique=True,
            name="unique_nin"
        )
        logger.info("Created unique index on appointments (nin) - enforces one active appointment per NIN")
    except Exception as e:
        # Index might already exist, which is fine
        logger.info(f"Index creation note: {str(e)}")
    
    logger.info("Checking and creating default admin accounts...")
    
    for account in DEFAULT_ADMIN_ACCOUNTS:
        try:
            # Check if user already exists
            existing = await db.admins.find_one({"username": account["username"]}, {"_id": 0})
            
            if not existing:
                # Create the admin account
                admin_obj = {
                    "id": str(uuid.uuid4()),
                    "username": account["username"],
                    "email": account["email"],
                    "hashed_password": get_password_hash(account["password"]),
                    "role": account["role"],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.admins.insert_one(admin_obj)
                logger.info(f"Created admin account: {account['username']} ({account['role']})")
            else:
                logger.info(f"Admin account already exists: {account['username']}")
        except Exception as e:
            logger.error(f"Error creating admin account {account['username']}: {str(e)}")
    
    logger.info("Admin account initialization complete.")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
