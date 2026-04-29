import asyncio
from app.db.session import engine
from app.db.base import Base
# Import all models to ensure they are registered with Base metadata
from app.db.models import building, shift, checkin, dispatch, call_session, user, invite_code

async def main():
    print("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created.")

if __name__ == "__main__":
    asyncio.run(main())
