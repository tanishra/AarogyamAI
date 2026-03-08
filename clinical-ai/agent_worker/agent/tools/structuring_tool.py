import logging
from typing import Any

from agent_worker.agent.tools.base import BaseTool, ToolResult

logger = logging.getLogger(__name__)


class StructuringTool(BaseTool):
    """
    Converts raw questionnaire answers into structured clinical context.
    This tool wraps an LLM call via LLMTool — it does NOT call LLM directly.
    The skill layer passes pre-built prompts.

    Input:
        {
            "stripped_answers": list[dict],  — PII-stripped Q&A pairs
            "system_prompt": str,
            "user_prompt": str,
            "llm_tool": LLMTool instance     — injected by skill
        }

    Output (on success):
        {
            "structured_context": dict       — structured clinical fields
        }
    """

    @property
    def name(self) -> str:
        return "StructuringTool"

    async def run(self, input_data: dict[str, Any]) -> ToolResult:
        system_prompt: str | None = input_data.get("system_prompt")
        user_prompt: str | None = input_data.get("user_prompt")
        llm_tool = input_data.get("llm_tool")

        if not system_prompt or not user_prompt:
            return ToolResult.fail(
                error="StructuringTool: system_prompt and user_prompt required",
            )

        if llm_tool is None:
            return ToolResult.fail(
                error="StructuringTool: llm_tool must be injected by skill",
            )

        try:
            llm_result = await llm_tool.run({
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
            })

            if not llm_result.success:
                return ToolResult.fail(
                    error=f"StructuringTool: LLM call failed — {llm_result.error}",
                )

            structured = self._parse_structured_output(
                llm_result.output["text"]
            )

            return ToolResult.ok(
                output={"structured_context": structured},
                metadata={"llm_attempts": llm_result.metadata.get("attempt", 1)},
            )

        except Exception as exc:
            logger.error(
                "StructuringTool failed",
                extra={"error": str(exc)},
            )
            return ToolResult.fail(
                error=f"StructuringTool unexpected error: {exc}",
            )

    def _parse_structured_output(self, raw_text: str) -> dict:
        """
        Parse LLM output into structured clinical context dict.
        LLM is prompted to return JSON — parse it here.
        Falls back to raw text in chief_complaint if parse fails.
        """
        import json

        try:
            # Strip markdown code fences if present
            text = raw_text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])
            return json.loads(text)

        except (json.JSONDecodeError, ValueError):
            logger.warning(
                "StructuringTool: JSON parse failed — using raw fallback"
            )
            return {
                "chief_complaint": raw_text[:500],
                "history_of_present_illness": "",
                "past_medical_history": [],
                "current_medications": [],
                "allergies": [],
                "social_history": None,
                "review_of_systems": {},
            }