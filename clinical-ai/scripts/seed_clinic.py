"""
Seed script — run once to populate local DB for prototype.

Usage:
    DATABASE_URL=postgresql+asyncpg://clinical_user:clinical_pass@localhost:5432/clinical_ai \
    uv run python scripts/seed_clinic.py
"""
import asyncio
import hashlib
from datetime import datetime, timezone
from uuid import uuid4
import os
import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from packages.db.models import Base


def _get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    class _SeedSettings(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            case_sensitive=False,
            extra="ignore",
        )
        database_url: str | None = None

    settings = _SeedSettings()
    if settings.database_url:
        return settings.database_url

    raise RuntimeError(
        "DATABASE_URL not found. Set it in shell or add DATABASE_URL to .env"
    )


DATABASE_URL = _get_database_url()

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

CLINIC_ID = "clinic-demo-001"
NURSE_ID = "nurse-demo-001"
DOCTOR_ID = "doctor-demo-001"
ADMIN_ID = "admin-demo-001"
PATIENT_ID = "patient-demo-001"


async def seed():
    # Ensure schemas/tables exist before inserting seed rows.
    async with engine.begin() as conn:
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS consent"))
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS audit"))
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        async with session.begin():

            # ── Clinic users ──────────────────────────────────────────────────
            await session.execute(text("""
                INSERT INTO app.clinic_users
                    (id, clinic_id, display_name, role, email,
                     cognito_user_id, is_active, mfa_enabled,
                     created_at, updated_at)
                VALUES
                    (:id1, :clinic, 'Nurse Priya', 'nurse',
                     'nurse@demo.clinic', :cog1, true, true,
                     now(), now()),
                    (:id2, :clinic, 'Dr. Arjun Sharma', 'doctor',
                     'doctor@demo.clinic', :cog2, true, true,
                     now(), now()),
                    (:id3, :clinic, 'Admin Meera', 'admin',
                     'admin@demo.clinic', :cog3, true, true,
                     now(), now())
                ON CONFLICT (id) DO NOTHING
            """), {
                "id1": NURSE_ID, "id2": DOCTOR_ID, "id3": ADMIN_ID,
                "clinic": CLINIC_ID,
                "cog1": str(uuid4()), "cog2": str(uuid4()),
                "cog3": str(uuid4()),
            })

            # ── Patient ───────────────────────────────────────────────────────
            phone_hash = hashlib.sha256(
                "+919876543210dev-salt".encode()
            ).hexdigest()

            await session.execute(text("""
                INSERT INTO app.patients
                    (id, phone_hash, age_band, age_gate_passed,
                     clinic_id, cognito_patient_id,
                     created_at, updated_at)
                VALUES
                    (:id, :phone_hash, '30-40', true,
                     :clinic, :cog_id,
                     now(), now())
                ON CONFLICT (id) DO NOTHING
            """), {
                "id": PATIENT_ID,
                "phone_hash": phone_hash,
                "clinic": CLINIC_ID,
                "cog_id": str(uuid4()),
            })

            # ── Tier 1 consent ────────────────────────────────────────────────
            consent_id = str(uuid4())
            await session.execute(text("""
                INSERT INTO consent.consent_tokens
                    (id, patient_id, tier, status,
                     purposes_consented, consent_document_version,
                     device_fingerprint, granted_at,
                     created_at, updated_at)
                VALUES
                    (:id, :patient_id, 1, 'active',
                     '["symptom_collection","ai_processing",
                       "clinical_record","nurse_access"]',
                     '1.1', 'seed-device', now(),
                     now(), now())
                ON CONFLICT (id) DO NOTHING
            """), {"id": consent_id, "patient_id": PATIENT_ID})

            # ── Consent ledger entry ──────────────────────────────────────────
            await session.execute(text("""
                INSERT INTO consent.consent_ledger
                    (id, patient_id, event_type, tier,
                     consent_token_id, consent_document_version,
                     occurred_at, actor_role,
                     created_at, updated_at)
                VALUES
                    (:id, :patient_id, 'granted', 1,
                     :token_id, '1.1',
                     now(), 'patient',
                     now(), now())
                ON CONFLICT (id) DO NOTHING
            """), {
                "id": str(uuid4()),
                "patient_id": PATIENT_ID,
                "token_id": consent_id,
            })

        print("✅ Clinic seeded successfully")
        print(f"   Clinic ID : {CLINIC_ID}")
        print(f"   Nurse ID  : {NURSE_ID}")
        print(f"   Doctor ID : {DOCTOR_ID}")
        print(f"   Patient ID: {PATIENT_ID}")
        print()
        print("Dev tokens (DEV_SKIP_COGNITO_VERIFY=true):")
        print(f"   Nurse  role=nurse  clinic_id={CLINIC_ID}")
        print(f"   Doctor role=doctor clinic_id={CLINIC_ID}")
        print(f"   Patient sub={PATIENT_ID}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
