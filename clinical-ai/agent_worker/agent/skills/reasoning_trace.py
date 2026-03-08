import logging
from typing import Any

from agent_worker.agent.skills.base import BaseSkill, SkillResult
from packages.domain.enums import FallbackReason, SkillName

logger = logging.getLogger(__name__)


class ReasoningTraceSkill(BaseSkill):
    """
    Builds a structured reasoning trace for audit and transparency.
    Pure deterministic — no LLM call.
    Summarises what the AgentLoop did and why.

    Context fields read:
        - session_id: str
        - skills_completed: list[str]
        - urgency_flag: str
        - differentials: list[dict]
        - fallback_active: bool
        - fallback_reason: str | None
        - pii_was_found: bool

    Context fields written (via SkillResult.output):
        - reasoning_trace: dict
    """

    @property
    def name(self) -> SkillName:
        return SkillName.REASONING_TRACE

    async def execute(self, context: dict[str, Any]) -> SkillResult:
        session_id: str = context.get("session_id", "unknown")

        try:
            trace = {
                "session_id": session_id,
                "skills_completed": context.get("skills_completed", []),
                "fallback_active": context.get("fallback_active", False),
                "fallback_reason": context.get("fallback_reason"),
                "urgency_flag": context.get("urgency_flag", "routine"),
                "differentials_generated": len(
                    context.get("differentials", [])
                ),
                "pii_was_found_and_stripped": context.get(
                    "pii_was_found", False
                ),
                "emergency_flagged": context.get("emergency_flagged", False),
                "ai_label": (
                    "AI-Generated — For Physician Review Only "
                    "— Not a Diagnosis"
                ),
            }

            return SkillResult.ok(
                skill_name=self.name.value,
                output={"reasoning_trace": trace},
            )

        except Exception as exc:
            logger.error(
                "ReasoningTraceSkill unexpected error",
                extra={"session_id": session_id, "error": str(exc)},
            )
            return SkillResult.fail(
                skill_name=self.name.value,
                error=f"Unexpected error: {exc}",
                fallback_reason=FallbackReason.LLM_ERROR,
            )