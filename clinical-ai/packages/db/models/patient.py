from sqlalchemy import Boolean, Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from packages.db.models.base import Base


class Patient(Base):
    """
    Patient identity — stores MINIMUM data.
    No name. No raw DOB. Phone stored as one-way hash.
    Schema: app
    """
    __tablename__ = "patients"
    __table_args__ = {"schema": "app"}

    phone_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
        comment="SHA-256 of (phone + system_salt) — not reversible",
    )
    age_band: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Derived from DOB at registration — e.g. 31-45. DOB not stored.",
    )
    age_gate_passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    cognito_patient_id: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True,
    )

    def __repr__(self) -> str:
        return f"<Patient {self.id} age_band={self.age_band}>"