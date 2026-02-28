from datetime import datetime, timezone
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.db.models.consent import ConsentLedger, ConsentToken
from packages.db.models.session import PatientSession
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    ConsentStatus,
    OutcomeStatus,
)
from packages.schemas.patient import (
    CorrectionRequest,
    CorrectionResponse,
    ErasureRequest,
    ErasureResponse,
    PortabilityRequest,
    PortabilityResponse,
)

logger = structlog.get_logger(__name__)


class RightsService:
    """
    Handles DPDP patient rights:
      - Erasure (right to be forgotten)
      - Correction
      - Portability (data export)

    These are processed asynchronously in production.
    Scaffold returns acknowledged responses — worker handles actual processing.
    """

    def __init__(
        self,
        session: AsyncSession,
        audit: AuditService,
    ) -> None:
        self._session = session
        self._audit = audit

    async def request_erasure(
        self,
        patient_id: str,
        request: ErasureRequest,
    ) -> ErasureResponse:
        """
        Soft-delete patient data per DPDP Article 13.
        Withdraws all active consent, flags account for erasure.
        Actual deletion runs in a scheduled worker.
        """
        now = datetime.now(timezone.utc)

        # Withdraw all active consents
        stmt = select(ConsentToken).where(
            ConsentToken.patient_id == patient_id,
            ConsentToken.status == ConsentStatus.ACTIVE.value,
        )
        result = await self._session.execute(stmt)
        active_tokens = result.scalars().all()

        for token in active_tokens:
            token.status = ConsentStatus.WITHDRAWN.value
            token.withdrawn_at = now

            ledger = ConsentLedger(
                id=str(uuid4()),
                patient_id=patient_id,
                event_type="withdrawn",
                tier=token.tier,
                consent_token_id=token.id,
                occurred_at=now,
                actor_role=ActorRole.PATIENT.value,
                event_metadata={"reason": "erasure_request"},
            )
            self._session.add(ledger)

        await self._session.flush()

        request_id = str(uuid4())

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.RIGHTS_ERASURE_REQUESTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .metadata({
                "request_id": request_id,
                "reason": request.reason,
                "consents_withdrawn": len(active_tokens),
            })
            .build(),
        )

        return ErasureResponse(
            request_id=request_id,
            submitted_at=now.isoformat(),
            sla_days=30,
            note=(
                "Your erasure request has been received. "
                "All consent has been withdrawn immediately. "
                "Data deletion will be completed within 30 days."
            ),
        )

    async def request_correction(
        self,
        patient_id: str,
        request: CorrectionRequest,
    ) -> CorrectionResponse:
        """
        Log correction request. DPO reviews and applies.
        """
        request_id = str(uuid4())

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.RIGHTS_CORRECTION_REQUESTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .metadata({
                "request_id": request_id,
                "field": request.field_to_correct,
                "description": request.correction_description,
            })
            .build(),
        )

        return CorrectionResponse(
            request_id=request_id,
            submitted_at=datetime.now(timezone.utc).isoformat(),
            sla_days=15,
        )

    async def request_portability(
        self,
        patient_id: str,
        request: PortabilityRequest,
    ) -> PortabilityResponse:
        """
        Queue data export. Sends download link via SMS when ready.
        """
        request_id = str(uuid4())

        # Load session IDs for this patient
        stmt = select(PatientSession).where(
            PatientSession.patient_id == patient_id
        )
        result = await self._session.execute(stmt)
        sessions = result.scalars().all()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.RIGHTS_PORTABILITY_REQUESTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .metadata({
                "request_id": request_id,
                "format": request.format,
                "sessions_count": len(sessions),
            })
            .build(),
        )

        return PortabilityResponse(
            request_id=request_id,
            submitted_at=datetime.now(timezone.utc).isoformat(),
            estimated_ready_hours=24,
            delivery_method="sms",
        )