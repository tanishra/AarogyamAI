import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from packages.db.models.base import Base

# Import all models so Alembic sees them in metadata
from packages.db.models.clinic_user import ClinicUser          # noqa: F401
from packages.db.models.patient import Patient                  # noqa: F401
from packages.db.models.session import PatientSession           # noqa: F401
from packages.db.models.vitals import Vitals                    # noqa: F401
from packages.db.models.consent import ConsentToken, ConsentLedger  # noqa: F401
from packages.db.models.audit import AuditLogEntry              # noqa: F401
from packages.db.models.synthesis import (                      # noqa: F401
    DifferentialConsideration,
    ReasoningDraft,
)
from packages.db.models.medical_record import MedicalRecord     # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    import os
    url = os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url", "")
    return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        version_table_schema="app",
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        version_table_schema="app",
    )
    with context.begin_transaction():
        context.run_migrations()


# async def run_async_migrations() -> None:
#     configuration = config.get_section(config.config_ini_section, {})
#     configuration["sqlalchemy.url"] = get_url()

#     connectable = async_engine_from_config(
#         configuration,
#         prefix="sqlalchemy.",
#         poolclass=pool.NullPool,
#     )

#     async with connectable.connect() as connection:
#         await connection.run_sync(do_run_migrations)

#     await connectable.dispose()
async def run_async_migrations() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine

    url = get_url().replace("postgresql+psycopg2://", "postgresql+asyncpg://")

    connectable = create_async_engine(url, poolclass=pool.NullPool)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()