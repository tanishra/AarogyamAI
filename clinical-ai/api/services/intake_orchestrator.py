from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.services.intake_assistant import IntakeAssistant
from packages.cache.redis_client import get_redis
from packages.db.models.session import PatientSession
from packages.domain.enums import SessionStatus
from packages.schemas.intake import (
    FallbackTransition,
    IntakeFinalizeResponse,
    IntakeModeSwitchRequest,
    IntakeModeSwitchResponse,
    IntakeSessionInitRequest,
    IntakeSessionInitResponse,
    IntakeStateResponse,
)

_VALID_MODES = {"text_llm", "fixed"}
_FALLBACK_CHAIN = ["text_llm", "fixed"]
_TTL_SECONDS = 24 * 3600


class IntakeOrchestrator:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._redis = get_redis()
        self._intake = IntakeAssistant()

    async def init_session(
        self,
        patient_id: str,
        request: IntakeSessionInitRequest,
        ws_url: str,
    ) -> IntakeSessionInitResponse:
        session = await self._get_owned_session(patient_id, request.session_id)
        mode = request.preferred_mode if request.preferred_mode in _VALID_MODES else "text_llm"

        state = {
            "active_mode": mode,
            "questionnaire_done": bool(session.questionnaire_complete_at),
            "questions_remaining": 0,
            "emergency_flagged": False,
            "nurse_verification_required": True,
            "fallback_history": [],
            "current_topic": "chat",
            "pending_question": None,
        }
        await self._save_state(request.session_id, state)

        # Ensure first question exists in state path for WS clients.
        first = await self._intake.decide_next(
            [],
            current_topic="chief_complaint",
        )
        if first.next_question is not None:
            state["current_topic"] = first.next_question.topic_tag
            state["questions_remaining"] = first.questions_remaining
            state["pending_question"] = {
                "question_id": first.next_question.question_id,
                "question_text": first.next_question.question_text,
                "topic_tag": first.next_question.topic_tag,
            }
            await self._save_state(request.session_id, state)

        return IntakeSessionInitResponse(
            session_id=request.session_id,
            active_mode=state["active_mode"],
            fallback_chain=_FALLBACK_CHAIN,
            ws_url=ws_url,
            voice_token=None,
            expires_at=(datetime.now(timezone.utc)).isoformat(),
        )

    async def switch_mode(
        self,
        patient_id: str,
        request: IntakeModeSwitchRequest,
    ) -> IntakeModeSwitchResponse:
        await self._get_owned_session(patient_id, request.session_id)
        state = await self._load_state(request.session_id)
        previous = state["active_mode"]
        target = request.target_mode if request.target_mode in _VALID_MODES else previous
        state["active_mode"] = target
        state.setdefault("fallback_history", []).append(
            {
                "from_mode": previous,
                "to_mode": target,
                "reason": request.reason,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await self._save_state(request.session_id, state)
        return IntakeModeSwitchResponse(
            session_id=request.session_id,
            active_mode=target,
            previous_mode=previous,
            fallback_reason=request.reason,
        )

    async def get_state(
        self,
        patient_id: str,
        session_id: str,
    ) -> IntakeStateResponse:
        session = await self._get_owned_session(patient_id, session_id)
        state = await self._load_state(session_id)
        history = [FallbackTransition(**h) for h in state.get("fallback_history", [])]
        return IntakeStateResponse(
            session_id=session_id,
            active_mode=state["active_mode"],
            questionnaire_done=bool(state["questionnaire_done"]),
            questions_remaining=int(state["questions_remaining"]),
            emergency_flagged=bool(state["emergency_flagged"]),
            nurse_verification_required=True,
            fallback_history=history,
        )

    async def finalize(
        self,
        patient_id: str,
        session_id: str,
    ) -> IntakeFinalizeResponse:
        session = await self._get_owned_session(patient_id, session_id)
        session.status = SessionStatus.QUESTIONNAIRE_COMPLETE.value
        if not session.questionnaire_complete_at:
            session.questionnaire_complete_at = datetime.now(timezone.utc)
        await self._session.flush()

        state = await self._load_state(session_id)
        state["questionnaire_done"] = True
        state["questions_remaining"] = 0
        await self._save_state(session_id, state)

        summary = await self._redis.get(f"intake_summary:{session_id}")
        summary_preview = summary or "Intake complete."
        return IntakeFinalizeResponse(
            session_id=session_id,
            questionnaire_complete=True,
            intake_summary_preview=summary_preview,
            nurse_verification_required=True,
        )

    async def ingest_answer(
        self,
        patient_id: str,
        session_id: str,
        text: str,
        topic_tag: str | None = None,
    ) -> dict:
        session = await self._get_owned_session(patient_id, session_id)
        state = await self._load_state(session_id)

        answers_key = f"answers:{session_id}"
        raw = await self._redis.get(answers_key)
        answers = json.loads(raw) if raw else []
        used_topic = topic_tag or state.get("current_topic") or "free_text"
        answers.append(
            {
                "question_hash": str(uuid4()).replace("-", ""),
                "question_text": "",
                "answer_text": text,
                "topic_tag": used_topic,
            }
        )
        await self._redis.setex(answers_key, _TTL_SECONDS, json.dumps(answers))

        decision = await self._intake.decide_next(
            answers,
            current_topic=used_topic,
        )
        if decision.questionnaire_done:
            session.status = SessionStatus.QUESTIONNAIRE_COMPLETE.value
            if not session.questionnaire_complete_at:
                session.questionnaire_complete_at = datetime.now(timezone.utc)
            await self._session.flush()

        summary = await self._intake.build_summary_for_nurse(answers)
        human_summary = (
            await self._intake.build_human_summary_for_patient(answers)
            if decision.questionnaire_done
            else ""
        )
        await self._redis.setex(f"intake_summary:{session_id}", _TTL_SECONDS, summary)

        state["questionnaire_done"] = decision.questionnaire_done
        state["questions_remaining"] = decision.questions_remaining
        state["emergency_flagged"] = bool(decision.emergency_advisory)
        if decision.next_question is not None:
            state["current_topic"] = decision.next_question.topic_tag
            state["pending_question"] = {
                "question_id": decision.next_question.question_id,
                "question_text": decision.next_question.question_text,
                "topic_tag": decision.next_question.topic_tag,
            }
        else:
            state["pending_question"] = None
        await self._save_state(session_id, state)

        return {
            "decision": decision,
            "summary": summary,
            "human_summary": human_summary,
            "answers_count": len(answers),
        }

    async def apply_fallback(
        self,
        patient_id: str,
        session_id: str,
        target_mode: str,
        reason: str,
    ) -> IntakeModeSwitchResponse:
        return await self.switch_mode(
            patient_id=patient_id,
            request=IntakeModeSwitchRequest(
                session_id=session_id,
                target_mode=target_mode,
                reason=reason,
            ),
        )

    async def _get_owned_session(
        self,
        patient_id: str,
        session_id: str,
    ) -> PatientSession:
        stmt = select(PatientSession).where(PatientSession.id == session_id)
        result = await self._session.execute(stmt)
        session = result.scalar_one_or_none()
        if session is None or session.patient_id != patient_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "SESSION_NOT_FOUND", "error_id": str(uuid4())},
            )
        return session

    async def _load_state(self, session_id: str) -> dict:
        raw = await self._redis.get(f"intake_state:{session_id}")
        if raw:
            try:
                return json.loads(raw)
            except Exception:
                pass
        return {
            "active_mode": "text_llm",
            "questionnaire_done": False,
            "questions_remaining": 0,
            "emergency_flagged": False,
            "nurse_verification_required": True,
            "fallback_history": [],
            "current_topic": "chat",
            "pending_question": None,
        }

    async def get_pending_question(
        self,
        patient_id: str,
        session_id: str,
    ) -> dict | None:
        await self._get_owned_session(patient_id, session_id)
        state = await self._load_state(session_id)
        pending = state.get("pending_question")
        if isinstance(pending, dict) and pending.get("question_text"):
            return pending
        return None

    async def _save_state(self, session_id: str, state: dict) -> None:
        await self._redis.setex(
            f"intake_state:{session_id}",
            _TTL_SECONDS,
            json.dumps(state),
        )
