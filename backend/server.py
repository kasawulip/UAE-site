from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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
    role: str = "viewer"  # viewer or admin
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AdminCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "viewer"

class AdminLogin(BaseModel):
    username: str
    password: str

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
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #0F172A; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; background-color: #f9f9f9; }}
            .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            .highlight {{ color: #D97706; font-weight: bold; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>National ID Appointment Confirmation</h1>
            </div>
            <div class="content">
                <p>Dear {firstname} {surname},</p>
                <p><strong>This is to confirm your appointment to pick your National ID.</strong></p>
                <p>Your appointment details:</p>
                <ul>
                    <li><strong>Name:</strong> {firstname} {surname}</li>
                    <li><strong>Location:</strong> <span class="highlight">{location}</span></li>
                    <li><strong>Date:</strong> <span class="highlight">{appointment_date}</span></li>
                    <li><strong>Time:</strong> 9:00 AM - 3:00 PM</li>
                </ul>
                <p>Please bring a valid form of identification and arrive during the scheduled time window.</p>
                <p>If you need to make any changes, please contact our office.</p>
            </div>
            <div class="footer">
                <p>National ID Issuance Department</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [recipient_email],
        "subject": "National ID Appointment Confirmation",
        "html": html_content
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return False

# Routes
@api_router.get("/")
async def root():
    return {"message": "National ID Appointment System API"}

@api_router.get("/slots/{location}/{date}")
async def get_slot_availability(location: str, date: str):
    """Get available slots for a specific location and date"""
    # Define slot limits
    slot_limits = {
        "Abu Dhabi": 200,
        "Dubai": 100
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
    
    # Check if NIN already has an appointment for this date
    existing = await db.appointments.find_one({
        "nin": appointment.nin,
        "appointment_date": appointment.appointment_date
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"An appointment already exists for this NIN ({appointment.nin}) on {appointment.appointment_date}"
        )
    
    # Check slot availability
    slot_limits = {"Abu Dhabi": 200, "Dubai": 100}
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
    
    # Save to database
    await db.appointments.insert_one(doc)
    
    # Send confirmation email
    await send_confirmation_email(
        recipient_email=appointment.email,
        firstname=appointment.firstname,
        surname=appointment.surname,
        location=appointment.location,
        appointment_date=appointment.appointment_date
    )
    
    return appointment_obj

@api_router.get("/appointments", response_model=List[Appointment])
async def get_appointments():
    """Get all appointments (for admin)"""
    appointments = await db.appointments.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return appointments

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
