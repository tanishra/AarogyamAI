import json
import logging
from datetime import datetime, timezone, timedelta
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.cache.redis_client import get_redis
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

# Static fallback first question
_FIRST_QUESTION = QuestionObject(
    question_id="a" * 64,
    question_text="What is your main health concern today?",
    question_type=QuestionType.TEXT,
    options=None,
    topic_tag="chief_complaint",
    is_emergency_check=False,
)


class PatientService:

    def __init__(
        self,
        session: AsyncSession,
        audit: AuditService,
    ) -> None:
        self._session = session
        self._audit = audit

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

        return StartSessionResponse(
            session_id=session.id,
            expires_at=session.expires_at.isoformat(),
            use_static_form=not tier2_active,
            first_question=_FIRST_QUESTION,
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

        # Stub — adaptive questioning wired in prototype phase
        done = len(answers) >= 10
        next_q = None if done else QuestionObject(
            question_id="b" * 64,
            question_text="Can you describe the severity on a scale of 1-10?",
            question_type=QuestionType.SCALE,
            options=None,
            topic_tag="severity",
            is_emergency_check=False,
        )

        return SubmitAnswerResponse(
            saved=True,
            questionnaire_done=done,
            next_question=next_q,
            emergency_advisory=None,
            questions_remaining=max(0, 10 - len(answers)),
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