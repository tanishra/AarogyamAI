from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from packages.domain.enums import OutcomeStatus


# ── Tool result contract ───────────────────────────────────────────────────────

@dataclass(frozen=True)
class ToolResult:
    """
    Every tool returns this. No exceptions escape a tool.
    Caller inspects success before using output.
    """
    success: bool
    output: Any
    outcome: OutcomeStatus
    error: str | None = None
    metadata: dict = field(default_factory=dict)

    @classmethod
    def ok(cls, output: Any, metadata: dict | None = None) -> "ToolResult":
        return cls(
            success=True,
            output=output,
            outcome=OutcomeStatus.SUCCESS,
            metadata=metadata or {},
        )

    @classmethod
    def fail(cls, error: str, metadata: dict | None = None) -> "ToolResult":
        return cls(
            success=False,
            output=None,
            outcome=OutcomeStatus.FAILURE,
            error=error,
            metadata=metadata or {},
        )

    @classmethod
    def blocked(cls, reason: str, metadata: dict | None = None) -> "ToolResult":
        return cls(
            success=False,
            output=None,
            outcome=OutcomeStatus.BLOCKED,
            error=reason,
            metadata=metadata or {},
        )


# ── Tool interface ─────────────────────────────────────────────────────────────

class BaseTool(ABC):
    """
    Every tool must implement this interface.

    Rules (enforced by architecture):
      - One job per tool — no tool does two things
      - No side effects unless the tool's explicit job is a side effect
      - No tool calls another tool directly
      - No tool calls the LLM directly (except LLMTool)
      - All tools return ToolResult — never raise to the caller
      - All tools are stateless — no instance state between calls
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique tool identifier — used in logs and audit."""
        ...

    @abstractmethod
    async def run(self, input_data: dict[str, Any]) -> ToolResult:
        """
        Execute the tool.

        Args:
            input_data: tool-specific input dict — documented per tool

        Returns:
            ToolResult — never raises
        """
        ...

    def __repr__(self) -> str:
        return f"<Tool:{self.name}>"