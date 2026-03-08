from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from packages.db.models.base import Base
from packages.domain.enums import DoctorAction, UrgencyFlag


class DifferentialConsideration(Base):
    """
    One row per AI-generated or doctor-added clinical consideration.
    Schema: app
    """
    __tablename__ = "differential_considerations"
    __table_args__ = {"schema": "app"}

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app.patient_sessions.id"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    supporting_features: Mapped[list] = mapped_column(JSON, nullable=False)
    clinical_reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    urgency_flag: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=UrgencyFlag.ROUTINE.value,
    )
    ai_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    doctor_action: Mapped[str | None] = mapped_column(
        String(20), nullable=True,
        comment="accepted | modified | rejected — null until doctor acts",
    )
    doctor_modification: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blocked_output_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
        comment="SHA-256 of blocked LLM output — for audit trail",
    )

    def __repr__(self) -> str:
        return f"<DifferentialConsideration session={self.session_id} ai={self.ai_generated}>"


class ReasoningDraft(Base):
    """
    Auto-saved doctor reasoning draft.
    NEVER written to permanent record.
    Deleted when record is committed.
    Schema: app
    """
    __tablename__ = "reasoning_drafts"
    __table_args__ = {"schema": "app"}

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app.patient_sessions.id"),
        nullable=False,
        unique=True,   # one draft per session
        index=True,
    )
    doctor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    assessment: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    free_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<ReasoningDraft session={self.session_id}>"