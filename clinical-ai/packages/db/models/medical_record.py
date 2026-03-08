from sqlalchemy import Boolean, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from packages.db.models.base import Base


class MedicalRecord(Base):
    """
    Permanent, immutable medical record.
    Created ONLY via POST /doctor/record/commit.
    UPDATE and DELETE blocked by DB trigger.
    Schema: app
    """
    __tablename__ = "medical_records"
    __table_args__ = {"schema": "app"}

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app.patient_sessions.id"),
        nullable=False,
        unique=True,    # one record per session — enforced at DB level
        index=True,
    )
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    doctor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False)

    # Doctor's final clinical output
    final_assessment: Mapped[str] = mapped_column(Text, nullable=False)
    final_plan: Mapped[str] = mapped_column(Text, nullable=False)
    final_rationale: Mapped[str] = mapped_column(Text, nullable=False)
    doctor_free_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Provenance — what happened to each AI consideration
    accepted_consideration_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    modified_consideration_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    rejected_consideration_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    added_consideration_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # Consent verification at commit time
    tier3_consent_id: Mapped[str] = mapped_column(
        String(36), nullable=False,
        comment="ID of the active Tier 3 consent token at commit time",
    )

    # Receipt
    sms_receipt_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:
        return f"<MedicalRecord session={self.session_id} doctor={self.doctor_id}>"