import asyncio
import bcrypt
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, delete
from app.db.session import engine, AsyncSessionLocal
from app.db.models.user import User
from app.db.models.building import Building
from app.db.models.shift import Shift
from app.db.models.dispatch import Dispatch

async def seed_everything():
    async with AsyncSessionLocal() as db:
        print("Ensuring core users exist...")
        # Manager
        mgr = await db.execute(text("SELECT id FROM users WHERE email = 'manager@vuit.edu'"))
        mgr_id = mgr.scalar_one_or_none()
        if not mgr_id:
            manager = User(
                name="Head Dispatcher",
                email="manager@vuit.edu",
                hashed_password=bcrypt.hashpw(b'admin123!', bcrypt.gensalt()).decode('utf-8'),
                role="manager",
                phone="555-0100"
            )
            db.add(manager)
            await db.commit()
            await db.refresh(manager)
            mgr_id = manager.id

        # Worker
        wrk = await db.execute(text("SELECT id FROM users WHERE email = 'worker@vuit.edu'"))
        wrk_id = wrk.scalar_one_or_none()
        if not wrk_id:
            worker = User(
                name="Student Worker",
                email="worker@vuit.edu",
                hashed_password=bcrypt.hashpw(b'worker123!', bcrypt.gensalt()).decode('utf-8'),
                role="worker",
                phone="555-0200"
            )
            db.add(worker)
            await db.commit()
            await db.refresh(worker)
            wrk_id = worker.id

        print("Checking for existing buildings...")
        bldgs = await db.execute(text("SELECT id FROM buildings WHERE name = 'Central Library'"))
        if not bldgs.scalar_one_or_none():
            print("Creating Vanderbilt IT locations...")
            buildings = [
                Building(name="Central Library", address="419 21st Ave S", lat=36.1432, lng=-86.7988, radius_meters=150),
                Building(name="Engineering Science Building", address="1211 25th Ave S", lat=36.1420, lng=-86.8020, radius_meters=150),
                Building(name="Sarratt Student Center", address="2301 Vanderbilt Place", lat=36.1465, lng=-86.8015, radius_meters=150)
            ]
            db.add_all(buildings)
            await db.commit()
            for b in buildings:
                await db.refresh(b)
        else:
            buildings_res = await db.execute(text("SELECT id FROM buildings"))
            bldg_ids = buildings_res.scalars().all()
            buildings = [type('obj', (object,), {'id': i}) for i in bldg_ids]

        print("Creating shifts for today...")
        now = datetime.now(timezone.utc)
        
        # Shift 1: Started 2 hours ago, ends in 2 hours. Active right now.
        shift1 = Shift(
            worker_id=wrk_id,
            building_id=buildings[0].id,
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=2),
            checkin_open_time=now - timedelta(hours=2, minutes=15),
            checkin_close_time=now - timedelta(hours=1, minutes=45),
            status="checked_in" # Assuming they are checked in already fake state
        )

        # Shift 2: Starts right now. Needs check in.
        shift2 = Shift(
            worker_id=wrk_id,
            building_id=buildings[1].id,
            start_time=now,
            end_time=now + timedelta(hours=4),
            checkin_open_time=now - timedelta(minutes=15),
            checkin_close_time=now + timedelta(minutes=15),
            status="scheduled" 
        )

        db.add_all([shift1, shift2])
        await db.commit()

        print("✅ Database cleanly fully seeded with Buildings and Shifts!")
        print("Ready for Manager to view and Worker to check in.")

if __name__ == "__main__":
    asyncio.run(seed_everything())
