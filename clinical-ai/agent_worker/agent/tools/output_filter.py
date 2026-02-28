import hashlib
import logging
import re
from typing import Any

from agent_worker.agent.tools.base import BaseTool, ToolResult

logger = logging.getLogger(__name__)


# ── Blocked patterns — diagnostic language the LLM must never output ──────────
# From LLD v1.0 Section 4.6.5

_BLOCKED_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("diagnosis_statement", re.compile(
        r"\b(you have|patient has|diagnosis is|diagnosed with|confirms? "
        r"(the )?diagnosis)\b",
        re.IGNORECASE,
    )),
    ("definitive_condition", re.compile(
        r"\b(it is definitely|this is certainly|clearly (a|an|the)|"
        r"without doubt|undoubtedly)\b",
        re.IGNORECASE,
    )),
    ("treatment_prescription", re.compile(
        r"\b(prescribe|you should take|take \d+\s?mg|administer|"
        r"start (the patient on|on))\b",
        re.IGNORECASE,
    )),
    ("prognosis_statement", re.compile(
        r"\b(prognosis is|will (recover|deteriorate|worsen)|"
        r"life expectancy)\b",
        re.IGNORECASE,
    )),
    ("direct_medical_advice", re.compile(
        r"\b(you (must|need to|should) (see|visit|consult) a? ?(doctor|"
        r"specialist|hospital) immediately)\b",
        re.IGNORECASE,
    )),
]

# Safe framing language that is always allowed
_SAFE_FRAMING_PATTERNS: list[re.Pattern] = [
    re.compile(r"\bconsider(ing|ation)?\b", re.IGNORECASE),
    re.compile(r"\bmay (suggest|indicate|warrant)\b", re.IGNORECASE),
    re.compile(r"\bclinical feature(s)? (consistent|suggestive)\b", re.IGNORECASE),
    re.compile(r"\bwarrants? (further|investigation|review)\b", re.IGNORECASE),
    re.compile(r"\bfor physician review\b", re.IGNORECASE),
    re.compile(r"\bpossible\b", re.IGNORECASE),
    re.compile(r"\bpotential\b", re.IGNORECASE),
]


class OutputFilterTool(BaseTool):
    """
    Scans LLM output and blocks diagnostic language.

    This is the last gate before LLM output reaches the doctor dashboard.
    If any blocked pattern is found — the entire output is blocked
    and a fallback is activated. Partial blocking is not allowed.

    Input:
        {
            "text": str             — LLM output to scan
            "session_id": str       — for audit logging
        }

    Output (on success — text is clean):
        {
            "blocked": False,
            "text": str,            — original text (unchanged)
            "patterns_checked": int
        }

    Output (when blocked):
        ToolResult.blocked() with:
        {
            "blocked": True,
            "matched_categories": list[str],
            "output_hash": str,     — SHA-256 of blocked output for audit
            "session_id": str
        }
    """

    @property
    def name(self) -> str:
        return "OutputFilterTool"

    async def run(self, input_data: dict[str, Any]) -> ToolResult:
        text: str | None = input_data.get("text")
        session_id: str = input_data.get("session_id", "unknown")

        if not text:
            return ToolResult.fail(
                error="OutputFilterTool: input 'text' is required",
                metadata={"session_id": session_id},
            )

        if not isinstance(text, str):
            return ToolResult.fail(
                error="OutputFilterTool: input 'text' must be a string",
                metadata={"session_id": session_id},
            )

        try:
            matched_categories = self._scan(text)

            if matched_categories:
                output_hash = hashlib.sha256(text.encode()).hexdigest()
                logger.warning(
                    "OutputFilterTool: diagnostic language blocked",
                    extra={
                        "session_id": session_id,
                        "matched_categories": matched_categories,
                        "output_hash": output_hash,
                    },
                )
                return ToolResult.blocked(
                    reason="Diagnostic language detected in LLM output",
                    metadata={
                        "blocked": True,
                        "matched_categories": matched_categories,
                        "output_hash": output_hash,
                        "session_id": session_id,
                    },
                )

            return ToolResult.ok(
                output={
                    "blocked": False,
                    "text": text,
                    "patterns_checked": len(_BLOCKED_PATTERNS),
                },
                metadata={"session_id": session_id},
            )

        except Exception as exc:
            logger.error(
                "OutputFilterTool unexpected error",
                extra={"session_id": session_id, "error": str(exc)},
            )
            # Fail safe — if filter errors, block the output
            return ToolResult.blocked(
                reason=f"OutputFilterTool error — blocking as precaution: {exc}",
                metadata={"session_id": session_id, "abort": True},
            )

    def _scan(self, text: str) -> list[str]:
        """
        Returns list of matched category names.
        Empty list means text is clean.
        """
        matched: list[str] = []
        for category, pattern in _BLOCKED_PATTERNS:
            if pattern.search(text):
                matched.append(category)
        return matched