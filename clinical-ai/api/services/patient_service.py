import json
import logging
from datetime import datetime, timezone, timedelta
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.cache.redis_client import get_redis
from api.services.intake_assistant import IntakeAssistant
from packages.db.models.session import PatientSession
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    OutcomeStatus,
    QuestionType,
    SessionStatus,
)
from packages.schemas.patient import (
    CompleteSessionRequest,
    CompleteSessionResponse,
    GrievanceRequest,
    GrievanceResponse,
    MyDataResponse,
    QuestionObject,
    StartSessionRequest,
    StartSessionResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
)

logger = structlog.get_logger(__name__)

_SESSION_TTL_MINUTES = 20

class PatientService:

    def __init__(
        self,
        session: AsyncSession,
        audit: AuditService,
    ) -> None:
        self._session = session
        self._audit = audit
        self._intake = IntakeAssistant()

    async def start_session(
        self,
        patient_id: str,
        request: StartSessionRequest,
    ) -> StartSessionResponse:
        from packages.db.models.consent import ConsentToken
        from packages.domain.enums import ConsentStatus, ConsentTier

        # Check Tier 2 for adaptive questioning
        tier2_stmt = (
            select(ConsentToken)
            .where(ConsentToken.patient_id == patient_id)
            .where(ConsentToken.tier == ConsentTier.TIER_2.value)
            .where(ConsentToken.status == ConsentStatus.ACTIVE.value)
            .limit(1)
        )
        tier2_result = await self._session.execute(tier2_stmt)
        tier2_active = tier2_result.scalar_one_or_none() is not None

        now = datetime.now(timezone.utc)
        session = PatientSession(
            id=str(uuid4()),
            patient_id=patient_id,
            clinic_id=request.clinic_id,
            status=SessionStatus.QUESTIONNAIRE_IN_PROGRESS.value,
            use_static_form=not tier2_active,
            expires_at=now + timedelta(minutes=_SESSION_TTL_MINUTES),
        )
        self._session.add(session)
        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.SESSION_STARTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .session(session.id)
            .clinic(request.clinic_id)
            .build(),
        )
        first_decision = await self._intake.decide_next(
            [],
            current_topic="chief_complaint",
        )
        first_question = first_decision.next_question or QuestionObject(
            question_id="a" * 64,
            question_text="What is your main health concern today?",
            question_type=QuestionType.TEXT,
            options=None,
            topic_tag="chief_complaint",
            is_emergency_check=False,
        )

        return StartSessionResponse(
            session_id=session.id,
            expires_at=session.expires_at.isoformat(),
            use_static_form=not tier2_active,
            first_question=first_question,
        )

    async def submit_answer(
        self,
        patient_id: str,
        request: SubmitAnswerRequest,
    ) -> SubmitAnswerResponse:
        # Load session
        stmt = select(PatientSession).where(
            PatientSession.id == request.session_id
        )
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()

        if session is None:
            from fastapi import HTTPException, status as http_status
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail={"error": "SESSION_NOT_FOUND", "error_id": str(uuid4())},
            )

        # Store first answer as chief complaint
        if not session.chief_complaint and request.topic_tag == "chief_complaint":
            session.chief_complaint = request.answer_text[:500]

        # Append answer to Redis
        redis = get_redis()
        answers_key = f"answers:{request.session_id}"
        raw = await redis.get(answers_key)
        answers = json.loads(raw) if raw else []
        answers.append({
            "question_hash": request.question_hash,
            "question_text": "",
            "answer_text": request.answer_text,
            "topic_tag": request.topic_tag,
        })
        await redis.setex(answers_key, 7200, json.dumps(answers))

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.ANSWER_SUBMITTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .session(request.session_id)
            .metadata({"topic_tag": request.topic_tag, "answer_count": len(answers)})
            .build(),
        )

        intake_decision = await self._intake.decide_next(
            answers,
            current_topic=request.topic_tag,
        )
        summary_preview = await self._intake.build_summary_for_nurse(answers)
        await redis.setex(f"intake_summary:{request.session_id}", 7200, summary_preview)

        return SubmitAnswerResponse(
            saved=True,
            questionnaire_done=intake_decision.questionnaire_done,
            next_question=intake_decision.next_question,
            emergency_advisory=intake_decision.emergency_advisory,
            questions_remaining=intake_decision.questions_remaining,
            intake_summary_preview=summary_preview,
        )

    async def complete_session(
        self,
        patient_id: str,
        request: CompleteSessionRequest,
    ) -> CompleteSessionResponse:
        stmt = select(PatientSession).where(
            PatientSession.id == request.session_id
        )
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()

        if session:
            session.status = SessionStatus.QUESTIONNAIRE_COMPLETE.value
            session.questionnaire_complete_at = datetime.now(timezone.utc)
            await self._session.flush()
        redis = get_redis()
        summary = await redis.get(f"intake_summary:{request.session_id}")
        summary_preview = summary if summary else "Intake complete."

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.QUESTIONNAIRE_COMPLETE)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .session(request.session_id)
            .build(),
        )

        return CompleteSessionResponse(
            questionnaire_complete=True,
            nurse_notified=True,
            message="Your information has been submitted. Please wait for the nurse.",
            intake_summary_preview=summary_preview,
        )

    async def get_intake_summary(
        self,
        patient_id: str,
        session_id: str,
    ):
        stmt = select(PatientSession).where(PatientSession.id == session_id)
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()
        if session is None or session.patient_id != patient_id:
            from fastapi import HTTPException, status as http_status
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail={"error": "SESSION_NOT_FOUND", "error_id": str(uuid4())},
            )

        redis = get_redis()
        raw = await redis.get(f"answers:{session_id}")
        answers = json.loads(raw) if raw else []
        summary = await self._intake.build_summary_for_nurse(answers)
        await redis.setex(f"intake_summary:{session_id}", 7200, summary)

        from packages.schemas.patient import IntakeSummaryResponse
        return IntakeSummaryResponse(
            session_id=session_id,
            intake_summary=summary,
            questionnaire_done=bool(session.questionnaire_complete_at),
        )

    async def get_my_data(self, patient_id: str) -> MyDataResponse:
        from packages.db.models.consent import ConsentToken
        from packages.schemas.patient import ConsentRecord, SessionSummary

        # Load consents
        consent_stmt = select(ConsentToken).where(
            ConsentToken.patient_id == patient_id
        )
        consent_result = await self._session.execute(consent_stmt)
        consents = consent_result.scalars().all()

        consent_records = [
            ConsentRecord(
                tier=c.tier,
                status=c.status,
                granted_at=c.granted_at.isoformat(),
                version=c.consent_document_version,
                withdrawn_at=(
                    c.withdrawn_at.isoformat() if c.withdrawn_at else None
                ),
            )
            for c in consents
        ]

        # Load sessions
        session_stmt = (
            select(PatientSession)
            .where(PatientSession.patient_id == patient_id)
            .order_by(PatientSession.created_at.desc())
            .limit(20)
        )
        session_result = await self._session.execute(session_stmt)
        sessions = session_result.scalars().all()

        session_summaries = [
            SessionSummary(
                session_id=s.id,
                date=s.created_at.isoformat(),
                status=s.status,
            )
            for s in sessions
        ]

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.RIGHTS_DATA_VIEWED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .build(),
        )

        return MyDataResponse(
            patient_id=patient_id,
            age_band="unknown",
            consent_records=consent_records,
            sessions=session_summaries,
            data_categories_held=[
                "symptom_answers",
                "vitals",
                "session_metadata",
            ],
        )

    async def submit_grievance(
        self,
        patient_id: str,
        request: GrievanceRequest,
    ) -> GrievanceResponse:
        grievance_id = str(uuid4())

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.RIGHTS_GRIEVANCE_SUBMITTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT, actor_id=patient_id)
            .patient(patient_id)
            .metadata({"subject": request.subject})
            .build(),
        )

        return GrievanceResponse(
            grievance_id=grievance_id,
            acknowledged_at=datetime.now(timezone.utc).isoformat(),
            resolution_sla_days=30,
        )
