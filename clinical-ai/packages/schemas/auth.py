from pydantic import BaseModel, Field
from packages.domain.types import PhoneNumber


# ── Patient Auth ──────────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone: PhoneNumber


class SendOTPResponse(BaseModel):
    otp_sent: bool
    expires_in_seconds: int
    masked_phone: str


class VerifyOTPRequest(BaseModel):
    phone: PhoneNumber
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    clinic_id: str


class ConsentStatusMap(BaseModel):
    tier_1: str
    tier_2: str
    tier_3: str
    tier_4: str


class VerifyOTPResponse(BaseModel):
    access_token: str
    patient_id: str
    age_gate_passed: bool
    is_new_patient: bool
    consent_status: ConsentStatusMap


# ── Staff Auth ────────────────────────────────────────────────────────────────

class StaffLoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)
    clinic_id: str


class StaffLoginResponse(BaseModel):
    partial_token: str
    mfa_required: bool
    totp_setup_required: bool


class MFAVerifyRequest(BaseModel):
    totp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class MFAVerifyResponse(BaseModel):
    access_token: str
    user_id: str
    role: str
    clinic_id: str
    display_name: str
    expires_in: int