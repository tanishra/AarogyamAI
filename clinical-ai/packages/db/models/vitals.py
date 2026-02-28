from sqlalchemy import Boolean, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from packages.db.models.base import Base


class Vitals(Base):
    """
    One row per nurse vitals submission per session.
    Schema: app
    """
    __tablename__ = "vitals"
    __table_args__ = {"schema": "app"}

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app.patient_sessions.id"),
        nullable=False,
        index=True,
    )
    nurse_id: Mapped[str] = mapped_column(String(36), nullable=False)
    temperature_celsius: Mapped[float] = mapped_column(Float, nullable=False)
    bp_systolic_mmhg: Mapped[float] = mapped_column(Float, nullable=False)
    bp_diastolic_mmhg: Mapped[float] = mapped_column(Float, nullable=False)
    heart_rate_bpm: Mapped[float] = mapped_column(Float, nullable=False)
    respiratory_rate_pm: Mapped[float] = mapped_column(Float, nullable=False)
    spo2_percent: Mapped[float] = mapped_column(Float, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    nurse_observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    outlier_flags: Mapped[list | None] = mapped_column(
        JSON, nullable=True,
        comment="List of VitalsOutlierFlag dicts — null if all normal",
    )
    outlier_confirmations: Mapped[list | None] = mapped_column(
        JSON, nullable=True,
        comment="Nurse-confirmed outliers",
    )
    has_outliers: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:
        return f"<Vitals session={self.session_id} has_outliers={self.has_outliers}>"