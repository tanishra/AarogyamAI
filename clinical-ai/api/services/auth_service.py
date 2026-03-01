import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    Patient OTP login issues a signed JWT for API access.
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
        Generate OTP and store hashed challenge in Redis.
        Never store raw phone number or raw OTP.
        """
        from api.config import get_settings

        settings = get_settings()
        phone_hash = self._hash_phone(request.phone)

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

        otp_code = f"{secrets.randbelow(1_000_000):06d}"
        otp_key = f"otp_challenge:{phone_hash}"
        otp_hash = self._hash_otp(phone_hash, otp_code)
        await redis.setex(
            otp_key,
            300,
            otp_hash,
        )

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
            dev_otp=otp_code if settings.app_env == "development" else None,
        )

    async def verify_patient_otp(
        self,
        request: VerifyOTPRequest,
    ) -> VerifyOTPResponse:
        """
        Verify OTP challenge from Redis.
        Register patient if first visit.
        Return signed JWT + consent status.
        """
        from fastapi import HTTPException, status as http_status

        phone_hash = self._hash_phone(request.phone)
        redis = get_redis()
        otp_key = f"otp_challenge:{phone_hash}"
        expected_hash = await redis.get(otp_key)
        provided_hash = self._hash_otp(phone_hash, request.otp)

        if not expected_hash or not secrets.compare_digest(
            str(expected_hash), provided_hash
        ):
            raise HTTPException(
                status_code=http_status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": "INVALID_OTP",
                    "error_id": str(uuid4()),
                },
            )

        # One-time OTP: consume after successful validation
        await redis.delete(otp_key)

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
        access_token = self._issue_patient_access_token(
            patient_id=patient.id,
            clinic_id=patient.clinic_id,
        )

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

        return VerifyOTPResponse(
            access_token=access_token,
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
        salt = "dev-salt"  # replaced by Secrets Manager value in production
        return hashlib.sha256(f"{phone}{salt}".encode()).hexdigest()

    @staticmethod
    def _hash_otp(phone_hash: str, otp: str) -> str:
        return hashlib.sha256(f"{phone_hash}:{otp}:otp-salt".encode()).hexdigest()

    def _issue_patient_access_token(
        self,
        patient_id: str,
        clinic_id: str,
    ) -> str:
        from jose import jwt as jose_jwt
        from api.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        payload = {
            "sub": patient_id,
            "custom:role": "patient",
            "custom:clinic_id": clinic_id,
            "partial": False,
            "iss": settings.jwt_issuer,
            "iat": int(now.timestamp()),
            "exp": int(
                (now + timedelta(seconds=settings.jwt_expiry_seconds)).timestamp()
            ),
        }
        token = jose_jwt.encode(
            payload,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
        return f"Bearer {token}"
