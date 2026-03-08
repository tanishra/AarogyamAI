import hashlib
import logging
import re
from typing import Any

from agent_worker.agent.tools.base import BaseTool, ToolResult

logger = logging.getLogger(__name__)


# ── PII patterns ──────────────────────────────────────────────────────────────
# All patterns compiled once at import time — never recompiled per call

_PATTERNS: list[tuple[str, re.Pattern]] = [
    # Phone — ISD prefix or local 10-digit
    ("phone", re.compile(
        r"(\+91[\s\-]?)?[6-9]\d{9}",
        re.IGNORECASE,
    )),
    # Email
    ("email", re.compile(
        r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    )),
    # Aadhaar — 12 digits (may have spaces every 4)
    ("aadhaar", re.compile(
        r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b",
    )),
    # PAN — 5 letters, 4 digits, 1 letter
    ("pan", re.compile(
        r"\b[A-Z]{5}\d{4}[A-Z]\b",
    )),
    # DOB — common Indian formats
    # ("dob", re.compile(
    #     r"\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4}|\d{2})\b",
    # )),
    ("dob", re.compile(
        r"\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4}|\d{2})\b",
        re.ASCII,
    )),
    # Name prefix patterns (Dr., Mr., Mrs., Ms.)
    ("name_prefix", re.compile(
        r"\b(Dr|Mr|Mrs|Ms|Prof)\.?\s+[A-Z][a-z]+(\s+[A-Z][a-z]+){0,2}\b",
    )),
    # Address — door/flat number patterns
    ("address", re.compile(
        r"\b(flat|house|door|plot|no\.|#)\s*[\w\d\-\/]+",
        re.IGNORECASE,
    )),
]

_PLACEHOLDER = "[REDACTED]"


class PIIStripperTool(BaseTool):
    """
    Strips PII from text before it is sent to the LLM.

    Input:
        {
            "text": str          — raw text to strip
            "context": str       — optional label for logging (no PHI)
        }

    Output (on success):
        {
            "stripped_text": str,
            "categories_found": list[str],   — which PII types were found
            "input_hash": str,               — SHA-256 of original (for audit)
            "was_modified": bool
        }

    Critical rule: if this tool fails — AgentLoop MUST abort.
    Never send unstripped text to the LLM.
    """

    @property
    def name(self) -> str:
        return "PIIStripperTool"

    async def run(self, input_data: dict[str, Any]) -> ToolResult:
        text: str | None = input_data.get("text")
        context: str = input_data.get("context", "unknown")

        if not text:
            return ToolResult.fail(
                error="PIIStripperTool: input 'text' is required",
                metadata={"context": context},
            )

        if not isinstance(text, str):
            return ToolResult.fail(
                error="PIIStripperTool: input 'text' must be a string",
                metadata={"context": context},
            )

        try:
            input_hash = hashlib.sha256(text.encode()).hexdigest()
            stripped, categories_found = self._strip(text)
            was_modified = stripped != text

            if was_modified:
                logger.info(
                    "PII stripped from text",
                    extra={
                        "context": context,
                        "categories_found": categories_found,
                        "input_hash": input_hash,
                    },
                )

            return ToolResult.ok(
                output={
                    "stripped_text": stripped,
                    "categories_found": categories_found,
                    "input_hash": input_hash,
                    "was_modified": was_modified,
                },
                metadata={"context": context},
            )

        except Exception as exc:
            # Any failure here is CRITICAL — caller must abort, not continue
            logger.error(
                "PIIStripperTool failed — aborting",
                extra={"context": context, "error": str(exc)},
            )
            return ToolResult.fail(
                error=f"PIIStripperTool unexpected error: {exc}",
                metadata={"context": context, "abort": True},
            )

    def _strip(self, text: str) -> tuple[str, list[str]]:
        """
        Apply all PII patterns to text.
        Returns (stripped_text, list_of_categories_found).
        """
        categories_found: list[str] = []
        result = text

        for category, pattern in _PATTERNS:
            new_result, count = pattern.subn(_PLACEHOLDER, result)
            if count > 0:
                categories_found.append(category)
                result = new_result

        return result, categories_found