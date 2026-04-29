import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine
from app.db.models import building, shift, checkin, dispatch, call_session, user, invite_code  # noqa: F401

from app.routers.health import router as health_router
from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.buildings import router as buildings_router
from app.routers.shifts import router as shifts_router
from app.routers.checkin import router as checkin_router
from app.routers.dashboard import router as dashboard_router
from app.routers.websocket import router as ws_router
from app.routers.dispatches import router as dispatches_router
from app.routers.calls import router as calls_router
from app.routers.invites import router as invites_router

from app.scheduler.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="VUIT Scheduler")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:5173", 
        "http://localhost:5174", 
        "http://localhost:5175",
        "http://localhost",
        "capacitor://localhost",
        "http://129.59.122.27:5173",
        "http://129.59.122.27:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(buildings_router)
app.include_router(shifts_router)
app.include_router(checkin_router)
app.include_router(dashboard_router)
app.include_router(ws_router)
app.include_router(dispatches_router)
app.include_router(calls_router)
app.include_router(invites_router)


@app.get("/")
async def root():
    return {"status": "ok"}


@app.on_event("startup")
async def on_startup():
    logger.info("Initializing database tables...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text("SELECT 1"))
        logger.info("Database connected and tables ready.")
    except Exception as e:
        logger.error(f"DATABASE CONNECTION ERROR: {str(e)}")
        logger.warning(
            "Application starting without successful DB initialization. "
            "Database routes will likely fail."
        )

    start_scheduler()


@app.on_event("shutdown")
async def on_shutdown():
    stop_scheduler()