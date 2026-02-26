#!/usr/bin/env python3
"""
One-time cleanup script to remove duplicate NIN appointments.
Keeps the earliest valid booking for each NIN.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

async def cleanup_duplicates():
    """Remove duplicate NIN appointments, keeping the earliest booking."""
    
    print("=" * 60)
    print("NIN DUPLICATE CLEANUP SCRIPT")
    print("=" * 60)
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Get all appointments
    all_appointments = await db.appointments.find({}, {"_id": 0}).to_list(10000)
    print(f"\nTotal appointments before cleanup: {len(all_appointments)}")
    
    # Group appointments by NIN
    nin_groups = {}
    for apt in all_appointments:
        nin = apt.get('nin')
        if nin not in nin_groups:
            nin_groups[nin] = []
        nin_groups[nin].append(apt)
    
    # Find NINs with duplicates
    duplicates_found = 0
    appointments_to_delete = []
    
    for nin, appointments in nin_groups.items():
        if len(appointments) > 1:
            duplicates_found += 1
            print(f"\n[DUPLICATE] NIN: {nin} has {len(appointments)} appointments:")
            
            # Sort by created_at to find the earliest
            sorted_appointments = sorted(
                appointments, 
                key=lambda x: x.get('created_at', '9999-99-99')
            )
            
            # Keep the first (earliest), mark others for deletion
            keeper = sorted_appointments[0]
            to_delete = sorted_appointments[1:]
            
            print(f"  KEEPING: {keeper.get('appointment_date')} at {keeper.get('location')} (created: {keeper.get('created_at', 'N/A')[:19]})")
            
            for apt in to_delete:
                print(f"  DELETING: {apt.get('appointment_date')} at {apt.get('location')} (created: {apt.get('created_at', 'N/A')[:19]})")
                appointments_to_delete.append({
                    "nin": nin,
                    "id": apt.get('id')
                })
    
    if duplicates_found == 0:
        print("\n✅ No duplicate NINs found. Database is clean!")
    else:
        print(f"\n{'=' * 60}")
        print(f"Found {duplicates_found} NINs with duplicates")
        print(f"Appointments to delete: {len(appointments_to_delete)}")
        print("=" * 60)
        
        # Perform deletion
        deleted_count = 0
        for apt in appointments_to_delete:
            result = await db.appointments.delete_one({"id": apt['id']})
            if result.deleted_count == 1:
                deleted_count += 1
        
        print(f"\n✅ Cleanup complete! Deleted {deleted_count} duplicate appointments.")
    
    # Verify final count
    final_count = await db.appointments.count_documents({})
    print(f"\nTotal appointments after cleanup: {final_count}")
    
    # Now drop old index and create new unique index on NIN
    print("\n" + "=" * 60)
    print("CREATING UNIQUE INDEX ON NIN")
    print("=" * 60)
    
    try:
        # Drop old compound index if exists
        try:
            await db.appointments.drop_index("unique_nin_date")
            print("Dropped old index: unique_nin_date")
        except Exception as e:
            print(f"Note: {e}")
        
        # Create new unique index on NIN only
        await db.appointments.create_index(
            [("nin", 1)],
            unique=True,
            name="unique_nin"
        )
        print("✅ Created unique index on NIN - one active appointment per NIN enforced!")
    except Exception as e:
        print(f"Index note: {e}")
    
    # List all indexes
    print("\nCurrent indexes on appointments collection:")
    async for index in db.appointments.list_indexes():
        print(f"  - {index['name']}: {index['key']}")
    
    client.close()
    print("\n✅ Cleanup script completed successfully!")

if __name__ == "__main__":
    asyncio.run(cleanup_duplicates())
