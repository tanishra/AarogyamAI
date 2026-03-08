import logging
from typing import Any

from agent_worker.agent.skills.base import BaseSkill, SkillResult
from agent_worker.agent.tools.llm_tool import LLMTool
from agent_worker.agent.tools.output_filter import OutputFilterTool
from agent_worker.agent.tools.pii_stripper import PIIStripperTool
from packages.domain.enums import FallbackReason, SkillName

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """
You are a clinical intake assistant helping collect a structured symptom history.
Your job is to generate the next most clinically relevant question based on
the patient's answers so far.

Rules you must follow:
- Ask ONE question at a time
- Never ask about identity, name, address, or contact details
- Never suggest a diagnosis
- Never use definitive medical language
- Use simple language a non-medical person understands
- If enough information is collected, respond with exactly: QUESTIONNAIRE_COMPLETE
- Format: return ONLY the question text or QUESTIONNAIRE_COMPLETE
""".strip()


class AdaptiveQuestioningSkill(BaseSkill):
    """
    Generates the next clinical question based on answers so far.

    Context fields read:
        - stripped_answers: list of {question, answer} dicts (PII stripped)
        - session_id: str

    Context fields written (via SkillResult.output):
        - next_question: str | None
        - questionnaire_complete: bool
    """

    def __init__(
        self,
        llm_tool: LLMTool,
        pii_stripper: PIIStripperTool,
        output_filter: OutputFilterTool,
    ) -> None:
        self._llm = llm_tool
        self._pii_stripper = pii_stripper
        self._output_filter = output_filter

    @property
    def name(self) -> SkillName:
        return SkillName.ADAPTIVE_QUESTIONING

    async def execute(self, context: dict[str, Any]) -> SkillResult:
        session_id: str = context.get("session_id", "unknown")
        stripped_answers: list = context.get("stripped_answers", [])

        try:
            # Build user prompt from stripped answers
            user_prompt = self._build_prompt(stripped_answers)

            # Strip PII from the assembled prompt — second pass safety
            strip_result = await self._pii_stripper.run({
                "text": user_prompt,
                "context": f"adaptive_questioning:{session_id}",
            })

            if not strip_result.success:
                return SkillResult.fail(
                    skill_name=self.name.value,
                    error="PII strip failed before LLM call",
                    fallback_reason=FallbackReason.PII_STRIP_FAILED,
                )

            # Call LLM
            llm_result = await self._llm.run({
                "system_prompt": _SYSTEM_PROMPT,
                "user_prompt": strip_result.output["stripped_text"],
                "max_tokens": 200,
            })

            if not llm_result.success:
                return SkillResult.fail(
                    skill_name=self.name.value,
                    error=f"LLM call failed: {llm_result.error}",
                    fallback_reason=FallbackReason.LLM_ERROR,
                )

            raw_output: str = llm_result.output["text"].strip()

            # Check for completion signal
            if "QUESTIONNAIRE_COMPLETE" in raw_output:
                return SkillResult.ok(
                    skill_name=self.name.value,
                    output={
                        "next_question": None,
                        "questionnaire_complete": True,
                    },
                )

            # Filter LLM output
            filter_result = await self._output_filter.run({
                "text": raw_output,
                "session_id": session_id,
            })

            if not filter_result.success:
                return SkillResult.fail(
                    skill_name=self.name.value,
                    error="Output filter blocked LLM response",
                    fallback_reason=FallbackReason.OUTPUT_FILTER_BLOCKED,
                    metadata=filter_result.metadata,
                )

            return SkillResult.ok(
                skill_name=self.name.value,
                output={
                    "next_question": filter_result.output["text"],
                    "questionnaire_complete": False,
                },
                metadata={"llm_attempts": llm_result.metadata.get("attempt", 1)},
            )

        except Exception as exc:
            logger.error(
                "AdaptiveQuestioningSkill unexpected error",
                extra={"session_id": session_id, "error": str(exc)},
            )
            return SkillResult.fail(
                skill_name=self.name.value,
                error=f"Unexpected error: {exc}",
                fallback_reason=FallbackReason.LLM_ERROR,
            )

    def _build_prompt(self, stripped_answers: list[dict]) -> str:
        if not stripped_answers:
            return "This is the first question. Ask about the patient's chief complaint."

        lines = ["Patient answers so far:"]
        for i, qa in enumerate(stripped_answers, 1):
            q = qa.get("question_text", "")
            a = qa.get("answer_text", "")
            lines.append(f"{i}. Q: {q}\n   A: {a}")

        lines.append("\nGenerate the next most clinically relevant question.")
        return "\n".join(lines)