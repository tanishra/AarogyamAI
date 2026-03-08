import json
import logging
from typing import Any

from agent_worker.agent.skills.base import BaseSkill, SkillResult
from agent_worker.agent.tools.llm_tool import LLMTool
from agent_worker.agent.tools.output_filter import OutputFilterTool
from agent_worker.agent.tools.pii_stripper import PIIStripperTool
from packages.domain.enums import FallbackReason, SkillName

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """
You are a clinical decision support assistant helping a physician think through
a patient case. Your job is to generate a structured list of clinical
considerations for physician review.

Return ONLY valid JSON as a list of considerations:
[
  {
    "title": "string — brief clinical label",
    "supporting_features": ["string — observable features from the case"],
    "clinical_reasoning": "string — reasoning linking features to this consideration",
    "urgency_flag": "routine | urgent | critical"
  }
]

Strict rules:
- Maximum 5 considerations
- Use "may suggest", "consistent with", "consider", "possible" — never definitive language
- Never use "patient has", "diagnosis is", "you have", or any diagnostic statement
- Base ONLY on information provided — no assumptions
- urgency_flag must be one of: routine, urgent, critical
- For physician review only — label each consideration accordingly
- Return raw JSON only — no markdown, no explanation
""".strip()


class DifferentialFramingSkill(BaseSkill):
    """
    Generates clinical considerations from merged context.

    Context fields read:
        - merged_context: dict
        - urgency_flag: str
        - session_id: str

    Context fields written (via SkillResult.output):
        - differentials: list[dict]
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
        return SkillName.DIFFERENTIAL_FRAMING

    async def execute(self, context: dict[str, Any]) -> SkillResult:
        session_id: str = context.get("session_id", "unknown")
        merged_context: dict = context.get("merged_context", {})

        if not merged_context:
            return SkillResult.fail(
                skill_name=self.name.value,
                error="merged_context is empty — cannot frame differentials",
                fallback_reason=FallbackReason.LLM_ERROR,
            )

        try:
            user_prompt = self._build_prompt(merged_context)

            # PII strip before LLM
            strip_result = await self._pii_stripper.run({
                "text": user_prompt,
                "context": f"differential_framing:{session_id}",
            })

            if not strip_result.success:
                return SkillResult.fail(
                    skill_name=self.name.value,
                    error="PII strip failed",
                    fallback_reason=FallbackReason.PII_STRIP_FAILED,
                )

            # LLM call
            llm_result = await self._llm.run({
                "system_prompt": _SYSTEM_PROMPT,
                "user_prompt": strip_result.output["stripped_text"],
                "max_tokens": 800,
            })

            if not llm_result.success:
                return SkillResult.fail(
                    skill_name=self.name.value,
                    error=f"LLM call failed: {llm_result.error}",
                    fallback_reason=FallbackReason.LLM_ERROR,
                )

            raw_output: str = llm_result.output["text"]

            # Filter output
            filter_result = await self._output_filter.run({
                "text": raw_output,
                "session_id": session_id,
            })

            if not filter_result.success:
                return SkillResult.fail(
                    skill_name=self.name.value,
                    error="Output filter blocked differentials",
                    fallback_reason=FallbackReason.OUTPUT_FILTER_BLOCKED,
                    metadata=filter_result.metadata,
                )

            # Parse differentials
            differentials = self._parse_differentials(raw_output)

            return SkillResult.ok(
                skill_name=self.name.value,
                output={"differentials": differentials},
                metadata={"count": len(differentials)},
            )

        except Exception as exc:
            logger.error(
                "DifferentialFramingSkill unexpected error",
                extra={"session_id": session_id, "error": str(exc)},
            )
            return SkillResult.fail(
                skill_name=self.name.value,
                error=f"Unexpected error: {exc}",
                fallback_reason=FallbackReason.LLM_ERROR,
            )

    def _build_prompt(self, merged_context: dict) -> str:
        lines = ["Clinical case summary for physician review:"]

        if merged_context.get("chief_complaint"):
            lines.append(
                f"Chief complaint: {merged_context['chief_complaint']}"
            )

        if merged_context.get("history_of_present_illness"):
            lines.append(
                f"History: {merged_context['history_of_present_illness']}"
            )

        if merged_context.get("vitals_summary"):
            v = merged_context["vitals_summary"]
            lines.append(
                f"Vitals: BP {v.get('bp_systolic_mmhg')}/{v.get('bp_diastolic_mmhg')} "
                f"mmHg, HR {v.get('heart_rate_bpm')} bpm, "
                f"Temp {v.get('temperature_celsius')}°C, "
                f"SpO2 {v.get('spo2_percent')}%"
            )

        if merged_context.get("outlier_flags"):
            flags = merged_context["outlier_flags"]
            lines.append(
                f"Outlier vitals: {[f['field'] for f in flags]}"
            )

        if merged_context.get("past_medical_history"):
            lines.append(
                f"PMH: {', '.join(merged_context['past_medical_history'])}"
            )

        if merged_context.get("current_medications"):
            lines.append(
                f"Medications: {', '.join(merged_context['current_medications'])}"
            )

        lines.append(
            "\nGenerate clinical considerations for physician review only."
        )
        return "\n".join(lines)

    def _parse_differentials(self, raw_text: str) -> list[dict]:
        """Parse JSON list from LLM output. Returns empty list on failure."""
        try:
            text = raw_text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])

            parsed = json.loads(text)

            if not isinstance(parsed, list):
                logger.warning("DifferentialFramingSkill: output not a list")
                return []

            # Validate and sanitise each item
            valid = []
            for i, item in enumerate(parsed[:5]):  # max 5
                if not isinstance(item, dict):
                    continue
                valid.append({
                    "title": str(item.get("title", ""))[:200],
                    "supporting_features": [
                        str(f) for f in item.get("supporting_features", [])
                    ],
                    "clinical_reasoning": str(
                        item.get("clinical_reasoning", "")
                    )[:1000],
                    "urgency_flag": item.get("urgency_flag", "routine")
                    if item.get("urgency_flag") in ("routine", "urgent", "critical")
                    else "routine",
                    "sort_order": i,
                })
            return valid

        except (json.JSONDecodeError, ValueError):
            logger.warning(
                "DifferentialFramingSkill: JSON parse failed — returning empty"
            )
            return []