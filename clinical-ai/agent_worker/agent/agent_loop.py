import logging
from dataclasses import dataclass, field
from typing import Any

from agent_worker.agent.context import ContextObject
from agent_worker.agent.skills.base import BaseSkill, SkillResult
from agent_worker.agent.skills.context_aggregation import ContextAggregationSkill
from agent_worker.agent.skills.differential_framing import DifferentialFramingSkill
from agent_worker.agent.skills.reasoning_trace import ReasoningTraceSkill
from agent_worker.agent.tools.pii_stripper import PIIStripperTool
from packages.domain.enums import (
    FallbackReason,
    OutcomeStatus,
    SkillName,
    UrgencyFlag,
)

logger = logging.getLogger(__name__)


# ── AgentLoop result ───────────────────────────────────────────────────────────

@dataclass
class AgentLoopResult:
    """
    Final output of one AgentLoop execution.
    Written to DB by the worker — AgentLoop never writes to DB.
    """
    session_id: str
    success: bool
    fallback_active: bool
    fallback_reason: FallbackReason | None

    # Clinical outputs — empty on fallback
    structured_context: dict[str, Any] = field(default_factory=dict)
    merged_context: dict[str, Any] = field(default_factory=dict)
    differentials: list[dict[str, Any]] = field(default_factory=list)
    reasoning_trace: dict[str, Any] = field(default_factory=dict)

    # Vitals outputs
    urgency_flag: UrgencyFlag = UrgencyFlag.ROUTINE
    outlier_flags: list[dict] = field(default_factory=list)
    emergency_flagged: bool = False

    # Execution metadata — for observability
    skills_completed: list[str] = field(default_factory=list)
    execution_metadata: dict[str, Any] = field(default_factory=dict)

    def to_log_dict(self) -> dict:
        """Safe for logging — no PHI."""
        return {
            "session_id": self.session_id,
            "success": self.success,
            "fallback_active": self.fallback_active,
            "fallback_reason": (
                self.fallback_reason.value if self.fallback_reason else None
            ),
            "skills_completed": self.skills_completed,
            "differentials_count": len(self.differentials),
            "urgency_flag": self.urgency_flag.value,
            "emergency_flagged": self.emergency_flagged,
        }


# ── AgentLoop ──────────────────────────────────────────────────────────────────

class AgentLoop:
    """
    Stateless central orchestrator.

    Responsibilities:
      - Receive ContextObject with raw inputs
      - Drive skills in sequence
      - Merge each SkillResult back into ContextObject
      - Activate fallback on any skill failure
      - Return AgentLoopResult — never write to DB

    Rules:
      - Stateless: no instance variables change between calls
      - Context passed explicitly — no globals
      - Every skill failure triggers fallback — no partial results
      - PII strip is always the first operation — abort if it fails
      - Fallback result still contains vitals and structured context
        if those steps completed before failure
    """

    def __init__(
        self,
        context_aggregation_skill: ContextAggregationSkill,
        differential_framing_skill: DifferentialFramingSkill,
        reasoning_trace_skill: ReasoningTraceSkill,
        pii_stripper: PIIStripperTool,
    ) -> None:
        self._context_aggregation = context_aggregation_skill
        self._differential_framing = differential_framing_skill
        self._reasoning_trace = reasoning_trace_skill
        self._pii_stripper = pii_stripper

    async def run(self, context: ContextObject) -> AgentLoopResult:
        """
        Execute the full synthesis pipeline for one patient session.

        Pipeline:
          1. Strip PII from all raw answers
          2. ContextAggregationSkill — structure + merge vitals
          3. DifferentialFramingSkill — generate considerations
          4. ReasoningTraceSkill — build audit trace

        Any failure activates fallback immediately.
        Fallback result is still a valid AgentLoopResult — worker writes it.
        """
        logger.info(
            "AgentLoop started",
            extra=context.to_log_dict(),
        )

        # ── Step 1: Strip PII from raw answers ────────────────────────────────
        strip_result = await self._strip_all_answers(context)
        if not strip_result["success"]:
            return self._build_fallback(
                context=context,
                reason=FallbackReason.PII_STRIP_FAILED,
                error=strip_result["error"],
            )

        context.stripped_answers = strip_result["stripped_answers"]
        context.pii_was_found = strip_result["pii_was_found"]

        # ── Step 2: Context aggregation ────────────────────────────────────────
        context.current_skill = SkillName.CONTEXT_AGGREGATION.value
        agg_result = await self._context_aggregation.execute(
            self._build_skill_context(context)
        )

        if not agg_result.success:
            context.activate_fallback(
                agg_result.fallback_reason or FallbackReason.LLM_ERROR
            )
            logger.warning(
                "AgentLoop: ContextAggregation failed — activating fallback",
                extra={
                    "session_id": context.session_id,
                    "error": agg_result.error,
                    "fallback_reason": (
                        agg_result.fallback_reason.value
                        if agg_result.fallback_reason else None
                    ),
                },
            )
            return self._build_fallback(
                context=context,
                reason=agg_result.fallback_reason or FallbackReason.LLM_ERROR,
                error=agg_result.error or "ContextAggregation failed",
            )

        # Merge aggregation output into context
        self._merge_aggregation(context, agg_result)
        context.mark_skill_complete(SkillName.CONTEXT_AGGREGATION.value)

        # ── Step 3: Differential framing ───────────────────────────────────────
        context.current_skill = SkillName.DIFFERENTIAL_FRAMING.value
        diff_result = await self._differential_framing.execute(
            self._build_skill_context(context)
        )

        if not diff_result.success:
            context.activate_fallback(
                diff_result.fallback_reason or FallbackReason.LLM_ERROR
            )
            logger.warning(
                "AgentLoop: DifferentialFraming failed — activating fallback",
                extra={
                    "session_id": context.session_id,
                    "error": diff_result.error,
                },
            )
            # Return fallback — but still include structured context
            # Doctor can still see the context even without differentials
            return self._build_fallback(
                context=context,
                reason=diff_result.fallback_reason or FallbackReason.LLM_ERROR,
                error=diff_result.error or "DifferentialFraming failed",
            )

        context.differentials = diff_result.output.get("differentials", [])
        context.mark_skill_complete(SkillName.DIFFERENTIAL_FRAMING.value)

        # ── Step 4: Reasoning trace ────────────────────────────────────────────
        context.current_skill = SkillName.REASONING_TRACE.value
        trace_result = await self._reasoning_trace.execute(
            self._build_skill_context(context)
        )

        # Reasoning trace failure is non-fatal — log and continue
        if trace_result.success:
            context.reasoning_trace = trace_result.output.get(
                "reasoning_trace", {}
            )
            context.mark_skill_complete(SkillName.REASONING_TRACE.value)
        else:
            logger.warning(
                "AgentLoop: ReasoningTrace failed — non-fatal, continuing",
                extra={"session_id": context.session_id},
            )

        # ── Done ───────────────────────────────────────────────────────────────
        result = AgentLoopResult(
            session_id=context.session_id,
            success=True,
            fallback_active=False,
            fallback_reason=None,
            structured_context=context.structured_context,
            merged_context=context.merged_context,
            differentials=context.differentials,
            reasoning_trace=context.reasoning_trace,
            urgency_flag=context.urgency_flag,
            outlier_flags=context.outlier_flags,
            emergency_flagged=context.emergency_flagged,
            skills_completed=context.skills_completed,
        )

        logger.info(
            "AgentLoop completed successfully",
            extra=result.to_log_dict(),
        )
        return result

    # ── Private helpers ────────────────────────────────────────────────────────

    async def _strip_all_answers(
        self, context: ContextObject
    ) -> dict[str, Any]:
        """
        Strip PII from every raw answer.
        If any strip fails — abort entire pipeline.
        """
        stripped_answers = []
        pii_was_found = False

        for qa in context.raw_answers:
            answer_text = qa.get("answer_text", "")

            result = await self._pii_stripper.run({
                "text": answer_text,
                "context": f"answers:{context.session_id}",
            })

            if not result.success:
                return {
                    "success": False,
                    "error": f"PII strip failed on answer: {result.error}",
                    "stripped_answers": [],
                    "pii_was_found": False,
                }

            if result.output["was_modified"]:
                pii_was_found = True

            stripped_answers.append({
                **qa,
                "answer_text": result.output["stripped_text"],
            })

        return {
            "success": True,
            "error": None,
            "stripped_answers": stripped_answers,
            "pii_was_found": pii_was_found,
        }

    def _build_skill_context(self, context: ContextObject) -> dict[str, Any]:
        """
        Build the flat dict passed to each skill.
        Skills never receive the full ContextObject — only what they need.
        """
        return {
            "session_id": context.session_id,
            "patient_id": context.patient_id,
            "clinic_id": context.clinic_id,
            "stripped_answers": context.stripped_answers,
            "raw_vitals": context.raw_vitals,
            "structured_context": context.structured_context,
            "merged_context": context.merged_context,
            "outlier_flags": context.outlier_flags,
            "urgency_flag": context.urgency_flag.value,
            "differentials": context.differentials,
            "skills_completed": context.skills_completed,
            "fallback_active": context.fallback_active,
            "fallback_reason": (
                context.fallback_reason.value
                if context.fallback_reason else None
            ),
            "pii_was_found": context.pii_was_found,
            "emergency_flagged": context.emergency_flagged,
        }

    def _merge_aggregation(
        self,
        context: ContextObject,
        result: SkillResult,
    ) -> None:
        """Merge ContextAggregationSkill output into ContextObject."""
        context.structured_context = result.output.get(
            "structured_context", {}
        )
        context.merged_context = result.output.get("merged_context", {})
        context.outlier_flags = result.output.get("outlier_flags", [])
        context.emergency_flagged = result.output.get(
            "emergency_flagged", False
        )

        urgency_str = result.output.get("urgency_flag", "routine")
        context.urgency_flag = UrgencyFlag(urgency_str)

    def _build_fallback(
        self,
        context: ContextObject,
        reason: FallbackReason,
        error: str,
    ) -> AgentLoopResult:
        """
        Build a fallback AgentLoopResult.
        Includes whatever was completed before failure.
        Doctor will see context + vitals if aggregation completed.
        """
        context.activate_fallback(reason)

        logger.error(
            "AgentLoop fallback activated",
            extra={
                "session_id": context.session_id,
                "reason": reason.value,
                "error": error,
                "skills_completed": context.skills_completed,
            },
        )

        return AgentLoopResult(
            session_id=context.session_id,
            success=False,
            fallback_active=True,
            fallback_reason=reason,
            # Include whatever completed before failure
            structured_context=context.structured_context,
            merged_context=context.merged_context,
            differentials=[],           # never partial differentials
            reasoning_trace={},
            urgency_flag=context.urgency_flag,
            outlier_flags=context.outlier_flags,
            emergency_flagged=context.emergency_flagged,
            skills_completed=context.skills_completed,
            execution_metadata={"error": error},
        )