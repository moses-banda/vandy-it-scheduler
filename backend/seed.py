import asyncio
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db.session import engine, AsyncSessionLocal
from app.db.models.user import User
from app.core.security import hash_password

async def seed_data():
    async with AsyncSessionLocal() as db:
        print("Checking for existing manager...")
        
        # Check if manager already exists so we don't duplicate
        existing = await db.execute(text("SELECT id FROM users WHERE email = 'manager@vuit.edu'"))
        if existing.scalar_one_or_none():
            print("Manager already exists!")
        else:
            print("Creating Manager account...")
            manager = User(
                name="Head Dispatcher",
                email="manager@vuit.edu",
                hashed_password=hash_password("admin123!"),
                role="manager",
                phone="555-0100"
            )
            db.add(manager)

        # Check for existing worker
        existing_worker = await db.execute(text("SELECT id FROM users WHERE email = 'worker@vuit.edu'"))
        if existing_worker.scalar_one_or_none():
            print("Worker already exists!")
        else:
            print("Creating Worker account...")
            worker = User(
                name="Student Worker",
                email="worker@vuit.edu",
                hashed_password=hash_password("worker123!"),
                role="worker",
                phone="555-0200"
            )
            db.add(worker)

        await db.commit()
        print("\n✅ Seed complete. Accounts created:")
        print("  ➜ Admin/Manager: manager@vuit.edu | Password: admin123!")
        print("  ➜ Student Worker: worker@vuit.edu | Password: worker123!")

if __name__ == "__main__":
    asyncio.run(seed_data())
