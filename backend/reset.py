import asyncio
import bcrypt
from app.db.session import AsyncSessionLocal
from app.db.models.user import User
from sqlalchemy import update

async def reset():
    async with AsyncSessionLocal() as db_session:
        # Reset manager
        await db_session.execute(
            update(User)
            .where(User.email == 'manager@vuit.edu')
            .values(hashed_password=bcrypt.hashpw(b'admin123!', bcrypt.gensalt()).decode('utf-8'))
        )
        
        # Reset worker
        await db_session.execute(
            update(User)
            .where(User.email == 'worker@vuit.edu')
            .values(hashed_password=bcrypt.hashpw(b'worker123!', bcrypt.gensalt()).decode('utf-8'))
        )
        
        await db_session.commit()
    print('✅ Passwords reset successfully')

if __name__ == "__main__":
    asyncio.run(reset())
