import logging
from typing import Any

from agent_worker.agent.tools.base import BaseTool, ToolResult
from packages.validators.vitals_validator import VitalsValidator

logger = logging.getLogger(__name__)

# Fields the merger extracts from the vitals DB record
_VITALS_FIELDS = [
    "temperature_celsius",
    "bp_systolic_mmhg",
    "bp_diastolic_mmhg",
    "heart_rate_bpm",
    "respiratory_rate_pm",
    "spo2_percent",
    "weight_kg",
    "height_cm",
]


class VitalsMergerTool(BaseTool):
    """
    Merges validated vitals into the clinical context object.
    Also recomputes urgency flag based on outlier severity.
    Pure deterministic logic — no LLM.

    Input:
        {
            "vitals": dict,              — raw vitals dict from DB
            "structured_context": dict   — context built by StructuringTool
        }

    Output (on success):
        {
            "merged_context": dict,      — context with vitals added
            "urgency_flag": str,         — "routine" | "urgent" | "critical"
            "outlier_flags": list[dict]
        }
    """

    def __init__(self) -> None:
        self._validator = VitalsValidator()

    @property
    def name(self) -> str:
        return "VitalsMergerTool"

    async def run(self, input_data: dict[str, Any]) -> ToolResult:
        vitals: dict | None = input_data.get("vitals")
        structured_context: dict | None = input_data.get("structured_context")

        if not vitals:
            return ToolResult.fail(
                error="VitalsMergerTool: 'vitals' is required",
            )

        if structured_context is None:
            return ToolResult.fail(
                error="VitalsMergerTool: 'structured_context' is required",
            )

        try:
            # Extract only known vital fields
            vitals_for_validation = {
                k: float(v)
                for k, v in vitals.items()
                if k in _VITALS_FIELDS and v is not None
            }

            # Re-validate — deterministic, never trust stored values blindly
            validation_result = self._validator.validate(vitals_for_validation)

            if not validation_result.is_valid:
                return ToolResult.fail(
                    error=(
                        f"VitalsMergerTool: vitals failed validation — "
                        f"{validation_result.errors}"
                    ),
                )

            # Compute urgency flag
            urgency_flag = self._compute_urgency(validation_result)

            # Build vitals summary
            vitals_summary = {k: vitals_for_validation[k] for k in _VITALS_FIELDS
                              if k in vitals_for_validation}

            # Add nurse observation if present
            if vitals.get("nurse_observation"):
                vitals_summary["nurse_observation"] = vitals["nurse_observation"]

            # Merge into context
            merged = dict(structured_context)
            merged["vitals_summary"] = vitals_summary
            merged["outlier_flags"] = [
                f.to_dict() for f in validation_result.outlier_flags
            ]
            merged["urgency_flag"] = urgency_flag
            merged["emergency_flagged"] = validation_result.is_emergency

            return ToolResult.ok(
                output={
                    "merged_context": merged,
                    "urgency_flag": urgency_flag,
                    "outlier_flags": [
                        f.to_dict() for f in validation_result.outlier_flags
                    ],
                },
            )

        except Exception as exc:
            logger.error(
                "VitalsMergerTool failed",
                extra={"error": str(exc)},
            )
            return ToolResult.fail(
                error=f"VitalsMergerTool unexpected error: {exc}",
            )

    def _compute_urgency(self, result) -> str:
        """
        Deterministic urgency — no LLM involved.
        critical outlier → critical
        warning outlier  → urgent
        no outliers      → routine
        """
        from packages.domain.enums import VitalsSeverity

        if result.is_emergency:
            return "critical"

        has_warning = any(
            f.severity == VitalsSeverity.WARNING
            for f in result.outlier_flags
        )
        return "urgent" if has_warning else "routine"