from datetime import datetime, timezone
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.db.models.session import PatientSession
from packages.db.models.vitals import Vitals
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    OutcomeStatus,
    SessionStatus,
)
from packages.queue.sqs_client import AITaskMessage, SQSClient
from packages.schemas.nurse import (
    MarkReadyRequest,
    MarkReadyResponse,
    NurseQueueResponse,
    PatientSummaryResponse,
    QueuePatient,
    SubmitVitalsRequest,
    SubmitVitalsResponse,
)
from packages.validators.vitals_validator import VitalsValidator

logger = structlog.get_logger(__name__)


class NurseService:

    def __init__(
        self,
        session: AsyncSession,
        audit: AuditService,
        sqs: SQSClient,
    ) -> None:
        self._session = session
        self._audit = audit
        self._sqs = sqs
        self._vitals_validator = VitalsValidator()

    async def get_queue(self, clinic_id: str) -> NurseQueueResponse:
        stmt = (
            select(PatientSession)
            .where(PatientSession.clinic_id == clinic_id)
            .where(PatientSession.status.in_([
                SessionStatus.QUESTIONNAIRE_COMPLETE.value,
                SessionStatus.QUESTIONNAIRE_IN_PROGRESS.value,
            ]))
            .order_by(PatientSession.arrival_order.asc())
        )
        result = await self._session.execute(stmt)
        sessions = result.scalars().all()

        queue = [
            QueuePatient(
                session_id=s.id,
                arrival_order=s.arrival_order,
                questionnaire_complete=(
                    s.status == SessionStatus.QUESTIONNAIRE_COMPLETE.value
                ),
                vitals_submitted=False,
                waiting_since=s.created_at.isoformat(),
                emergency_flagged=s.emergency_flagged,
            )
            for s in sessions
        ]

        return NurseQueueResponse(queue=queue, total_waiting=len(queue))

    async def get_patient_summary(
        self, session_id: str
    ) -> PatientSummaryResponse:
        stmt = select(PatientSession).where(PatientSession.id == session_id)
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()

        if session is None:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "SESSION_NOT_FOUND", "error_id": str(uuid4())},
            )

        return PatientSummaryResponse(
            session_id=session_id,
            chief_complaint=session.chief_complaint or "Not provided",
            emergency_flagged=session.emergency_flagged,
            vitals_submitted=False,
        )

    async def submit_vitals(
        self,
        nurse_id: str,
        request: SubmitVitalsRequest,
    ) -> SubmitVitalsResponse:
        # Validate
        vitals_dict = {
            "temperature_celsius": request.temperature_celsius,
            "bp_systolic_mmhg": request.bp_systolic_mmhg,
            "bp_diastolic_mmhg": request.bp_diastolic_mmhg,
            "heart_rate_bpm": request.heart_rate_bpm,
            "respiratory_rate_pm": request.respiratory_rate_pm,
            "spo2_percent": request.spo2_percent,
            "weight_kg": request.weight_kg,
            "height_cm": request.height_cm,
        }

        validation = self._vitals_validator.validate(vitals_dict)

        if not validation.is_valid:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "VALIDATION_FAILED",
                    "error_id": str(uuid4()),
                    "detail": {"errors": validation.errors},
                },
            )

        # Check unconfirmed outliers
        unconfirmed = [
            f for f in validation.outlier_flags
            if not any(
                c.field == f.field and c.confirmed
                for c in request.outlier_confirmations
            )
        ]

        if unconfirmed and not request.outlier_confirmations:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VITALS_OUTLIER_CONFIRMATION_REQUIRED",
                    "error_id": str(uuid4()),
                    "outlier_flags": [f.to_dict() for f in unconfirmed],
                },
            )

        # Save vitals
        vitals_id = str(uuid4())
        vitals = Vitals(
            id=vitals_id,
            session_id=request.session_id,
            nurse_id=nurse_id,
            temperature_celsius=request.temperature_celsius,
            bp_systolic_mmhg=request.bp_systolic_mmhg,
            bp_diastolic_mmhg=request.bp_diastolic_mmhg,
            heart_rate_bpm=request.heart_rate_bpm,
            respiratory_rate_pm=request.respiratory_rate_pm,
            spo2_percent=request.spo2_percent,
            weight_kg=request.weight_kg,
            height_cm=request.height_cm,
            nurse_observation=request.nurse_observation,
            outlier_flags=[f.to_dict() for f in validation.outlier_flags],
            has_outliers=validation.has_outliers,
        )
        self._session.add(vitals)

        # Update session emergency flag
        stmt = select(PatientSession).where(
            PatientSession.id == request.session_id
        )
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()
        if session and validation.is_emergency:
            session.emergency_flagged = True

        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.VITALS_SUBMITTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.NURSE, actor_id=nurse_id)
            .session(request.session_id)
            .metadata({
                "has_outliers": validation.has_outliers,
                "is_emergency": validation.is_emergency,
            })
            .build(),
        )

        return SubmitVitalsResponse(
            vitals_id=vitals_id,
            outlier_flags=[f.to_dict() for f in validation.outlier_flags],
            saved_at=datetime.now(timezone.utc).isoformat(),
        )

    async def mark_ready(
        self,
        nurse_id: str,
        request: MarkReadyRequest,
    ) -> MarkReadyResponse:
        stmt = select(PatientSession).where(
            PatientSession.id == request.session_id
        )
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()

        if session is None:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "SESSION_NOT_FOUND", "error_id": str(uuid4())},
            )

        session.status = SessionStatus.NURSE_MARKED_READY.value
        session.nurse_ready_at = datetime.now(timezone.utc)
        await self._session.flush()

        # Queue AI synthesis task
        msg = AITaskMessage(
            session_id=session.id,
            clinic_id=session.clinic_id,
            patient_id=session.patient_id,
        )
        try:
            sqs_msg_id = self._sqs.send_ai_task(msg)
            session.sqs_message_id = sqs_msg_id
            session.status = SessionStatus.SYNTHESIS_IN_PROGRESS.value
        except RuntimeError as exc:
            logger.error(
                "Failed to queue AI task",
                session_id=session.id,
                error=str(exc),
            )

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.SESSION_MARKED_READY)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.NURSE, actor_id=nurse_id)
            .session(request.session_id)
            .build(),
        )

        return MarkReadyResponse(
            synthesis_queued=True,
            estimated_ready_seconds=30,
        )