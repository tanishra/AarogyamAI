from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from packages.db.models.base import Base


class AuditLogEntry(Base):
    """
    Tamper-evident hash-chain audit log.
    APPEND-ONLY — UPDATE and DELETE blocked by DB trigger.
    Schema: audit (separate schema — restricted access)
    """
    __tablename__ = "audit_log_entries"
    __table_args__ = {"schema": "audit"}

    # Hash chain
    entry_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        comment="SHA-256 of this entry's canonical fields",
    )
    prev_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Hash of the previous entry — GENESIS for first entry",
    )
    sequence_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        unique=True,
        comment="Monotonically increasing — verified during integrity check",
    )

    # What happened
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="success | failure | blocked | fallback",
    )

    # Who did it
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor_role: Mapped[str] = mapped_column(String(20), nullable=False)

    # What it was about
    patient_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    clinic_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Context — NO PHI in any field here
    event_metadata: Mapped[dict | None] = mapped_column(
        JSON, nullable=True,
        comment="Structured context — no raw PII or PHI",
    )
    ip_address_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
        comment="SHA-256 of IP — not raw IP",
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True,
    )

    def __repr__(self) -> str:
        return f"<AuditLogEntry seq={self.sequence_number} event={self.event_type}>"