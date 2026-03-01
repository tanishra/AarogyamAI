from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from uuid import uuid4

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.config import get_settings
from api.dependencies import (
    CurrentPatient,
    DBSession,
    TokenPayload,
    _decode_unverified,
    _verify_cognito_token,
)
from api.services.intake_orchestrator import IntakeOrchestrator
from api.services.realtime_transcriber import RealtimeTranscriber, TranscriptionUnavailable
from api.services.voice_providers import VoiceUnavailable, get_tts_provider
from packages.db.client import get_session
from packages.schemas.intake import (
    IntakeFinalizeResponse,
    IntakeModeSwitchRequest,
    IntakeModeSwitchResponse,
    IntakeSessionInitRequest,
    IntakeSessionInitResponse,
    IntakeStateResponse,
)

rest_router = APIRouter(tags=["intake"])
ws_router = APIRouter(tags=["intake-ws"])
_transcriber = RealtimeTranscriber()
_tts = get_tts_provider()
logger = structlog.get_logger(__name__)


@rest_router.post("/intake/session/init", response_model=IntakeSessionInitResponse)
async def init_intake_session(
    body: IntakeSessionInitRequest,
    token: CurrentPatient,
    session: DBSession,
):
    ws_url = f"/ws/v1/intake/session/{body.session_id}"
    return await IntakeOrchestrator(session).init_session(
        patient_id=token.sub,
        request=body,
        ws_url=ws_url,
    )


@rest_router.post(
    "/intake/session/mode-switch",
    response_model=IntakeModeSwitchResponse,
)
async def switch_intake_mode(
    body: IntakeModeSwitchRequest,
    token: CurrentPatient,
    session: DBSession,
):
    return await IntakeOrchestrator(session).switch_mode(
        patient_id=token.sub,
        request=body,
    )


@rest_router.get(
    "/intake/session/{session_id}/state",
    response_model=IntakeStateResponse,
)
async def get_intake_state(
    session_id: str,
    token: CurrentPatient,
    session: DBSession,
):
    return await IntakeOrchestrator(session).get_state(
        patient_id=token.sub,
        session_id=session_id,
    )


@rest_router.post(
    "/intake/session/{session_id}/finalize",
    response_model=IntakeFinalizeResponse,
)
async def finalize_intake(
    session_id: str,
    token: CurrentPatient,
    session: DBSession,
):
    return await IntakeOrchestrator(session).finalize(
        patient_id=token.sub,
        session_id=session_id,
    )


@ws_router.websocket("/ws/v1/intake/session/{session_id}")
async def intake_ws(
    websocket: WebSocket,
    session_id: str,
):
    token = await _auth_ws_patient(websocket)
    if token is None:
        return
    await websocket.accept()

    async with get_session() as session:
        orchestrator = IntakeOrchestrator(session)
        try:
            state = await orchestrator.get_state(token.sub, session_id)
            await _send_event(
                websocket,
                "intake.state",
                session_id,
                state.model_dump(),
            )
            pending = await orchestrator.get_pending_question(token.sub, session_id)
            if pending:
                audio_payload = await _build_assistant_audio_payload(
                    session_id=session_id,
                    text=str(pending.get("question_text", "")),
                )
                pending_payload = {
                    "question_id": str(pending.get("question_id", "")),
                    "question_text": str(pending.get("question_text", "")),
                    "topic_tag": str(pending.get("topic_tag", "free_text")),
                    "mode": state.active_mode,
                }
                if audio_payload is not None:
                    pending_payload.update(audio_payload)
                await _send_event(
                    websocket,
                    "assistant.question",
                    session_id,
                    pending_payload,
                )

            while True:
                message = await websocket.receive_text()
                event = json.loads(message)
                event_name = str(event.get("event", "")).strip()
                payload = event.get("payload", {}) or {}

                if event_name == "text.answer":
                    await _handle_text_answer(
                        websocket, orchestrator, token.sub, session_id, payload
                    )
                    continue

                if event_name == "audio.chunk":
                    await _handle_audio_chunk(
                        websocket, orchestrator, token.sub, session_id, payload
                    )
                    continue

                if event_name == "control.switch_mode":
                    mode_req = IntakeModeSwitchRequest(
                        session_id=session_id,
                        target_mode=str(payload.get("target_mode", "fixed")),
                        reason=str(payload.get("reason", "manual_switch")),
                    )
                    switched = await orchestrator.switch_mode(token.sub, mode_req)
                    await _send_event(
                        websocket,
                        "intake.fallback",
                        session_id,
                        {
                            "from": switched.previous_mode,
                            "to": switched.active_mode,
                            "reason": switched.fallback_reason,
                        },
                    )
                    continue

                if event_name == "control.complete":
                    done = await orchestrator.finalize(token.sub, session_id)
                    await _send_event(
                        websocket,
                        "intake.completed",
                        session_id,
                        {
                            "questionnaire_done": done.questionnaire_complete,
                            "questions_remaining": 0,
                        },
                    )
                    continue

                await _send_event(
                    websocket,
                    "error",
                    session_id,
                    {
                        "code": "UNSUPPORTED_EVENT",
                        "message": f"Unsupported event: {event_name}",
                        "recoverable": True,
                    },
                )

        except WebSocketDisconnect:
            return
        except Exception as exc:
            await _send_event(
                websocket,
                "error",
                session_id,
                {
                    "code": "INTERNAL_ERROR",
                    "message": str(exc),
                    "recoverable": False,
                },
            )


async def _handle_text_answer(
    websocket: WebSocket,
    orchestrator: IntakeOrchestrator,
    patient_id: str,
    session_id: str,
    payload: dict,
) -> None:
    text = str(payload.get("text", "")).strip()
    topic_tag = payload.get("topic_tag")
    if not text:
        await _send_event(
            websocket,
            "error",
            session_id,
            {
                "code": "EMPTY_ANSWER",
                "message": "text.answer requires non-empty text",
                "recoverable": True,
            },
        )
        return

    result = await orchestrator.ingest_answer(
        patient_id=patient_id,
        session_id=session_id,
        text=text,
        topic_tag=str(topic_tag) if topic_tag else None,
    )
    decision = result["decision"]
    await _send_event(
        websocket,
        "intake.summary.updated",
        session_id,
        {"summary": result["summary"]},
    )

    if decision.emergency_advisory:
        await _send_event(
            websocket,
            "intake.emergency_flag",
            session_id,
            {"flagged": True, "advisory": decision.emergency_advisory},
        )

    if decision.next_question is not None:
        next_payload = {
            "question_id": decision.next_question.question_id,
            "question_text": decision.next_question.question_text,
            "topic_tag": decision.next_question.topic_tag,
            "mode": (await orchestrator.get_state(patient_id, session_id)).active_mode,
        }
        audio_payload = await _build_assistant_audio_payload(
            session_id=session_id,
            text=next_payload["question_text"],
        )
        if audio_payload is not None:
            next_payload.update(audio_payload)
        await _send_event(
            websocket,
            "assistant.question",
            session_id,
            next_payload,
        )
    else:
        human_summary = result.get("human_summary", "")
        await _send_event(
            websocket,
            "intake.completed",
            session_id,
            {
                "questionnaire_done": True,
                "questions_remaining": 0,
                "human_summary": human_summary,
            },
        )


async def _handle_audio_chunk(
    websocket: WebSocket,
    orchestrator: IntakeOrchestrator,
    patient_id: str,
    session_id: str,
    payload: dict,
) -> None:
    chunk_b64 = str(payload.get("pcm16_b64", ""))
    chunk_b64_alt = str(payload.get("audio_b64", ""))
    mime_type = str(payload.get("mime_type", "audio/pcm"))
    is_last = bool(payload.get("is_last", False))
    if not chunk_b64:
        chunk_b64 = chunk_b64_alt
    if not chunk_b64 and not is_last:
        await _send_event(
            websocket,
            "error",
            session_id,
            {
                "code": "INVALID_AUDIO_CHUNK",
                "message": "audio chunk missing pcm16_b64",
                "recoverable": True,
            },
        )
        return
    try:
        pcm = base64.b64decode(chunk_b64) if chunk_b64 else b""
        sample_rate = int(payload.get("sample_rate", 16000))
        topic_tag = payload.get("topic_tag")

        tr = await _transcriber.push_chunk(
            session_id=session_id,
            pcm_chunk=pcm,
            sample_rate=sample_rate,
            is_last=is_last,
            mime_type=mime_type,
        )
        if tr.partial_text:
            await _send_event(
                websocket,
                "transcript.partial",
                session_id,
                {"seq": int(payload.get("seq", 0)), "text": tr.partial_text, "confidence": tr.confidence},
            )
        if tr.final_text:
            await _send_event(
                websocket,
                "transcript.final",
                session_id,
                {"seq": int(payload.get("seq", 0)), "text": tr.final_text, "confidence": tr.confidence},
            )
            await _handle_text_answer(
                websocket,
                orchestrator,
                patient_id,
                session_id,
                {"text": tr.final_text, "topic_tag": topic_tag},
            )
    except TranscriptionUnavailable:
        switched = await orchestrator.apply_fallback(
            patient_id=patient_id,
            session_id=session_id,
            target_mode="text_llm",
            reason="stt_unavailable",
        )
        await _send_event(
            websocket,
            "intake.fallback",
            session_id,
            {
                "from": switched.previous_mode,
                "to": switched.active_mode,
                "reason": switched.fallback_reason,
            },
        )
    except Exception as exc:
        await _send_event(
            websocket,
            "error",
            session_id,
            {
                "code": "INVALID_AUDIO_CHUNK",
                "message": str(exc),
                "recoverable": True,
            },
        )


async def _auth_ws_patient(websocket: WebSocket) -> TokenPayload | None:
    auth_header = websocket.headers.get("authorization", "")
    if not auth_header:
        auth_header = websocket.query_params.get("token", "")
    if not auth_header.startswith("Bearer "):
        await websocket.close(code=4401, reason="AUTHENTICATION_REQUIRED")
        return None
    token_str = auth_header.removeprefix("Bearer ").strip()
    if not token_str:
        await websocket.close(code=4401, reason="AUTHENTICATION_REQUIRED")
        return None

    settings = get_settings()
    try:
        token = (
            _decode_unverified(token_str)
            if settings.dev_skip_cognito_verify
            else await _verify_cognito_token(token_str, settings)
        )
    except Exception:
        await websocket.close(code=4401, reason="AUTHENTICATION_REQUIRED")
        return None

    if token.role.value != "patient":
        await websocket.close(code=4403, reason="FORBIDDEN")
        return None
    return token


async def _send_event(
    websocket: WebSocket,
    event_name: str,
    session_id: str,
    payload: dict,
) -> bool:
    envelope = {
        "event": event_name,
        "event_id": str(uuid4()),
        "ts": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "payload": payload,
    }
    try:
        await websocket.send_text(json.dumps(envelope))
        return True
    except Exception as exc:
        logger.warning(
            "ws_send_skipped",
            event=event_name,
            session_id=session_id,
            reason=str(exc),
        )
        return False


async def _build_assistant_audio_payload(
    session_id: str,
    text: str,
) -> dict | None:
    try:
        logger.info("assistant_audio_generate_start", session_id=session_id, chars=len(text))
        audio = await _tts.synthesize(text)
        logger.info(
            "assistant_audio_generate_ok",
            session_id=session_id,
            provider=audio.provider,
            model=audio.model,
            bytes=len(audio.audio_bytes),
            mime_type=audio.mime_type,
        )
        return {
            "audio_b64": base64.b64encode(audio.audio_bytes).decode("utf-8"),
            "audio_mime_type": audio.mime_type,
            "audio_provider": audio.provider,
            "audio_model": audio.model,
        }
    except VoiceUnavailable as exc:
        logger.warning(
            "assistant_audio_unavailable",
            session_id=session_id,
            reason=str(exc),
        )
        return None
    except Exception as exc:
        logger.error(
            "assistant_audio_failed",
            session_id=session_id,
            reason=str(exc),
        )
        return None
