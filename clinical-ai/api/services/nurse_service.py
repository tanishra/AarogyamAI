import json
from datetime import datetime, timezone
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.cache.redis_client import get_redis
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
    RemoveQueueRequest,
    RemoveQueueResponse,
    SubmitVitalsRequest,
    SubmitVitalsResponse,
    UpdatePatientStatusRequest,
    UpdatePatientStatusResponse,
    VerifyIntakeRequest,
    VerifyIntakeResponse,
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
                SessionStatus.QUESTIONNAIRE_IN_PROGRESS.value,
                SessionStatus.QUESTIONNAIRE_COMPLETE.value,
                SessionStatus.NURSE_MARKED_READY.value,
                SessionStatus.SYNTHESIS_IN_PROGRESS.value,
                SessionStatus.SYNTHESIS_COMPLETE.value,
                SessionStatus.SYNTHESIS_FALLBACK.value,
                SessionStatus.RECORD_COMMITTED.value,
            ]))
            .order_by(PatientSession.arrival_order.asc())
        )
        result = await self._session.execute(stmt)
        sessions = result.scalars().all()

        session_ids = [s.id for s in sessions]
        vitals_submitted_ids: set[str] = set()
        if session_ids:
            vitals_stmt = (
                select(Vitals.session_id)
                .where(Vitals.session_id.in_(session_ids))
                .distinct()
            )
            vitals_result = await self._session.execute(vitals_stmt)
            vitals_submitted_ids = set(vitals_result.scalars().all())

        questionnaire_complete_statuses = {
            SessionStatus.QUESTIONNAIRE_COMPLETE.value,
            SessionStatus.NURSE_MARKED_READY.value,
            SessionStatus.SYNTHESIS_IN_PROGRESS.value,
            SessionStatus.SYNTHESIS_COMPLETE.value,
            SessionStatus.SYNTHESIS_FALLBACK.value,
            SessionStatus.RECORD_COMMITTED.value,
        }

        queue = [
            QueuePatient(
                session_id=s.id,
                arrival_order=s.arrival_order,
                status=s.status,
                questionnaire_complete=(
                    s.status in questionnaire_complete_statuses
                ),
                vitals_submitted=s.id in vitals_submitted_ids,
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

        redis = get_redis()
        intake_summary = await redis.get(f"intake_summary:{session_id}")
        intake_verified = await redis.get(f"intake_verified:{session_id}")
        raw_state = await redis.get(f"intake_state:{session_id}")
        active_mode = None
        fallback_history = None
        if raw_state:
            try:
                state = json.loads(raw_state)
                active_mode = state.get("active_mode")
                fallback_history = state.get("fallback_history", [])
            except Exception:
                active_mode = None
                fallback_history = None

        vitals_stmt = (
            select(Vitals)
            .where(Vitals.session_id == session_id)
            .order_by(Vitals.created_at.desc())
            .limit(1)
        )
        vitals_result = await self._session.execute(vitals_stmt)
        latest_vitals = vitals_result.scalar_one_or_none()
        latest_vitals_payload = None
        if latest_vitals is not None:
            latest_vitals_payload = {
                "temperature_celsius": latest_vitals.temperature_celsius,
                "bp_systolic_mmhg": latest_vitals.bp_systolic_mmhg,
                "bp_diastolic_mmhg": latest_vitals.bp_diastolic_mmhg,
                "heart_rate_bpm": latest_vitals.heart_rate_bpm,
                "respiratory_rate_pm": latest_vitals.respiratory_rate_pm,
                "spo2_percent": latest_vitals.spo2_percent,
                "weight_kg": latest_vitals.weight_kg,
                "height_cm": latest_vitals.height_cm,
                "nurse_observation": latest_vitals.nurse_observation,
            }

        return PatientSummaryResponse(
            session_id=session_id,
            chief_complaint=session.chief_complaint or "Not provided",
            emergency_flagged=session.emergency_flagged,
            vitals_submitted=latest_vitals is not None,
            latest_vitals=latest_vitals_payload,
            intake_summary_preview=intake_summary,
            intake_verified=(
                True if intake_verified == "true" else False if intake_verified == "false" else None
            ),
            active_mode=active_mode,
            fallback_history=fallback_history,
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

        redis = get_redis()
        intake_flag = await redis.get(f"intake_verified:{request.session_id}")
        if intake_flag != "true":
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "INTAKE_NOT_VERIFIED",
                    "error_id": str(uuid4()),
                    "detail": {
                        "message": (
                            "Nurse intake verification required before AI synthesis."
                        )
                    },
                },
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

    async def verify_intake(
        self,
        nurse_id: str,
        request: VerifyIntakeRequest,
    ) -> VerifyIntakeResponse:
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

        redis = get_redis()
        await redis.setex(
            f"intake_verified:{request.session_id}",
            24 * 3600,
            "true" if request.approved else "false",
        )
        await redis.setex(
            f"intake_verified_meta:{request.session_id}",
            24 * 3600,
            json.dumps(
                {
                    "verified_by": nurse_id,
                    "approved": request.approved,
                    "note": request.nurse_note or "",
                }
            ),
        )

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.SESSION_MARKED_READY)
            .outcome(OutcomeStatus.SUCCESS if request.approved else OutcomeStatus.BLOCKED)
            .actor(role=ActorRole.NURSE, actor_id=nurse_id)
            .session(request.session_id)
            .metadata({"intake_verified": request.approved})
            .build(),
        )

        return VerifyIntakeResponse(
            session_id=request.session_id,
            nurse_verified=request.approved,
            verified_at=datetime.now(timezone.utc).isoformat(),
            verified_by=nurse_id,
        )

    async def remove_from_queue(
        self,
        nurse_id: str,
        clinic_id: str,
        request: RemoveQueueRequest,
    ) -> RemoveQueueResponse:
        stmt = select(PatientSession).where(PatientSession.id == request.session_id)
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()

        if session is None or session.clinic_id != clinic_id:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "SESSION_NOT_FOUND", "error_id": str(uuid4())},
            )

        session.status = SessionStatus.QUEUE_REMOVED.value
        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.SESSION_MARKED_READY)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.NURSE, actor_id=nurse_id)
            .session(request.session_id)
            .metadata(
                {
                    "queue_removed": True,
                    "reason": request.reason or "",
                }
            )
            .build(),
        )

        return RemoveQueueResponse(
            session_id=request.session_id,
            removed=True,
            status=session.status,
        )

    async def update_patient_status(
        self,
        nurse_id: str,
        clinic_id: str,
        request: UpdatePatientStatusRequest,
    ) -> UpdatePatientStatusResponse:
        stmt = select(PatientSession).where(PatientSession.id == request.session_id)
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()

        if session is None or session.clinic_id != clinic_id:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "SESSION_NOT_FOUND", "error_id": str(uuid4())},
            )

        allowed_statuses = {
            SessionStatus.QUESTIONNAIRE_IN_PROGRESS.value,
            SessionStatus.QUESTIONNAIRE_COMPLETE.value,
            SessionStatus.NURSE_MARKED_READY.value,
            SessionStatus.SYNTHESIS_IN_PROGRESS.value,
            SessionStatus.SYNTHESIS_COMPLETE.value,
            SessionStatus.SYNTHESIS_FALLBACK.value,
            SessionStatus.RECORD_COMMITTED.value,
            SessionStatus.QUEUE_REMOVED.value,
        }
        target_status = request.status.strip().lower()
        if target_status not in allowed_statuses:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "INVALID_STATUS",
                    "error_id": str(uuid4()),
                    "detail": {"allowed_statuses": sorted(allowed_statuses)},
                },
            )

        session.status = target_status
        if target_status == SessionStatus.NURSE_MARKED_READY.value and not session.nurse_ready_at:
            session.nurse_ready_at = datetime.now(timezone.utc)
        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.SESSION_MARKED_READY)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.NURSE, actor_id=nurse_id)
            .session(request.session_id)
            .metadata(
                {
                    "status_updated": True,
                    "status": target_status,
                    "reason": request.reason or "",
                }
            )
            .build(),
        )

        return UpdatePatientStatusResponse(
            session_id=request.session_id,
            updated=True,
            status=session.status,
        )
