import json
import re
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
from packages.db.models.vitals import Vitals
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    DoctorAction,
    FallbackReason,
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
        redis = get_redis()

        queue: list[DoctorQueuePatient] = []
        for s in sessions:
            intake_summary = await redis.get(f"intake_summary:{s.id}")
            intake_verified_raw = await redis.get(f"intake_verified:{s.id}")
            verified_meta_raw = await redis.get(f"intake_verified_meta:{s.id}")
            verified_meta = self._safe_json(verified_meta_raw)
            profile = self._extract_profile_from_summary(intake_summary)
            fallback_complaint = self._extract_main_concern(intake_summary)

            queue.append(
                DoctorQueuePatient(
                    session_id=s.id,
                    arrival_order=s.arrival_order,
                    synthesis_ready=(s.status == SessionStatus.SYNTHESIS_COMPLETE.value),
                    fallback_active=(
                        s.status == SessionStatus.SYNTHESIS_FALLBACK.value
                        or bool(s.synthesis_fallback_active)
                    ),
                    urgency_flag=(
                        UrgencyFlag.CRITICAL if s.emergency_flagged else UrgencyFlag.ROUTINE
                    ),
                    chief_complaint=s.chief_complaint or fallback_complaint or "",
                    ready_since=(
                        s.nurse_ready_at.isoformat()
                        if s.nurse_ready_at
                        else s.created_at.isoformat()
                    ),
                    patient_name=profile["name"],
                    patient_age=profile["age"],
                    patient_location=profile["location"],
                    short_summary=self._extract_short_summary(intake_summary),
                    nurse_feedback=self._extract_nurse_feedback(verified_meta),
                    intake_verified=(
                        True
                        if intake_verified_raw == "true"
                        else False if intake_verified_raw == "false" else None
                    ),
                )
            )

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

        # Load synthesis/intake status from cache
        redis = get_redis()
        synthesis_raw = await redis.get(f"synthesis_status:{session_id}")
        synthesis_data = self._safe_json(synthesis_raw)
        intake_summary = await redis.get(f"intake_summary:{session_id}")
        verified_meta_raw = await redis.get(f"intake_verified_meta:{session_id}")
        verified_meta = self._safe_json(verified_meta_raw)
        profile = self._extract_profile_from_summary(intake_summary)

        vitals_stmt = (
            select(Vitals)
            .where(Vitals.session_id == session_id)
            .order_by(Vitals.created_at.desc())
            .limit(1)
        )
        vitals_result = await self._session.execute(vitals_stmt)
        latest_vitals = vitals_result.scalar_one_or_none()

        # If worker hasn't synthesized yet, generate on-demand so doctor
        # still gets real AI output on first open.
        if not diffs:
            generated = await self._generate_live_synthesis_if_missing(
                session=session,
                session_id=session_id,
                intake_summary=intake_summary,
                latest_vitals=latest_vitals,
            )
            if generated:
                diff_result = await self._session.execute(diff_stmt)
                diffs = diff_result.scalars().all()
                synthesis_data = {
                    "synthesis_ready": True,
                    "fallback_active": False,
                    "fallback_reason": None,
                }

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

        # If AI synthesis has not populated differentials yet, provide a safe
        # provisional differential so doctor still sees actionable context.
        if not differentials:
            provisional_title = (
                self._extract_main_concern(intake_summary)
                or session.chief_complaint
                or "General clinical review required"
            )
            differentials = [
                DiffSchema(
                    consideration_id=f"provisional-{session_id}",
                    title=f"Provisional: {provisional_title[:120]}",
                    supporting_features=self._extract_key_details(intake_summary),
                    clinical_reasoning=(
                        "AI synthesis is pending. Use nurse-verified intake and vitals to "
                        "form initial differential assessment."
                    ),
                    urgency_flag=UrgencyFlag.CRITICAL
                    if session.emergency_flagged
                    else UrgencyFlag.ROUTINE,
                    ai_generated=False,
                    doctor_action=None,
                    doctor_modification=None,
                    sort_order=0,
                )
            ]

        vitals_summary = None
        outlier_flags = []
        if latest_vitals is not None:
            from packages.schemas.doctor import VitalsSummary

            vitals_summary = VitalsSummary(
                temperature_celsius=latest_vitals.temperature_celsius,
                bp_systolic_mmhg=latest_vitals.bp_systolic_mmhg,
                bp_diastolic_mmhg=latest_vitals.bp_diastolic_mmhg,
                heart_rate_bpm=latest_vitals.heart_rate_bpm,
                respiratory_rate_pm=latest_vitals.respiratory_rate_pm,
                spo2_percent=latest_vitals.spo2_percent,
                weight_kg=latest_vitals.weight_kg,
                height_cm=latest_vitals.height_cm,
            )
            outlier_flags = latest_vitals.outlier_flags or []

        structured_context = self._build_structured_context(
            session=session,
            intake_summary=intake_summary,
        )

        return PatientContextResponse(
            session_id=session_id,
            synthesis_ready=(
                bool(synthesis_data.get("synthesis_ready"))
                or session.status == SessionStatus.SYNTHESIS_COMPLETE.value
            ),
            fallback_active=(
                bool(synthesis_data.get("fallback_active"))
                or session.status == SessionStatus.SYNTHESIS_FALLBACK.value
                or bool(session.synthesis_fallback_active)
            ),
            fallback_reason=(
                synthesis_data.get("fallback_reason")
                or session.synthesis_fallback_reason
            ),
            structured_context=structured_context,
            vitals_summary=vitals_summary,
            outlier_flags=outlier_flags,
            emergency_flagged=session.emergency_flagged,
            differentials=differentials,
            synthesis_timestamp=session.synthesis_complete_at.isoformat()
            if session.synthesis_complete_at else None,
            intake_summary_preview=intake_summary,
            nurse_feedback=self._extract_nurse_feedback(verified_meta),
            patient_name=profile["name"],
            patient_age=profile["age"],
            patient_location=profile["location"],
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

    async def _generate_live_synthesis_if_missing(
        self,
        session: PatientSession,
        session_id: str,
        intake_summary: str | None,
        latest_vitals: Vitals | None,
    ) -> bool:
        from api.config import get_settings
        from api.services.intake_assistant import IntakeAssistant

        settings = get_settings()
        if not settings.llm_api_key:
            return False

        vitals_text = "No vitals submitted."
        if latest_vitals is not None:
            vitals_text = (
                f"Temp {latest_vitals.temperature_celsius:.1f} C, "
                f"BP {latest_vitals.bp_systolic_mmhg}/{latest_vitals.bp_diastolic_mmhg} mmHg, "
                f"HR {latest_vitals.heart_rate_bpm} bpm, "
                f"RR {latest_vitals.respiratory_rate_pm}/min, "
                f"SpO2 {latest_vitals.spo2_percent}%, "
                f"Weight {latest_vitals.weight_kg} kg, Height {latest_vitals.height_cm} cm."
            )

        assistant = IntakeAssistant()
        system_prompt = (
            "You are a clinical differential assistant. Return ONLY JSON with key "
            "'differentials', where value is an array of 1-3 objects. Each object has: "
            "title (string), clinical_reasoning (string), supporting_features (string array), "
            "urgency_flag ('routine'|'urgent'|'critical')."
        )
        user_prompt = (
            f"Session ID: {session_id}\n"
            f"Chief complaint: {session.chief_complaint or 'Not provided'}\n"
            f"Intake summary: {intake_summary or 'Not available'}\n"
            f"Vitals: {vitals_text}\n"
            f"Emergency flagged: {session.emergency_flagged}\n"
            "Generate concise, clinically reasonable differential considerations."
        )

        try:
            raw = await assistant._call_llm(  # noqa: SLF001 - controlled internal reuse
                provider=settings.llm_provider,
                model_id=settings.llm_model_id,
                api_key=settings.llm_api_key,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=max(300, settings.llm_max_tokens),
            )
            parsed = assistant._parse_json_object(raw)  # noqa: SLF001
            items = parsed.get("differentials") if isinstance(parsed, dict) else None
            if not isinstance(items, list) or len(items) == 0:
                return False

            allowed_urgency = {
                UrgencyFlag.ROUTINE.value,
                UrgencyFlag.URGENT.value,
                UrgencyFlag.CRITICAL.value,
            }
            for idx, item in enumerate(items[:3]):
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title", "")).strip()
                reasoning = str(item.get("clinical_reasoning", "")).strip()
                if not title or not reasoning:
                    continue
                raw_features = item.get("supporting_features", [])
                features = (
                    [str(x).strip() for x in raw_features if str(x).strip()]
                    if isinstance(raw_features, list)
                    else []
                )
                urgency = str(item.get("urgency_flag", UrgencyFlag.ROUTINE.value)).lower()
                if urgency not in allowed_urgency:
                    urgency = (
                        UrgencyFlag.CRITICAL.value
                        if session.emergency_flagged
                        else UrgencyFlag.ROUTINE.value
                    )

                self._session.add(
                    DifferentialConsideration(
                        id=str(uuid4()),
                        session_id=session_id,
                        title=title[:200],
                        supporting_features=features[:8],
                        clinical_reasoning=reasoning[:1500],
                        urgency_flag=urgency,
                        ai_generated=True,
                        sort_order=idx,
                    )
                )

            session.status = SessionStatus.SYNTHESIS_COMPLETE.value
            session.synthesis_fallback_active = False
            session.synthesis_fallback_reason = None
            session.synthesis_complete_at = datetime.now(timezone.utc)
            await self._session.flush()

            redis = get_redis()
            await redis.setex(
                f"synthesis_status:{session_id}",
                3600,
                json.dumps(
                    {
                        "synthesis_ready": True,
                        "fallback_active": False,
                        "fallback_reason": None,
                    }
                ),
            )
            return True
        except Exception as exc:
            logger.warning(
                "doctor_live_synthesis_failed",
                session_id=session_id,
                reason=FallbackReason.LLM_ERROR.value,
                error=str(exc),
            )
            return False

    @staticmethod
    def _safe_json(raw: str | None) -> dict:
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
            return {}
        except Exception:
            return {}

    @staticmethod
    def _extract_short_summary(intake_summary: str | None) -> str | None:
        main = DoctorService._extract_main_concern(intake_summary)
        details = DoctorService._extract_key_details(intake_summary)
        clean_details = [
            d for d in details if not d.lower().startswith("main concern:")
        ]
        joined = " ".join([main] + clean_details[:1] if main else clean_details[:2]).strip()
        return joined[:240] if joined else None

    @staticmethod
    def _extract_main_concern(intake_summary: str | None) -> str | None:
        if not intake_summary:
            return None
        for clean in DoctorService._summary_segments(intake_summary):
            low = clean.lower()
            if low.startswith("main concern:"):
                return clean.split(":", 1)[1].strip()
        return None

    @staticmethod
    def _extract_key_details(intake_summary: str | None) -> list[str]:
        if not intake_summary:
            return []
        details: list[str] = []
        for clean in DoctorService._summary_segments(intake_summary):
            low = clean.lower()
            if low.startswith("detail"):
                details.append(clean.split(":", 1)[1].strip() if ":" in clean else clean)
            elif low.startswith("main concern:"):
                details.append(clean)
            elif ":" in clean:
                key = clean.split(":", 1)[0].strip().lower()
                if key not in {"name", "age", "location", "city"}:
                    details.append(clean.split(":", 1)[1].strip())
        return details[:6]

    @staticmethod
    def _extract_profile_from_summary(intake_summary: str | None) -> dict[str, str | int | None]:
        profile: dict[str, str | int | None] = {
            "name": None,
            "age": None,
            "location": None,
        }
        if not intake_summary:
            return profile

        for clean in DoctorService._summary_segments(intake_summary):
            if ":" not in clean:
                continue
            key, value = clean.split(":", 1)
            key_low = key.strip().lower()
            value = value.strip()
            if key_low == "name" and value:
                profile["name"] = value
            elif key_low == "age":
                m = re.search(r"\d{1,3}", value)
                if m:
                    profile["age"] = int(m.group(0))
            elif key_low in {"location", "city"} and value:
                profile["location"] = value
        return profile

    @staticmethod
    def _summary_segments(intake_summary: str | None) -> list[str]:
        if not intake_summary:
            return []
        normalized = intake_summary.replace("\r", "\n")
        segments: list[str] = []
        for line in normalized.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue
            if "•" in stripped:
                parts = [p.strip() for p in stripped.split("•") if p.strip()]
                segments.extend(parts)
            else:
                segments.append(stripped.lstrip("-").strip())
        refined: list[str] = []
        for seg in segments:
            if "|" in seg:
                refined.extend([p.strip() for p in seg.split("|") if p.strip()])
            else:
                refined.append(seg)
        return [s for s in refined if s]

    @staticmethod
    def _extract_nurse_feedback(verified_meta: dict) -> str | None:
        if not verified_meta:
            return None
        note = verified_meta.get("note")
        if isinstance(note, str) and note.strip():
            return note.strip()
        return None

    def _build_structured_context(
        self,
        session: PatientSession,
        intake_summary: str | None,
    ):
        from packages.schemas.doctor import StructuredContext

        chief_complaint = (
            session.chief_complaint
            or self._extract_main_concern(intake_summary)
            or "Not provided"
        )
        history = self._extract_short_summary(intake_summary) or chief_complaint
        key_details = self._extract_key_details(intake_summary)

        return StructuredContext(
            chief_complaint=chief_complaint,
            history_of_present_illness=history,
            past_medical_history=[],
            current_medications=[],
            allergies=[],
            social_history=(
                key_details[0] if key_details else None
            ),
            review_of_systems=None,
        )
