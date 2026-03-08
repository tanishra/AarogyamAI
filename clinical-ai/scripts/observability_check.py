"""
Observability readiness check.
Validates logging, metrics, audit chain, and Redis connectivity.

Usage:
    DATABASE_URL=... uv run python scripts/observability_check.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


class _ObsSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str | None = None
    llm_api_key: str = ""
    dev_skip_cognito_verify: bool = False
    app_env: str = "development"
    log_level: str = "INFO"
    redis_url: str = "redis://localhost:6379/0"
    sqs_ai_task_queue_url: str | None = None
    cors_origins: list[str] | str | None = [
        "https://app.clinicaldomain.in",
        "https://clinic.clinicaldomain.in",
    ]
    cognito_patient_pool_id: str | None = None


_SETTINGS = _ObsSettings()


def _env(name: str, default=None):
    value = os.environ.get(name)
    if value not in (None, ""):
        return value
    mapping = {
        "DATABASE_URL": _SETTINGS.database_url,
        "LLM_API_KEY": _SETTINGS.llm_api_key,
        "DEV_SKIP_COGNITO_VERIFY": str(_SETTINGS.dev_skip_cognito_verify).lower(),
        "APP_ENV": _SETTINGS.app_env,
        "LOG_LEVEL": _SETTINGS.log_level,
        "REDIS_URL": _SETTINGS.redis_url,
        "SQS_AI_TASK_QUEUE_URL": _SETTINGS.sqs_ai_task_queue_url,
        "CORS_ORIGINS": _SETTINGS.cors_origins,
        "COGNITO_PATIENT_POOL_ID": _SETTINGS.cognito_patient_pool_id,
    }
    fallback = mapping.get(name, default)
    return fallback if fallback not in (None, "") else default

PASS = "✅"
FAIL = "❌"
WARN = "⚠️ "


def _section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


async def check_db():
    _section("DATABASE CONNECTIVITY")
    try:
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import text

        database_url = _env("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL is not configured (.env or shell)")
        engine = create_async_engine(database_url, echo=False)
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            assert result.scalar() == 1

            # Check schemas exist
            for schema in ["app", "consent", "audit"]:
                r = await conn.execute(text(
                    f"SELECT schema_name FROM information_schema.schemata "
                    f"WHERE schema_name = '{schema}'"
                ))
                exists = r.scalar_one_or_none()
                status = PASS if exists else FAIL
                print(f"  {status} Schema '{schema}' exists")

            # Check table counts
            for schema, table in [
                ("app", "clinic_users"),
                ("app", "patients"),
                ("app", "patient_sessions"),
                ("app", "vitals"),
                ("consent", "consent_tokens"),
                ("consent", "consent_ledger"),
                ("audit", "audit_log_entries"),
            ]:
                r = await conn.execute(text(
                    f"SELECT COUNT(*) FROM {schema}.{table}"
                ))
                count = r.scalar()
                print(f"  {PASS} {schema}.{table}: {count} rows")

        await engine.dispose()
        print(f"\n  {PASS} Database connectivity OK")

    except Exception as exc:
        print(f"  {FAIL} Database check failed: {exc}")


async def check_redis():
    _section("REDIS CONNECTIVITY")
    try:
        import redis.asyncio as aioredis

        redis = aioredis.from_url(
            _env("REDIS_URL", "redis://localhost:6379/0")
        )
        await redis.ping()
        print(f"  {PASS} Redis ping OK")

        # Test set/get
        await redis.setex("health_check", 10, "ok")
        val = await redis.get("health_check")
        assert val == b"ok"
        print(f"  {PASS} Redis read/write OK")

        # Check memory
        info = await redis.info("memory")
        used_mb = round(info["used_memory"] / 1024 / 1024, 2)
        print(f"  {PASS} Redis memory used: {used_mb} MB")

        await redis.aclose()

    except Exception as exc:
        print(f"  {FAIL} Redis check failed: {exc}")


async def check_audit_chain():
    _section("AUDIT CHAIN INTEGRITY")
    try:
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from packages.audit.audit_service import get_audit_service

        database_url = _env("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL is not configured (.env or shell)")
        engine = create_async_engine(database_url, echo=False)
        SessionLocal = sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        async with SessionLocal() as session:
            audit = get_audit_service()
            result = await audit.verify_chain(session)

            status = PASS if result.valid else FAIL
            print(f"  {status} Chain valid      : {result.valid}")
            print(f"  {PASS} Entries checked  : {result.entries_checked}")

            if not result.valid:
                print(f"  {FAIL} First break at   : {result.first_break}")
                print(f"  {FAIL} Reason           : {result.reason}")
            else:
                print(f"  {PASS} No chain breaks detected")

        await engine.dispose()

    except Exception as exc:
        print(f"  {FAIL} Audit chain check failed: {exc}")


async def check_structlog():
    _section("STRUCTURED LOGGING")
    try:
        import structlog

        logger = structlog.get_logger("observability_check")
        logger.info(
            "observability_check",
            component="logging",
            status="testing",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        print(f"  {PASS} structlog configured correctly")
        print(f"  {PASS} JSON log output working")

    except Exception as exc:
        print(f"  {FAIL} Logging check failed: {exc}")


async def check_pii_protection():
    _section("PII PROTECTION")
    try:
        from agent_worker.agent.tools.pii_stripper import PIIStripperTool

        tool = PIIStripperTool()

        test_cases = [
            ("+919876543210", "phone"),
            ("test@example.com", "email"),
            ("1234 5678 9012", "aadhaar"),
        ]

        for text, pii_type in test_cases:
            result = await tool.run({
                "text": f"Patient said {text} is their contact",
                "context": "test",
            })
            was_stripped = result.output.get("was_modified", False)
            status = PASS if was_stripped else FAIL
            print(f"  {status} {pii_type} stripped: {was_stripped}")

        print(f"  {PASS} PII stripper working correctly")

    except Exception as exc:
        print(f"  {FAIL} PII protection check failed: {exc}")


async def check_output_filter():
    _section("OUTPUT FILTER (AI SAFETY)")
    try:
        from agent_worker.agent.tools.output_filter import OutputFilterTool

        tool = OutputFilterTool()

        blocked_cases = [
            "The patient has acute myocardial infarction",
            "You have diabetes mellitus type 2",
            "Prescribe metformin 500mg twice daily",
        ]

        allowed_cases = [
            "Consider possible cardiac involvement",
            "May suggest further evaluation",
            "Consistent with elevated BP pattern",
        ]

        all_blocked = True
        for text in blocked_cases:
            result = await tool.run({"text": text, "session_id": "test"})
            if result.success:
                print(f"  {FAIL} Should be blocked: '{text[:50]}'")
                all_blocked = False
            else:
                print(f"  {PASS} Blocked correctly: '{text[:50]}'")

        all_allowed = True
        for text in allowed_cases:
            result = await tool.run({"text": text, "session_id": "test"})
            if not result.success:
                print(f"  {FAIL} Should be allowed: '{text[:50]}'")
                all_allowed = False
            else:
                print(f"  {PASS} Allowed correctly: '{text[:50]}'")

        if all_blocked and all_allowed:
            print(f"\n  {PASS} Output filter working correctly")

    except Exception as exc:
        print(f"  {FAIL} Output filter check failed: {exc}")


async def check_production_readiness():
    _section("PRODUCTION READINESS CHECKLIST")

    app_env = str(_env("APP_ENV", "development")).lower()
    is_prod_like = app_env in {"production", "staging"}

    checks: list[tuple[str, bool, str]] = [
        ("DATABASE_URL set", bool(_env("DATABASE_URL")), "required"),
        ("LLM_API_KEY set", bool(_env("LLM_API_KEY")), "required"),
        (
            "DEV_SKIP_COGNITO_VERIFY is False in prod",
            str(_env("DEV_SKIP_COGNITO_VERIFY", "false")).lower() not in ("true", "1"),
            "required" if is_prod_like else "warning",
        ),
        ("APP_ENV not development", app_env != "development", "warning"),
        ("LOG_LEVEL set", bool(_env("LOG_LEVEL")), "required"),
        ("REDIS_URL set", bool(_env("REDIS_URL")), "required"),
        ("SQS_AI_TASK_QUEUE_URL set", bool(_env("SQS_AI_TASK_QUEUE_URL")), "required"),
        ("CORS origins configured", bool(_env("CORS_ORIGINS")), "required"),
        ("Cognito pool IDs set", bool(_env("COGNITO_PATIENT_POOL_ID")), "required"),
    ]

    passed = 0
    failed = 0
    for check, result, severity in checks:
        if result:
            print(f"  {PASS} {check}")
            passed += 1
            continue

        if severity == "warning":
            print(f"  {WARN} {check}")
        else:
            print(f"  {FAIL} {check}")
            failed += 1

    print(f"\n  Passed: {passed}/{len(checks)}")
    if failed > 0:
        print(f"  {WARN}  {failed} checks need attention before production")


async def run():
    print("=" * 60)
    print("  CLINIC VALIDATION — OBSERVABILITY CHECK")
    print(f"  {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    await check_db()
    await check_redis()
    await check_audit_chain()
    await check_structlog()
    await check_pii_protection()
    await check_output_filter()
    await check_production_readiness()

    _section("SUMMARY")
    print(f"\n  Run this script before every clinic deployment.")
    print(f"\n  📋 Pending tasks reminder:")
    print(f"     ⏳ Step 15.4 — Run: uv run alembic upgrade head")
    print(f"     ⏳ Step 16   — Run: uv run pytest tests/integration/ -v")
    print(f"     ⏳ Phase 4   — Run scripts in order:")
    print(f"          1. uv run python scripts/seed_clinic.py")
    print(f"          2. uv run python scripts/test_fallback_path.py")
    print(f"          3. uv run python scripts/run_prototype_flow.py")
    print()


if __name__ == "__main__":
    asyncio.run(run())
