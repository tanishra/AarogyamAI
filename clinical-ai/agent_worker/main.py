import asyncio
import logging
import signal
import sys
from typing import Any
from uuid import uuid4

import structlog

from agent_worker.agent.agent_loop import AgentLoop, AgentLoopResult
from agent_worker.agent.context import ContextObject
from agent_worker.agent.skills.context_aggregation import ContextAggregationSkill
from agent_worker.agent.skills.differential_framing import DifferentialFramingSkill
from agent_worker.agent.skills.reasoning_trace import ReasoningTraceSkill
from agent_worker.agent.tools.llm_tool import LLMTool
from agent_worker.agent.tools.output_filter import OutputFilterTool
from agent_worker.agent.tools.pii_stripper import PIIStripperTool
from agent_worker.agent.tools.structuring_tool import StructuringTool
from agent_worker.agent.tools.vitals_merger import VitalsMergerTool
from agent_worker.config import AgentWorkerSettings, get_settings
from packages.audit.audit_service import AuditEntryBuilder, get_audit_service
from packages.cache.redis_client import CacheKeys, init_redis, get_redis
from packages.db.client import close_db, get_session, init_db
from packages.db.models.session import PatientSession
from packages.db.models.synthesis import DifferentialConsideration, ReasoningDraft
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    FallbackReason,
    OutcomeStatus,
    SessionStatus,
    UrgencyFlag,
)
from packages.queue.sqs_client import (
    AITaskMessage,
    SQSClient,
    SQSReceivedMessage,
    init_sqs,
    get_sqs,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# ── Logging setup ─────────────────────────────────────────────────────────────

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

logger = structlog.get_logger(__name__)

# ── Shutdown flag ─────────────────────────────────────────────────────────────
_shutdown = False


def _handle_signal(sig, frame) -> None:
    global _shutdown
    logger.info("Shutdown signal received", signal=sig)
    _shutdown = True


# ── Wiring — build AgentLoop from config ──────────────────────────────────────

def build_agent_loop(settings: AgentWorkerSettings) -> AgentLoop:
    """
    Factory — wires all tools and skills into AgentLoop.
    Called once at startup. AgentLoop itself is stateless.
    """
    pii_stripper = PIIStripperTool()
    output_filter = OutputFilterTool()
    vitals_merger = VitalsMergerTool()

    llm_tool = LLMTool(
        provider=settings.llm_provider,
        model_id=settings.llm_model_id,
        api_key=settings.llm_api_key,
        timeout_seconds=settings.llm_timeout_seconds,
        max_retries=settings.llm_max_retries,
        max_tokens=settings.llm_max_tokens,
    )

    structuring_tool = StructuringTool()

    context_aggregation = ContextAggregationSkill(
        llm_tool=llm_tool,
        pii_stripper=pii_stripper,
        output_filter=output_filter,
        structuring_tool=structuring_tool,
        vitals_merger=vitals_merger,
    )

    differential_framing = DifferentialFramingSkill(
        llm_tool=llm_tool,
        pii_stripper=pii_stripper,
        output_filter=output_filter,
    )

    reasoning_trace = ReasoningTraceSkill()

    return AgentLoop(
        context_aggregation_skill=context_aggregation,
        differential_framing_skill=differential_framing,
        reasoning_trace_skill=reasoning_trace,
        pii_stripper=pii_stripper,
    )


# ── Context builder — loads data from DB ──────────────────────────────────────

async def build_context_from_db(
    session: AsyncSession,
    message: AITaskMessage,
) -> ContextObject | None:
    """
    Load all inputs for a session from DB into ContextObject.
    Returns None if session or vitals not found.
    """
    from packages.db.models.vitals import Vitals
    from packages.db.models.session import PatientSession
    from sqlalchemy import select

    # Load session
    stmt = select(PatientSession).where(
        PatientSession.id == message.session_id
    )
    result = await session.execute(stmt)
    patient_session = result.scalar_one_or_none()

    if patient_session is None:
        logger.warning(
            "Session not found",
            session_id=message.session_id,
        )
        return None

    # Load vitals
    vitals_stmt = select(Vitals).where(
        Vitals.session_id == message.session_id
    )
    vitals_result = await session.execute(vitals_stmt)
    vitals = vitals_result.scalar_one_or_none()

    if vitals is None:
        logger.warning(
            "Vitals not found for session",
            session_id=message.session_id,
        )
        return None

    # Load answers from cache (stored by API after questionnaire completes)
    raw_answers = await _load_answers_from_cache(message.session_id)

    return ContextObject(
        session_id=message.session_id,
        patient_id=message.patient_id,
        clinic_id=message.clinic_id,
        raw_answers=raw_answers,
        raw_vitals={
            "temperature_celsius": vitals.temperature_celsius,
            "bp_systolic_mmhg": vitals.bp_systolic_mmhg,
            "bp_diastolic_mmhg": vitals.bp_diastolic_mmhg,
            "heart_rate_bpm": vitals.heart_rate_bpm,
            "respiratory_rate_pm": vitals.respiratory_rate_pm,
            "spo2_percent": vitals.spo2_percent,
            "weight_kg": vitals.weight_kg,
            "height_cm": vitals.height_cm,
            "nurse_observation": vitals.nurse_observation,
        },
    )


async def _load_answers_from_cache(session_id: str) -> list[dict]:
    """
    Load questionnaire answers from Redis.
    Answers are written to Redis by the API when questionnaire completes.
    Returns empty list if cache miss — AgentLoop handles gracefully.
    """
    import json

    try:
        redis = get_redis()
        key = f"answers:{session_id}"
        raw = await redis.get(key)
        if raw:
            return json.loads(raw)
        logger.warning("Answers cache miss", session_id=session_id)
        return []
    except Exception as exc:
        logger.error(
            "Failed to load answers from cache",
            session_id=session_id,
            error=str(exc),
        )
        return []


# ── Result writer — persists AgentLoopResult to DB ────────────────────────────

async def persist_result(
    session: AsyncSession,
    result: AgentLoopResult,
) -> None:
    """
    Write AgentLoopResult to DB.
    This is the ONLY place DB writes happen in the worker.
    AgentLoop never writes — worker writes.
    """
    from uuid import uuid4
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    # Update session status
    stmt = select(PatientSession).where(
        PatientSession.id == result.session_id
    )
    db_result = await session.execute(stmt)
    patient_session = db_result.scalar_one_or_none()

    if patient_session is None:
        logger.error(
            "Cannot persist result — session not found",
            session_id=result.session_id,
        )
        return

    if result.fallback_active:
        patient_session.status = SessionStatus.SYNTHESIS_FALLBACK.value
        patient_session.synthesis_fallback_active = True
        patient_session.synthesis_fallback_reason = (
            result.fallback_reason.value if result.fallback_reason else None
        )
    else:
        patient_session.status = SessionStatus.SYNTHESIS_COMPLETE.value
        patient_session.synthesis_fallback_active = False

    patient_session.synthesis_complete_at = now

    # Write differentials
    for i, diff in enumerate(result.differentials):
        consideration = DifferentialConsideration(
            id=str(uuid4()),
            session_id=result.session_id,
            title=diff.get("title", ""),
            supporting_features=diff.get("supporting_features", []),
            clinical_reasoning=diff.get("clinical_reasoning", ""),
            urgency_flag=diff.get("urgency_flag", "routine"),
            ai_generated=True,
            sort_order=diff.get("sort_order", i),
        )
        session.add(consideration)

    # Write reasoning draft skeleton (doctor fills this in)
    if result.success and result.reasoning_trace:
        draft = ReasoningDraft(
            id=str(uuid4()),
            session_id=result.session_id,
            doctor_id="",   # empty — doctor not assigned yet
        )
        session.add(draft)

    await session.flush()

    logger.info(
        "AgentLoop result persisted",
        session_id=result.session_id,
        fallback=result.fallback_active,
        differentials_written=len(result.differentials),
    )


# ── Synthesis status cache update ─────────────────────────────────────────────

async def update_synthesis_cache(result: AgentLoopResult) -> None:
    """
    Update Redis so doctor dashboard polling gets the result immediately.
    """
    import json

    try:
        redis = get_redis()
        key = CacheKeys.synthesis_status(result.session_id)

        status = {
            "synthesis_ready": result.success,
            "fallback_active": result.fallback_active,
            "fallback_reason": (
                result.fallback_reason.value
                if result.fallback_reason else None
            ),
            "urgency_flag": result.urgency_flag.value,
            "emergency_flagged": result.emergency_flagged,
        }

        await redis.setex(key, 3600, json.dumps(status))

    except Exception as exc:
        # Non-fatal — doctor dashboard falls back to DB polling
        logger.warning(
            "Failed to update synthesis cache",
            session_id=result.session_id,
            error=str(exc),
        )


# ── Message processor ─────────────────────────────────────────────────────────

async def process_message(
    message: SQSReceivedMessage,
    agent_loop: AgentLoop,
    sqs: SQSClient,
) -> None:
    """
    Process one SQS message end-to-end.
    Delete from SQS only after successful DB write.
    """
    task = AITaskMessage.from_dict(
        message.body,
        message_id=message.message_id,
    )

    logger.info(
        "Processing AI task",
        session_id=task.session_id,
        task_type=task.task_type,
        sqs_message_id=message.message_id,
    )

    audit = get_audit_service()

    try:
        async with get_session() as session:
            # Build context from DB
            context = await build_context_from_db(session, task)

            if context is None:
                # Data missing — delete message to prevent infinite retry
                sqs.delete_message(message.receipt_handle)
                return

            # Run AgentLoop
            result = await agent_loop.run(context)

            # Persist result
            await persist_result(session, result)

            # Audit
            audit_entry = (
                AuditEntryBuilder()
                .event(
                    AuditEventType.AI_SKILL_COMPLETE
                    if result.success
                    else AuditEventType.AI_FALLBACK_USED
                )
                .outcome(
                    OutcomeStatus.SUCCESS
                    if result.success
                    else OutcomeStatus.FALLBACK
                )
                .actor(role=ActorRole.SYSTEM)
                .patient(task.patient_id)
                .session(task.session_id)
                .clinic(task.clinic_id)
                .metadata({
                    "skills_completed": result.skills_completed,
                    "fallback_reason": (
                        result.fallback_reason.value
                        if result.fallback_reason else None
                    ),
                    "differentials_count": len(result.differentials),
                })
                .build()
            )
            await audit.record(session, audit_entry)

        # Update synthesis status in Redis
        await update_synthesis_cache(result)

        # Delete SQS message — processing complete
        sqs.delete_message(message.receipt_handle)

        logger.info(
            "Message processed successfully",
            session_id=task.session_id,
            fallback=result.fallback_active,
        )

    except Exception as exc:
        logger.error(
            "Message processing failed — will retry",
            session_id=task.session_id,
            error=str(exc),
        )
        # Do NOT delete — SQS will redeliver after visibility timeout
        # AgentLoop and persist_result are idempotent


# ── Main polling loop ─────────────────────────────────────────────────────────

async def run_worker(settings: AgentWorkerSettings) -> None:
    """
    Main worker loop.
    Polls SQS, processes messages, shuts down cleanly on signal.
    """
    logger.info(
        "Agent worker starting",
        env=settings.app_env,
        provider=settings.llm_provider,
        model=settings.llm_model_id,
    )

    # Initialise infrastructure
    init_db(
        database_url=settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
    )

    init_redis(redis_url="redis://localhost:6379/0")

    init_sqs(
        queue_url=settings.sqs_ai_task_queue_url,
        region=settings.aws_region,
        endpoint_url=settings.localstack_endpoint,
    )

    # Build AgentLoop once — reused for every message
    agent_loop = build_agent_loop(settings)
    sqs = get_sqs()

    logger.info("Agent worker ready — polling SQS")

    while not _shutdown:
        try:
            messages = sqs.receive_messages(
                max_messages=settings.sqs_max_messages,
                wait_time_seconds=settings.sqs_wait_time_seconds,
                visibility_timeout=settings.sqs_visibility_timeout,
            )

            for message in messages:
                if _shutdown:
                    break
                await process_message(message, agent_loop, sqs)

        except Exception as exc:
            logger.error("Polling error", error=str(exc))
            await asyncio.sleep(5)  # back off before retry

    # Graceful shutdown
    logger.info("Agent worker shutting down")
    await close_db()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    settings = get_settings()
    asyncio.run(run_worker(settings))