import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from packages.db.models.base import Base
from api.main import create_app
from api.dependencies import get_db


# ── Test DB URL ───────────────────────────────────────────────────────────────
TEST_DB_URL = (
    "postgresql+asyncpg://clinical_user:clinical_pass"
    "@localhost:5432/clinical_ai_test"
)

# ── Engine ────────────────────────────────────────────────────────────────────
test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


# ── Create / drop all tables for test run ────────────────────────────────────
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_test_db():
    async with test_engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy").text("CREATE SCHEMA IF NOT EXISTS app")
        )
        await conn.execute(
            __import__("sqlalchemy").text("CREATE SCHEMA IF NOT EXISTS consent")
        )
        await conn.execute(
            __import__("sqlalchemy").text("CREATE SCHEMA IF NOT EXISTS audit")
        )
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


# ── Per-test DB session with rollback ─────────────────────────────────────────
@pytest_asyncio.fixture
async def db_session():
    async with test_engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        yield session
        await session.close()
        await conn.rollback()


# ── FastAPI test client ───────────────────────────────────────────────────────
@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    app = create_app()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


# ── Auth token helpers ────────────────────────────────────────────────────────
def make_patient_token(patient_id: str = "patient-001") -> str:
    """
    Generate a dev JWT for patient.
    Works because DEV_SKIP_COGNITO_VERIFY=true in test env.
    """
    from jose import jwt
    import os

    payload = {
        "sub": patient_id,
        "custom:role": "patient",
        "custom:clinic_id": "clinic-001",
        "partial": False,
    }
    # Unverified token — dev mode only
    return "Bearer " + jwt.encode(payload, "dev-secret", algorithm="HS256")


def make_staff_token(
    user_id: str = "staff-001",
    role: str = "nurse",
    clinic_id: str = "clinic-001",
) -> str:
    from jose import jwt

    payload = {
        "sub": user_id,
        "custom:role": role,
        "custom:clinic_id": clinic_id,
        "partial": False,
    }
    return "Bearer " + jwt.encode(payload, "dev-secret", algorithm="HS256")