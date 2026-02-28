import hashlib
import logging
from datetime import datetime, timezone
from uuid import uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.cache.redis_client import get_redis
from packages.db.models.patient import Patient
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    OutcomeStatus,
)
from packages.schemas.auth import (
    MFAVerifyRequest,
    MFAVerifyResponse,
    SendOTPRequest,
    SendOTPResponse,
    StaffLoginRequest,
    StaffLoginResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
    ConsentStatusMap,
)

logger = structlog.get_logger(__name__)


class AuthService:
    """
    Handles OTP generation, verification, and staff login.
    JWT issuance is handled by Cognito — this service orchestrates the flow.
    """

    def __init__(
        self,
        session: AsyncSession,
        audit: AuditService,
    ) -> None:
        self._session = session
        self._audit = audit

    async def send_patient_otp(
        self, request: SendOTPRequest
    ) -> SendOTPResponse:
        """
        Hash phone — trigger Cognito OTP.
        Never store raw phone number.
        """
        phone_hash = self._hash_phone(request.phone)

        # Store OTP request in Redis for rate limiting
        redis = get_redis()
        rate_key = f"otp_rate:{phone_hash}"
        current = await redis.incr(rate_key)
        if current == 1:
            await redis.expire(rate_key, 300)  # 5 min window
        if current > 5:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "error_id": str(uuid4()),
                    "retry_after": 300,
                },
            )

        # In production — trigger Cognito InitiateAuth here
        # For scaffold — return mock response
        masked = request.phone[:-4].replace(
            request.phone[:-4], "*" * (len(request.phone) - 4)
        ) + request.phone[-4:]

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_OTP_SENT)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT)
            .metadata({"phone_hash": phone_hash})
            .build(),
        )

        return SendOTPResponse(
            otp_sent=True,
            expires_in_seconds=300,
            masked_phone=masked,
        )

    async def verify_patient_otp(
        self,
        request: VerifyOTPRequest,
    ) -> VerifyOTPResponse:
        """
        Verify OTP with Cognito.
        Register patient if first visit.
        Return JWT + consent status.
        """
        phone_hash = self._hash_phone(request.phone)

        # Load or create patient
        stmt = select(Patient).where(Patient.phone_hash == phone_hash)
        result = await self._session.execute(stmt)
        patient = result.scalar_one_or_none()

        is_new = patient is None
        if is_new:
            patient = Patient(
                id=str(uuid4()),
                phone_hash=phone_hash,
                age_band="unknown",
                age_gate_passed=False,
                clinic_id=request.clinic_id,
                cognito_patient_id=str(uuid4()),  # replaced by real Cognito sub
            )
            self._session.add(patient)
            await self._session.flush()

        # Load consent status for all tiers
        consent_map = await self._load_consent_map(patient.id)

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_OTP_VERIFIED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient.id)
            .patient(patient.id)
            .metadata({"is_new_patient": is_new})
            .build(),
        )

        # In production — return Cognito JWT
        return VerifyOTPResponse(
            access_token="cognito.jwt.placeholder",
            patient_id=patient.id,
            age_gate_passed=patient.age_gate_passed,
            is_new_patient=is_new,
            consent_status=consent_map,
        )

    async def staff_login(
        self, request: StaffLoginRequest
    ) -> StaffLoginResponse:
        """
        Validate staff credentials via Cognito.
        Return partial token — full token only after MFA.
        """
        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_STAFF_LOGIN)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.SYSTEM)
            .metadata({"clinic_id": request.clinic_id})
            .build(),
        )

        # In production — call Cognito InitiateAuth
        return StaffLoginResponse(
            partial_token="partial.jwt.placeholder",
            mfa_required=True,
            totp_setup_required=False,
        )

    async def verify_mfa(
        self, request: MFAVerifyRequest, actor_id: str
    ) -> MFAVerifyResponse:
        """
        Verify TOTP code. Return full JWT on success.
        """
        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_MFA_VERIFIED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.SYSTEM, actor_id=actor_id)
            .build(),
        )

        # In production — call Cognito RespondToAuthChallenge
        return MFAVerifyResponse(
            access_token="full.jwt.placeholder",
            user_id=actor_id,
            role="doctor",
            clinic_id="clinic-001",
            display_name="Dr. Placeholder",
            expires_in=900,
        )

    async def _load_consent_map(self, patient_id: str) -> ConsentStatusMap:
        from packages.db.models.consent import ConsentToken
        from packages.domain.enums import ConsentStatus

        tiers: dict[int, str] = {}
        for tier in [1, 2, 3, 4]:
            stmt = (
                select(ConsentToken)
                .where(ConsentToken.patient_id == patient_id)
                .where(ConsentToken.tier == tier)
                .order_by(ConsentToken.granted_at.desc())
                .limit(1)
            )
            result = await self._session.execute(stmt)
            token = result.scalar_one_or_none()
            tiers[tier] = (
                token.status if token else ConsentStatus.NOT_GRANTED.value
            )

        return ConsentStatusMap(
            tier_1=tiers[1],
            tier_2=tiers[2],
            tier_3=tiers[3],
            tier_4=tiers[4],
        )

    @staticmethod
    def _hash_phone(phone: str) -> str:
        from api.config import get_settings
        salt = "dev-salt"  # replaced by Secrets Manager value in production
        return hashlib.sha256(f"{phone}{salt}".encode()).hexdigest()