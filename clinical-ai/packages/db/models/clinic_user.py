from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from packages.db.models.base import Base
from packages.domain.enums import Role


class ClinicUser(Base):
    """
    Nurses, doctors, admins, DPOs.
    Patients are NOT in this table — they authenticate via OTP.
    Schema: app
    """
    __tablename__ = "clinic_users"
    __table_args__ = {"schema": "app"}

    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="nurse | doctor | admin | dpo",
    )
    cognito_user_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<ClinicUser {self.email} role={self.role}>"