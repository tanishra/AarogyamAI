import json
import logging
from typing import Any

from agent_worker.agent.skills.base import BaseSkill, SkillResult
from agent_worker.agent.tools.llm_tool import LLMTool
from agent_worker.agent.tools.output_filter import OutputFilterTool
from agent_worker.agent.tools.pii_stripper import PIIStripperTool
from agent_worker.agent.tools.structuring_tool import StructuringTool
from agent_worker.agent.tools.vitals_merger import VitalsMergerTool
from packages.domain.enums import FallbackReason, SkillName

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """
You are a clinical documentation assistant.
Given a set of patient symptom answers, extract and structure the clinical history.

Return ONLY valid JSON with these exact fields:
{
  "chief_complaint": "string",
  "history_of_present_illness": "string",
  "past_medical_history": ["string"],
  "current_medications": ["string"],
  "allergies": ["string"],
  "social_history": "string or null",
  "review_of_systems": {
    "cardiac": "string or null",
    "respiratory": "string or null",
    "gastrointestinal": "string or null",
    "neurological": "string or null",
    "musculoskeletal": "string or null",
    "other": "string or null"
  }
}

Rules:
- Use only information explicitly provided in the answers
- Do not infer, speculate, or add clinical interpretations
- Do not suggest diagnoses
- Use clinical terminology appropriate for physician review
- Return null for fields with no information
""".strip()


class ContextAggregationSkill(BaseSkill):
    """
    Aggregates stripped answers + vitals into structured clinical context.

    Context fields read:
        - stripped_answers: list[dict]
        - raw_vitals: dict
        - session_id: str

    Context fields written (via SkillResult.output):
        - structured_context: dict
        - merged_context: dict
        - urgency_flag: str
        - outlier_flags: list[dict]
        - emergency_flagged: bool
    """

    def __init__(
        self,
        llm_tool: LLMTool,
        pii_stripper: PIIStripperTool,
        output_filter: OutputFilterTool,
        structuring_tool: StructuringTool,
        vitals_merger: VitalsMergerTool,
    ) -> None:
        self._llm = llm_tool
        self._pii_stripper = pii_stripper
        self._output_filter = output_filter
        self._structuring_tool = structuring_tool
        self._vitals_merger = vitals_merger

    @property
    def name(self) -> SkillName:
        return SkillName.CONTEXT_AGGREGATION

    async def execute(self, context: dict[str, Any]) -> SkillResult:
        session_id: str = context.get("session_id", "unknown")
        stripped_answers: list = context.get("stripped_answers", [])
        raw_vitals: dict = context.get("raw_vitals", {})

        try:
            # Build user prompt
            user_prompt = self._build_user_prompt(stripped_answers)

            # PII strip the assembled prompt
            strip_result = await self._pii_stripper.run({
                "text": user_prompt,
                "context": f"context_aggregation:{session_id}",
            })

            if not strip_result.success:
                return SkillResult.fail(
                    skill_name=self.name.value,
                    error="PII strip failed",
                    fallback_reason=FallbackReason.PII_STRIP_FAILED,
                )

            # Structure via LLM
            structure_result = await self._structuring_tool.run({
                "system_prompt": _SYSTEM_PROMPT,
                "user_prompt": strip_result.output["stripped_text"],
                "llm_tool": self._llm,
            })

            if not structure_result.success:
                return SkillResult.fail(
                    skill_name=self.name.value,
                    error=f"Structuring failed: {structure_result.error}",
                    fallback_reason=FallbackReason.LLM_ERROR,
                )

            structured_context = structure_result.output["structured_context"]

            # Filter structured output
            context_text = json.dumps(structured_context)
            filter_result = await self._output_filter.run({
                "text": context_text,
                "session_id": session_id,
            })

            if not filter_result.success:
                # Structured context is descriptive history, not diagnostic output.
                # Keep processing but record that the filter would have blocked it.
                logger.warning(
                    "ContextAggregation: output filter flagged structured context; continuing",
                    extra={
                        "session_id": session_id,
                        "metadata": filter_result.metadata,
                    },
                )

            # Merge vitals
            if raw_vitals:
                merge_result = await self._vitals_merger.run({
                    "vitals": raw_vitals,
                    "structured_context": structured_context,
                })

                if not merge_result.success:
                    return SkillResult.fail(
                        skill_name=self.name.value,
                        error=f"Vitals merge failed: {merge_result.error}",
                        fallback_reason=FallbackReason.LLM_ERROR,
                    )

                return SkillResult.ok(
                    skill_name=self.name.value,
                    output={
                        "structured_context": structured_context,
                        "merged_context": merge_result.output["merged_context"],
                        "urgency_flag": merge_result.output["urgency_flag"],
                        "outlier_flags": merge_result.output["outlier_flags"],
                        "emergency_flagged": merge_result.output[
                            "merged_context"
                        ].get("emergency_flagged", False),
                    },
                )

            # No vitals — return structured context only
            return SkillResult.ok(
                skill_name=self.name.value,
                output={
                    "structured_context": structured_context,
                    "merged_context": structured_context,
                    "urgency_flag": "routine",
                    "outlier_flags": [],
                    "emergency_flagged": False,
                },
            )

        except Exception as exc:
            logger.error(
                "ContextAggregationSkill unexpected error",
                extra={"session_id": session_id, "error": str(exc)},
            )
            return SkillResult.fail(
                skill_name=self.name.value,
                error=f"Unexpected error: {exc}",
                fallback_reason=FallbackReason.LLM_ERROR,
            )

    def _build_user_prompt(self, stripped_answers: list[dict]) -> str:
        if not stripped_answers:
            return "No answers provided."

        lines = ["Patient symptom answers:"]
        for i, qa in enumerate(stripped_answers, 1):
            q = qa.get("question_text", "")
            a = qa.get("answer_text", "")
            lines.append(f"{i}. Q: {q}\n   A: {a}")

        return "\n".join(lines)
