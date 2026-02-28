import json
from datetime import datetime, timezone
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.cache.redis_client import get_redis
from packages.db.models.medical_record import MedicalRecord
from packages.db.models.session import PatientSession
from packages.db.models.synthesis import DifferentialConsideration, ReasoningDraft
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    DoctorAction,
    OutcomeStatus,
    SessionStatus,
    UrgencyFlag,
)
from packages.schemas.doctor import (
    AddConsiderationRequest,
    AddConsiderationResponse,
    CommitRecordRequest,
    CommitRecordResponse,
    DifferentialActionRequest,
    DifferentialActionResponse,
    DoctorQueuePatient,
    DoctorQueueResponse,
    FeedbackRequest,
    FeedbackResponse,
    PatientContextResponse,
    SaveReasoningDraftRequest,
    SaveReasoningDraftResponse,
)

logger = structlog.get_logger(__name__)


class DoctorService:

    def __init__(
        self,
        session: AsyncSession,
        audit: AuditService,
    ) -> None:
        self._session = session
        self._audit = audit

    async def get_queue(self, clinic_id: str) -> DoctorQueueResponse:
        stmt = (
            select(PatientSession)
            .where(PatientSession.clinic_id == clinic_id)
            .where(PatientSession.status.in_([
                SessionStatus.SYNTHESIS_IN_PROGRESS.value,
                SessionStatus.SYNTHESIS_COMPLETE.value,
                SessionStatus.SYNTHESIS_FALLBACK.value,
                SessionStatus.NURSE_MARKED_READY.value,
            ]))
            .order_by(PatientSession.arrival_order.asc())
        )
        result = await self._session.execute(stmt)
        sessions = result.scalars().all()

        queue = [
            DoctorQueuePatient(
                session_id=s.id,
                arrival_order=s.arrival_order,
                synthesis_ready=(
                    s.status == SessionStatus.SYNTHESIS_COMPLETE.value
                ),
                fallback_active=(
                    s.status == SessionStatus.SYNTHESIS_FALLBACK.value
                ),
                urgency_flag=UrgencyFlag.ROUTINE,
                chief_complaint=s.chief_complaint or "",
                ready_since=s.nurse_ready_at.isoformat()
                if s.nurse_ready_at else s.created_at.isoformat(),
            )
            for s in sessions
        ]

        return DoctorQueueResponse(queue=queue, total_waiting=len(queue))

    async def get_patient_context(
        self, session_id: str, doctor_id: str
    ) -> PatientContextResponse:
        stmt = select(PatientSession).where(PatientSession.id == session_id)
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()

        if session is None:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "SESSION_NOT_FOUND", "error_id": str(uuid4())},
            )

        # Load differentials
        diff_stmt = (
            select(DifferentialConsideration)
            .where(DifferentialConsideration.session_id == session_id)
            .order_by(DifferentialConsideration.sort_order.asc())
        )
        diff_result = await self._session.execute(diff_stmt)
        diffs = diff_result.scalars().all()

        # Load synthesis status from cache
        redis = get_redis()
        cache_key = f"synthesis_status:{session_id}"
        cached = await redis.get(cache_key)
        synthesis_data = json.loads(cached) if cached else {}

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.PATIENT_CONTEXT_VIEWED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.DOCTOR, actor_id=doctor_id)
            .session(session_id)
            .build(),
        )

        from packages.schemas.doctor import DifferentialConsideration as DiffSchema

        differentials = [
            DiffSchema(
                consideration_id=d.id,
                title=d.title,
                supporting_features=d.supporting_features,
                clinical_reasoning=d.clinical_reasoning,
                urgency_flag=UrgencyFlag(d.urgency_flag),
                ai_generated=d.ai_generated,
                doctor_action=DoctorAction(d.doctor_action)
                if d.doctor_action else None,
                doctor_modification=d.doctor_modification,
                sort_order=d.sort_order,
            )
            for d in diffs
        ]

        return PatientContextResponse(
            session_id=session_id,
            synthesis_ready=synthesis_data.get("synthesis_ready", False),
            fallback_active=synthesis_data.get("fallback_active", False),
            fallback_reason=synthesis_data.get("fallback_reason"),
            structured_context=None,
            vitals_summary=None,
            outlier_flags=[],
            emergency_flagged=session.emergency_flagged,
            differentials=differentials,
            synthesis_timestamp=session.synthesis_complete_at.isoformat()
            if session.synthesis_complete_at else None,
        )

    async def differential_action(
        self,
        consideration_id: str,
        doctor_id: str,
        request: DifferentialActionRequest,
    ) -> DifferentialActionResponse:
        stmt = select(DifferentialConsideration).where(
            DifferentialConsideration.id == consideration_id
        )
        result = await self._session.execute(stmt)
        diff = result.scalar_one_or_none()

        if diff is None:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "NOT_FOUND", "error_id": str(uuid4())},
            )

        diff.doctor_action = request.action.value
        diff.doctor_modification = request.modification_text
        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.DIFFERENTIAL_ACTION_TAKEN)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.DOCTOR, actor_id=doctor_id)
            .session(request.session_id)
            .metadata({
                "consideration_id": consideration_id,
                "action": request.action.value,
            })
            .build(),
        )

        return DifferentialActionResponse(
            updated_at=datetime.now(timezone.utc).isoformat()
        )

    async def add_consideration(
        self,
        doctor_id: str,
        request: AddConsiderationRequest,
    ) -> AddConsiderationResponse:
        consideration_id = str(uuid4())
        consideration = DifferentialConsideration(
            id=consideration_id,
            session_id=request.session_id,
            title=request.title,
            supporting_features=[],
            clinical_reasoning=request.clinical_reasoning,
            urgency_flag=request.urgency_flag.value,
            ai_generated=False,
            doctor_action=DoctorAction.ADDED.value,
            sort_order=99,
        )
        self._session.add(consideration)
        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.DIFFERENTIAL_ADDED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.DOCTOR, actor_id=doctor_id)
            .session(request.session_id)
            .metadata({"consideration_id": consideration_id})
            .build(),
        )

        return AddConsiderationResponse(
            consideration_id=consideration_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    async def save_reasoning_draft(
        self,
        doctor_id: str,
        request: SaveReasoningDraftRequest,
    ) -> SaveReasoningDraftResponse:
        stmt = select(ReasoningDraft).where(
            ReasoningDraft.session_id == request.session_id
        )
        result = await self._session.execute(stmt)
        draft = result.scalar_one_or_none()

        if draft is None:
            draft = ReasoningDraft(
                id=str(uuid4()),
                session_id=request.session_id,
                doctor_id=doctor_id,
            )
            self._session.add(draft)

        draft.assessment = request.assessment
        draft.plan = request.plan
        draft.rationale = request.rationale
        draft.free_text = request.free_text
        await self._session.flush()

        return SaveReasoningDraftResponse(
            saved_at=datetime.now(timezone.utc).isoformat()
        )

    async def commit_record(
        self,
        doctor_id: str,
        request: CommitRecordRequest,
    ) -> CommitRecordResponse:
        if not request.tier3_consent_confirmed:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "CONSENT_REQUIRED",
                    "error_id": str(uuid4()),
                    "tier": 3,
                },
            )

        # Check record not already committed
        existing_stmt = select(MedicalRecord).where(
            MedicalRecord.session_id == request.session_id
        )
        existing_result = await self._session.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": "RECORD_ALREADY_COMMITTED",
                    "error_id": str(uuid4()),
                },
            )

        # Load session
        session_stmt = select(PatientSession).where(
            PatientSession.id == request.session_id
        )
        session_result = await self._session.execute(session_stmt)
        session = session_result.scalar_one_or_none()

        record_id = str(uuid4())
        record = MedicalRecord(
            id=record_id,
            session_id=request.session_id,
            patient_id=session.patient_id if session else "",
            doctor_id=doctor_id,
            clinic_id=session.clinic_id if session else "",
            final_assessment=request.final_assessment,
            final_plan=request.final_plan,
            final_rationale=request.final_rationale,
            doctor_free_text=request.doctor_free_text,
            accepted_consideration_ids=request.accepted_consideration_ids,
            modified_consideration_ids=request.modified_consideration_ids,
            rejected_consideration_ids=request.rejected_consideration_ids,
            added_consideration_ids=request.added_consideration_ids,
            tier3_consent_id="verified",
            sms_receipt_sent=False,
        )
        self._session.add(record)

        if session:
            session.status = SessionStatus.RECORD_COMMITTED.value
            session.medical_record_id = record_id

        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.RECORD_COMMITTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.DOCTOR, actor_id=doctor_id)
            .session(request.session_id)
            .metadata({"record_id": record_id})
            .build(),
        )

        return CommitRecordResponse(
            record_id=record_id,
            committed_at=datetime.now(timezone.utc).isoformat(),
            receipt_sent=False,
        )

    async def submit_feedback(
        self,
        doctor_id: str,
        request: FeedbackRequest,
    ) -> FeedbackResponse:
        logger.info(
            "Doctor feedback received",
            session_id=request.session_id,
            rating=request.overall_quality,
        )
        return FeedbackResponse(received=True)