from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.db.models.base import Base
from packages.domain.enums import SessionStatus


class PatientSession(Base):
    """
    One session = one clinic visit.
    Tracks state from questionnaire → nurse → AI → doctor → record.
    Schema: app
    """
    __tablename__ = "patient_sessions"
    __table_args__ = {"schema": "app"}

    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app.patients.id"),
        nullable=False,
        index=True,
    )
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=SessionStatus.QUESTIONNAIRE_IN_PROGRESS.value,
    )
    use_static_form: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="True when patient declined Tier 2 consent",
    )
    emergency_flagged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    questionnaire_complete_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    nurse_ready_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    synthesis_complete_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    synthesis_fallback_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False,
    )
    synthesis_fallback_reason: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    medical_record_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True,
        comment="Set when doctor commits record",
    )
    arrival_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chief_complaint: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="First answer — stored for nurse/doctor quick view",
    )
    sqs_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    def __repr__(self) -> str:
        return f"<PatientSession {self.id} status={self.status}>"