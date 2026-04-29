import asyncio
from app.db.session import AsyncSessionLocal
from app.services.dispatch_service import create_dispatch
from app.schemas.dispatch import DispatchCreate
import traceback

async def main():
    try:
        async with AsyncSessionLocal() as db:
            payload = DispatchCreate(
                created_by="manager_001",
                assigned_worker_id="worker_123",
                building_id="81267e89-91ac-44dd-8b5c-31fb20f8e0a1",
                title="Projector down",
                issue_text="The projector screen is not powering on in room 104.",
                priority=1
            )
            dispatch = await create_dispatch(payload, db)
            print(f"Created dispatch: {dispatch.id}")
    except Exception as e:
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
