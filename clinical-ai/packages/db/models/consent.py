from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from packages.db.models.base import Base
from packages.domain.enums import ConsentStatus, ConsentEventType


class ConsentToken(Base):
    """
    One row per consent grant.
    NEVER deleted — only status changes.
    Schema: consent (append-only enforced by DB trigger)
    """
    __tablename__ = "consent_tokens"
    __table_args__ = {"schema": "consent"}

    patient_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        index=True,
    )
    tier: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ConsentStatus.ACTIVE.value,
    )
    purposes_consented: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        comment="Array of ConsentPurpose values",
    )
    consent_document_version: Mapped[str] = mapped_column(String(20), nullable=False)
    device_fingerprint: Mapped[str] = mapped_column(String(512), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    withdrawn_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    superseded_by_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True,
        comment="Points to the new token when re-consent happens",
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    def __repr__(self) -> str:
        return f"<ConsentToken patient={self.patient_id} tier={self.tier} status={self.status}>"


class ConsentLedger(Base):
    """
    Immutable event log of every consent action.
    One row per event — never updated.
    Schema: consent
    """
    __tablename__ = "consent_ledger"
    __table_args__ = {"schema": "consent"}

    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    tier: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consent_token_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    consent_document_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    event_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(20), nullable=False)

    def __repr__(self) -> str:
        return f"<ConsentLedger patient={self.patient_id} event={self.event_type}>"