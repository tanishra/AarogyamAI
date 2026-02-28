from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from packages.domain.enums import FallbackReason, OutcomeStatus, SkillName


# ── Skill result contract ─────────────────────────────────────────────────────

@dataclass
class SkillResult:
    """
    Every skill returns this.
    AgentLoop inspects success and fallback_reason before using output.
    """
    success: bool
    output: dict[str, Any]
    outcome: OutcomeStatus
    skill_name: str
    fallback_reason: FallbackReason | None = None
    error: str | None = None
    metadata: dict = field(default_factory=dict)

    @classmethod
    def ok(
        cls,
        skill_name: str,
        output: dict[str, Any],
        metadata: dict | None = None,
    ) -> "SkillResult":
        return cls(
            success=True,
            output=output,
            outcome=OutcomeStatus.SUCCESS,
            skill_name=skill_name,
            metadata=metadata or {},
        )

    @classmethod
    def fail(
        cls,
        skill_name: str,
        error: str,
        fallback_reason: FallbackReason,
        metadata: dict | None = None,
    ) -> "SkillResult":
        return cls(
            success=False,
            output={},
            outcome=OutcomeStatus.FALLBACK,
            skill_name=skill_name,
            fallback_reason=fallback_reason,
            error=error,
            metadata=metadata or {},
        )


# ── Skill interface ───────────────────────────────────────────────────────────

class BaseSkill(ABC):
    """
    Skills compose tools into complete workflows.

    Rules:
      - Skills do NOT call the LLM directly — they invoke LLMTool
      - Skills do NOT access DB directly — context is passed in
      - Skills do NOT raise — always return SkillResult
      - Skills are stateless — all state lives in ContextObject
      - One skill = one clinical workflow step
    """

    @property
    @abstractmethod
    def name(self) -> SkillName:
        ...

    @abstractmethod
    async def execute(self, context: dict[str, Any]) -> SkillResult:
        """
        Execute the skill against the given context.

        Args:
            context: flat dict — subset of ContextObject fields
                     skill declares what it needs in its docstring

        Returns:
            SkillResult — never raises
        """
        ...

    def __repr__(self) -> str:
        return f"<Skill:{self.name.value}>"