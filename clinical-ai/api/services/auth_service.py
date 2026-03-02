import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.cache.redis_client import get_redis
from packages.db.models.patient import Patient
from packages.db.models.clinic_user import ClinicUser
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    OutcomeStatus,
    Role,
)
from packages.schemas.auth import (
    MFAVerifyRequest,
    MFAVerifyResponse,
    NurseSendOTPRequest,
    NurseSendOTPResponse,
    NurseVerifyOTPRequest,
    NurseVerifyOTPResponse,
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
        Validate staff credentials.
        Return partial token — full token only after MFA.
        """
        from api.config import get_settings

        settings = get_settings()
        email = request.email.strip().lower()
        if not self._is_valid_email(email):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "INVALID_EMAIL", "error_id": str(uuid4())},
            )

        stmt = (
            select(ClinicUser)
            .where(ClinicUser.email == email)
            .where(ClinicUser.clinic_id == request.clinic_id)
            .where(ClinicUser.is_active.is_(True))
            .limit(1)
        )
        result = await self._session.execute(stmt)
        staff = result.scalar_one_or_none()
        if staff is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "STAFF_NOT_FOUND", "error_id": str(uuid4())},
            )

        if staff.role not in {
            Role.NURSE.value,
            Role.DOCTOR.value,
            Role.ADMIN.value,
            Role.DPO.value,
        }:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "FORBIDDEN", "error_id": str(uuid4())},
            )

        # Temporary placeholder credential check until Cognito is wired.
        # In development we allow any non-empty password accepted by schema.
        if settings.app_env != "development" and request.password != "ChangeMe123!":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "INVALID_CREDENTIALS", "error_id": str(uuid4())},
            )

        redis = get_redis()
        mfa_code = "123456" if settings.app_env == "development" else f"{secrets.randbelow(1_000_000):06d}"
        mfa_key = f"staff_mfa_challenge:{staff.id}"
        await redis.setex(
            mfa_key,
            300,
            self._hash_otp(staff.id, mfa_code),
        )

        partial_token = self._issue_staff_partial_token(
            user_id=staff.id,
            clinic_id=staff.clinic_id,
            role=staff.role,
        )

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_STAFF_LOGIN)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(
                role=self._actor_role_from_user_role(staff.role),
                actor_id=staff.id,
            )
            .clinic(request.clinic_id)
            .build(),
        )

        return StaffLoginResponse(
            partial_token=partial_token,
            mfa_required=True,
            totp_setup_required=False,
        )

    async def send_nurse_otp(
        self,
        request: NurseSendOTPRequest,
    ) -> NurseSendOTPResponse:
        from fastapi import HTTPException, status
        from api.config import get_settings

        settings = get_settings()
        email = request.email.strip().lower()
        if not self._is_valid_email(email):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "INVALID_EMAIL", "error_id": str(uuid4())},
            )

        stmt = (
            select(ClinicUser)
            .where(ClinicUser.email == email)
            .where(ClinicUser.clinic_id == request.clinic_id)
            .where(ClinicUser.role == Role.NURSE.value)
            .where(ClinicUser.is_active.is_(True))
            .limit(1)
        )
        result = await self._session.execute(stmt)
        nurse = result.scalar_one_or_none()
        if nurse is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "NURSE_NOT_FOUND", "error_id": str(uuid4())},
            )

        email_hash = self._hash_staff_identity(email, request.clinic_id, Role.NURSE.value)
        redis = get_redis()

        rate_key = f"staff_otp_rate:{email_hash}"
        current = await redis.incr(rate_key)
        if current == 1:
            await redis.expire(rate_key, 300)
        if current > 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "error_id": str(uuid4()),
                    "retry_after": 300,
                },
            )

        otp_code = f"{secrets.randbelow(1_000_000):06d}"
        otp_hash = self._hash_otp(email_hash, otp_code)
        await redis.setex(f"staff_otp:{email_hash}", 300, otp_hash)

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_OTP_SENT)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.NURSE, actor_id=nurse.id)
            .clinic(request.clinic_id)
            .metadata({"email_hash": email_hash})
            .build(),
        )

        return NurseSendOTPResponse(
            otp_sent=True,
            expires_in_seconds=300,
            masked_email=self._mask_email(email),
            dev_otp=otp_code if settings.app_env == "development" else None,
        )

    async def verify_nurse_otp(
        self,
        request: NurseVerifyOTPRequest,
    ) -> NurseVerifyOTPResponse:
        from fastapi import HTTPException, status

        email = request.email.strip().lower()
        email_hash = self._hash_staff_identity(email, request.clinic_id, Role.NURSE.value)
        redis = get_redis()
        expected_hash = await redis.get(f"staff_otp:{email_hash}")
        provided_hash = self._hash_otp(email_hash, request.otp)
        if not expected_hash or not secrets.compare_digest(str(expected_hash), provided_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "INVALID_OTP", "error_id": str(uuid4())},
            )
        await redis.delete(f"staff_otp:{email_hash}")

        stmt = (
            select(ClinicUser)
            .where(ClinicUser.email == email)
            .where(ClinicUser.clinic_id == request.clinic_id)
            .where(ClinicUser.role == Role.NURSE.value)
            .where(ClinicUser.is_active.is_(True))
            .limit(1)
        )
        result = await self._session.execute(stmt)
        nurse = result.scalar_one_or_none()
        if nurse is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "NURSE_NOT_FOUND", "error_id": str(uuid4())},
            )

        nurse.last_login_at = datetime.now(timezone.utc)
        await self._session.flush()

        access_token = self._issue_staff_access_token(
            user_id=nurse.id,
            clinic_id=nurse.clinic_id,
            role=Role.NURSE.value,
        )

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_OTP_VERIFIED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.NURSE, actor_id=nurse.id)
            .clinic(nurse.clinic_id)
            .build(),
        )

        return NurseVerifyOTPResponse(
            access_token=access_token,
            user_id=nurse.id,
            role=Role.NURSE.value,
            clinic_id=nurse.clinic_id,
            display_name=nurse.display_name,
            expires_in=900,
        )

    async def verify_mfa(
        self, request: MFAVerifyRequest, actor_id: str
    ) -> MFAVerifyResponse:
        """
        Verify TOTP code. Return full JWT on success.
        """
        from api.config import get_settings

        settings = get_settings()
        stmt = (
            select(ClinicUser)
            .where(ClinicUser.id == actor_id)
            .where(ClinicUser.is_active.is_(True))
            .limit(1)
        )
        result = await self._session.execute(stmt)
        staff = result.scalar_one_or_none()
        if staff is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "STAFF_NOT_FOUND", "error_id": str(uuid4())},
            )

        redis = get_redis()
        mfa_key = f"staff_mfa_challenge:{staff.id}"
        expected = await redis.get(mfa_key)
        provided = self._hash_otp(staff.id, request.totp_code)
        dev_bypass = settings.app_env == "development" and request.totp_code == "123456"
        if not dev_bypass:
            if not expected or not secrets.compare_digest(str(expected), provided):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"error": "INVALID_OTP", "error_id": str(uuid4())},
                )
        await redis.delete(mfa_key)

        staff.last_login_at = datetime.now(timezone.utc)
        await self._session.flush()
        access_token = self._issue_staff_access_token(
            user_id=staff.id,
            clinic_id=staff.clinic_id,
            role=staff.role,
        )

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_MFA_VERIFIED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(
                role=self._actor_role_from_user_role(staff.role),
                actor_id=staff.id,
            )
            .clinic(staff.clinic_id)
            .build(),
        )

        return MFAVerifyResponse(
            access_token=access_token,
            user_id=staff.id,
            role=staff.role,
            clinic_id=staff.clinic_id,
            display_name=staff.display_name,
            expires_in=get_settings().jwt_expiry_seconds,
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

    def _issue_staff_access_token(
        self,
        user_id: str,
        clinic_id: str,
        role: str,
    ) -> str:
        from jose import jwt as jose_jwt
        from api.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        payload = {
            "sub": user_id,
            "custom:role": role,
            "custom:clinic_id": clinic_id,
            "partial": False,
            "iss": settings.jwt_issuer,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(seconds=settings.jwt_expiry_seconds)).timestamp()),
        }
        token = jose_jwt.encode(
            payload,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
        return f"Bearer {token}"

    def _issue_staff_partial_token(
        self,
        user_id: str,
        clinic_id: str,
        role: str,
    ) -> str:
        from jose import jwt as jose_jwt
        from api.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        payload = {
            "sub": user_id,
            "custom:role": role,
            "custom:clinic_id": clinic_id,
            "partial": True,
            "iss": settings.jwt_issuer,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        }
        token = jose_jwt.encode(
            payload,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
        return f"Bearer {token}"

    @staticmethod
    def _hash_staff_identity(email: str, clinic_id: str, role: str) -> str:
        return hashlib.sha256(f"{email}:{clinic_id}:{role}:staff-salt".encode()).hexdigest()

    @staticmethod
    def _mask_email(email: str) -> str:
        if "@" not in email:
            return "****"
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            masked_local = local[0] + "*"
        else:
            masked_local = local[0] + ("*" * (len(local) - 2)) + local[-1]
        return f"{masked_local}@{domain}"

    @staticmethod
    def _is_valid_email(email: str) -> bool:
        # Keep this intentionally strict enough for auth input validation.
        return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email))

    @staticmethod
    def _actor_role_from_user_role(role: str) -> ActorRole:
        mapping = {
            Role.NURSE.value: ActorRole.NURSE,
            Role.DOCTOR.value: ActorRole.DOCTOR,
            Role.ADMIN.value: ActorRole.ADMIN,
            Role.DPO.value: ActorRole.DPO,
        }
        return mapping.get(role, ActorRole.SYSTEM)
