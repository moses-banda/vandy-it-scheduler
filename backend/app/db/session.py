import ssl
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import DATABASE_URL, DEBUG

# Skip SSL verification (needed for guest/apartment/VPN networks)
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

engine = create_async_engine(
    DATABASE_URL,
    echo=DEBUG,
    poolclass=NullPool,
    connect_args={
        "ssl": ssl_context,
        "statement_cache_size": 0,
        # UUID-based names never collide across process restarts or pooled backends
        "prepared_statement_name_func": lambda: f"__ps_{uuid4().hex}__",
    },
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
