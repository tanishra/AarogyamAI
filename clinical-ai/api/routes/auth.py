from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import AuditDep, DBSession, get_current_token, TokenPayload
from api.services.auth_service import AuthService
from packages.schemas.auth import (
    MFAVerifyRequest,
    MFAVerifyResponse,
    SendOTPRequest,
    SendOTPResponse,
    StaffLoginRequest,
    StaffLoginResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)

router = APIRouter(tags=["auth"])


@router.post("/auth/patient/send-otp", response_model=SendOTPResponse)
async def send_otp(
    body: SendOTPRequest,
    session: DBSession,
    audit: AuditDep,
):
    svc = AuthService(session=session, audit=audit)
    return await svc.send_patient_otp(body)


@router.post("/auth/patient/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp(
    body: VerifyOTPRequest,
    session: DBSession,
    audit: AuditDep,
):
    svc = AuthService(session=session, audit=audit)
    return await svc.verify_patient_otp(body)


@router.post("/auth/staff/login", response_model=StaffLoginResponse)
async def staff_login(
    body: StaffLoginRequest,
    session: DBSession,
    audit: AuditDep,
):
    svc = AuthService(session=session, audit=audit)
    return await svc.staff_login(body)


@router.post("/auth/staff/mfa-verify", response_model=MFAVerifyResponse)
async def mfa_verify(
    body: MFAVerifyRequest,
    session: DBSession,
    audit: AuditDep,
    token: TokenPayload = Depends(get_current_token),
):
    svc = AuthService(session=session, audit=audit)
    return await svc.verify_mfa(body, actor_id=token.sub)