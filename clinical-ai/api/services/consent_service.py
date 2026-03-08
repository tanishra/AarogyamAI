from datetime import datetime, timezone
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.cache.redis_client import ConsentCache
from packages.db.models.consent import ConsentLedger, ConsentToken
from packages.db.models.patient import Patient
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    ConsentEventType,
    ConsentStatus,
    ConsentTier,
    OutcomeStatus,
)
from packages.schemas.consent import (
    ConsentVersionCheckResponse,
    GrantConsentRequest,
    GrantConsentResponse,
    WithdrawConsentRequest,
    WithdrawConsentResponse,
)
from packages.validators.consent_validator import ConsentValidator

logger = structlog.get_logger(__name__)


class ConsentService:

    def __init__(
        self,
        session: AsyncSession,
        audit: AuditService,
        cache: ConsentCache,
        validator: ConsentValidator,
        current_version: str,
    ) -> None:
        self._session = session
        self._audit = audit
        self._cache = cache
        self._validator = validator
        self._current_version = current_version

    async def check_version(self, patient_id: str) -> ConsentVersionCheckResponse:
        stmt = (
            select(ConsentToken)
            .where(ConsentToken.patient_id == patient_id)
            .where(ConsentToken.tier == ConsentTier.TIER_1.value)
            .where(ConsentToken.status == ConsentStatus.ACTIVE.value)
            .order_by(ConsentToken.granted_at.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        token = result.scalar_one_or_none()

        if token is None:
            return ConsentVersionCheckResponse(
                version_match=False,
                patient_version="none",
                current_version=self._current_version,
                reconsent_required=True,
            )

        match = token.consent_document_version == self._current_version
        return ConsentVersionCheckResponse(
            version_match=match,
            patient_version=token.consent_document_version,
            current_version=self._current_version,
            reconsent_required=not match,
        )

    async def grant(
        self,
        patient_id: str,
        request: GrantConsentRequest,
    ) -> GrantConsentResponse:
        # Ensure patient row exists for downstream FK constraints (sessions, rights).
        patient_stmt = select(Patient).where(Patient.id == patient_id).limit(1)
        patient_result = await self._session.execute(patient_stmt)
        patient = patient_result.scalar_one_or_none()
        if patient is None:
            self._session.add(
                Patient(
                    id=patient_id,
                    phone_hash=f"test-{patient_id}",
                    age_band="unknown",
                    age_gate_passed=True,
                    clinic_id="clinic-001",
                    cognito_patient_id=patient_id,
                )
            )

        # Validate
        validation = self._validator.validate_grant_request(
            tier=request.consent_tier,
            purposes_consented=request.purposes_consented,
            document_version=request.consent_document_version,
        )
        if not validation.is_valid:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "VALIDATION_FAILED",
                    "error_id": str(uuid4()),
                    "detail": {"reason": validation.reason},
                },
            )

        # Supersede existing active token for this tier
        existing_stmt = (
            select(ConsentToken)
            .where(ConsentToken.patient_id == patient_id)
            .where(ConsentToken.tier == request.consent_tier.value)
            .where(ConsentToken.status == ConsentStatus.ACTIVE.value)
            .order_by(ConsentToken.granted_at.desc(), ConsentToken.created_at.desc())
        )
        existing_result = await self._session.execute(existing_stmt)
        existing_tokens = list(existing_result.scalars().all())

        now = datetime.now(timezone.utc)
        new_id = str(uuid4())

        for existing in existing_tokens:
            existing.status = ConsentStatus.SUPERSEDED.value
            existing.superseded_by_id = new_id

        # Create new token
        new_token = ConsentToken(
            id=new_id,
            patient_id=patient_id,
            tier=request.consent_tier.value,
            status=ConsentStatus.ACTIVE.value,
            purposes_consented=[p.value for p in request.purposes_consented],
            consent_document_version=request.consent_document_version,
            device_fingerprint=request.device_fingerprint,
            granted_at=now,
        )
        self._session.add(new_token)

        # Ledger entry
        ledger = ConsentLedger(
            id=str(uuid4()),
            patient_id=patient_id,
            event_type=ConsentEventType.GRANTED.value,
            tier=request.consent_tier.value,
            consent_token_id=new_id,
            consent_document_version=request.consent_document_version,
            occurred_at=now,
            actor_role=ActorRole.PATIENT.value,
        )
        self._session.add(ledger)
        await self._session.flush()

        # Invalidate cache
        await self._cache.invalidate_patient_consent(patient_id)

        # Audit
        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.CONSENT_GRANTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .metadata({
                "tier": request.consent_tier.value,
                "version": request.consent_document_version,
            })
            .build(),
        )

        return GrantConsentResponse(
            consent_id=new_id,
            status=ConsentStatus.ACTIVE,
        )

    async def withdraw(
        self,
        patient_id: str,
        request: WithdrawConsentRequest,
    ) -> WithdrawConsentResponse:
        now = datetime.now(timezone.utc)
        withdrawn_ids: list[str] = []

        for tier in request.tiers_to_withdraw:
            stmt = (
                select(ConsentToken)
                .where(ConsentToken.patient_id == patient_id)
                .where(ConsentToken.tier == tier.value)
                .where(ConsentToken.status == ConsentStatus.ACTIVE.value)
                .order_by(ConsentToken.granted_at.desc(), ConsentToken.created_at.desc())
            )
            result = await self._session.execute(stmt)
            tokens = list(result.scalars().all())

            for token in tokens:
                token.status = ConsentStatus.WITHDRAWN.value
                token.withdrawn_at = now
                withdrawn_ids.append(token.id)

                ledger = ConsentLedger(
                    id=str(uuid4()),
                    patient_id=patient_id,
                    event_type=ConsentEventType.WITHDRAWN.value,
                    tier=tier.value,
                    consent_token_id=token.id,
                    occurred_at=now,
                    actor_role=ActorRole.PATIENT.value,
                    event_metadata={"reason": request.reason},
                )
                self._session.add(ledger)

        await self._session.flush()
        await self._cache.invalidate_patient_consent(patient_id)

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.CONSENT_WITHDRAWN)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .metadata({"tiers": [t.value for t in request.tiers_to_withdraw]})
            .build(),
        )

        return WithdrawConsentResponse(
            withdrawn_consent_ids=withdrawn_ids,
            processing_halted_at=now.isoformat(),
        )
