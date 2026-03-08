from dataclasses import dataclass, field
from typing import Any

from packages.domain.enums import FallbackReason, SessionStatus, UrgencyFlag


@dataclass
class ContextObject:
    """
    Explicit state contract for the AgentLoop.

    Rules:
      - Passed explicitly to every skill — never global
      - AgentLoop is the only writer
      - Skills read from context, write only to SkillResult
      - AgentLoop merges SkillResult back into context after each skill
      - No PHI after PIIStripperTool runs
    """

    # ── Identity (no PHI after strip) ────────────────────────────────────────
    session_id: str
    patient_id: str
    clinic_id: str

    # ── Raw inputs ────────────────────────────────────────────────────────────
    raw_answers: list[dict[str, Any]] = field(default_factory=list)
    raw_vitals: dict[str, Any] = field(default_factory=dict)

    # ── Stripped inputs (after PIIStripperTool) ───────────────────────────────
    stripped_answers: list[dict[str, Any]] = field(default_factory=list)
    pii_was_found: bool = False

    # ── Structured context (after ContextAggregationSkill) ───────────────────
    structured_context: dict[str, Any] = field(default_factory=dict)

    # ── Merged context with vitals (after VitalsMergerTool) ──────────────────
    merged_context: dict[str, Any] = field(default_factory=dict)
    outlier_flags: list[dict] = field(default_factory=list)
    urgency_flag: UrgencyFlag = UrgencyFlag.ROUTINE
    emergency_flagged: bool = False

    # ── Differentials (after DifferentialFramingSkill) ───────────────────────
    differentials: list[dict[str, Any]] = field(default_factory=list)

    # ── Reasoning trace (after ReasoningTraceSkill) ───────────────────────────
    reasoning_trace: dict[str, Any] = field(default_factory=dict)

    # ── Skill execution state ─────────────────────────────────────────────────
    skills_completed: list[str] = field(default_factory=list)
    current_skill: str | None = None

    # ── Fallback state ────────────────────────────────────────────────────────
    fallback_active: bool = False
    fallback_reason: FallbackReason | None = None

    def mark_skill_complete(self, skill_name: str) -> None:
        self.skills_completed.append(skill_name)
        self.current_skill = None

    def activate_fallback(self, reason: FallbackReason) -> None:
        self.fallback_active = True
        self.fallback_reason = reason

    def to_log_dict(self) -> dict:
        """
        Safe representation for logging.
        Never includes raw_answers or raw_vitals — may contain PHI.
        """
        return {
            "session_id": self.session_id,
            "clinic_id": self.clinic_id,
            "skills_completed": self.skills_completed,
            "current_skill": self.current_skill,
            "fallback_active": self.fallback_active,
            "fallback_reason": (
                self.fallback_reason.value
                if self.fallback_reason else None
            ),
            "urgency_flag": self.urgency_flag.value,
            "differentials_count": len(self.differentials),
        }