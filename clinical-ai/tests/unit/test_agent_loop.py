from unittest.mock import AsyncMock, MagicMock
import pytest

from agent_worker.agent.agent_loop import AgentLoop, AgentLoopResult
from agent_worker.agent.context import ContextObject
from agent_worker.agent.skills.base import SkillResult
from agent_worker.agent.tools.base import ToolResult
from packages.domain.enums import FallbackReason, OutcomeStatus, UrgencyFlag


# ── Fixtures ───────────────────────────────────────────────────────────────────

def make_context(
    raw_answers: list | None = None,
    raw_vitals: dict | None = None,
) -> ContextObject:
    return ContextObject(
        session_id="sess-001",
        patient_id="patient-001",
        clinic_id="clinic-001",
        raw_answers=raw_answers or [
            {"question_text": "What is your complaint?", "answer_text": "chest pain"},
        ],
        raw_vitals=raw_vitals or {
            "temperature_celsius": 37.0,
            "bp_systolic_mmhg": 120.0,
            "bp_diastolic_mmhg": 80.0,
            "heart_rate_bpm": 75.0,
            "respiratory_rate_pm": 16.0,
            "spo2_percent": 98.0,
            "weight_kg": 70.0,
            "height_cm": 170.0,
        },
    )


def make_pii_tool(was_modified: bool = False) -> MagicMock:
    tool = MagicMock()
    tool.run = AsyncMock(return_value=ToolResult.ok(output={
        "stripped_text": "chest pain",
        "categories_found": [],
        "input_hash": "a" * 64,
        "was_modified": was_modified,
    }))
    return tool


def make_aggregation_skill(success: bool = True) -> MagicMock:
    skill = MagicMock()
    if success:
        skill.execute = AsyncMock(return_value=SkillResult.ok(
            skill_name="ContextAggregation",
            output={
                "structured_context": {"chief_complaint": "chest pain"},
                "merged_context": {"chief_complaint": "chest pain",
                                   "vitals_summary": {}},
                "urgency_flag": "routine",
                "outlier_flags": [],
                "emergency_flagged": False,
            },
        ))
    else:
        skill.execute = AsyncMock(return_value=SkillResult.fail(
            skill_name="ContextAggregation",
            error="LLM timed out",
            fallback_reason=FallbackReason.LLM_TIMEOUT,
        ))
    return skill


def make_differential_skill(success: bool = True) -> MagicMock:
    skill = MagicMock()
    if success:
        skill.execute = AsyncMock(return_value=SkillResult.ok(
            skill_name="DifferentialFraming",
            output={
                "differentials": [
                    {
                        "title": "Possible cardiac event",
                        "supporting_features": ["chest pain"],
                        "clinical_reasoning": "Features may suggest...",
                        "urgency_flag": "urgent",
                        "sort_order": 0,
                    }
                ],
            },
        ))
    else:
        skill.execute = AsyncMock(return_value=SkillResult.fail(
            skill_name="DifferentialFraming",
            error="Output blocked",
            fallback_reason=FallbackReason.OUTPUT_FILTER_BLOCKED,
        ))
    return skill


def make_trace_skill(success: bool = True) -> MagicMock:
    skill = MagicMock()
    if success:
        skill.execute = AsyncMock(return_value=SkillResult.ok(
            skill_name="ReasoningTrace",
            output={
                "reasoning_trace": {
                    "skills_completed": [],
                    "ai_label": "AI-Generated — For Physician Review Only — Not a Diagnosis",
                }
            },
        ))
    else:
        skill.execute = AsyncMock(return_value=SkillResult.fail(
            skill_name="ReasoningTrace",
            error="trace failed",
            fallback_reason=FallbackReason.LLM_ERROR,
        ))
    return skill


def make_agent_loop(
    agg_success: bool = True,
    diff_success: bool = True,
    trace_success: bool = True,
    pii_modified: bool = False,
) -> AgentLoop:
    return AgentLoop(
        context_aggregation_skill=make_aggregation_skill(agg_success),
        differential_framing_skill=make_differential_skill(diff_success),
        reasoning_trace_skill=make_trace_skill(trace_success),
        pii_stripper=make_pii_tool(pii_modified),
    )


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestHappyPath:
    @pytest.mark.asyncio
    async def test_successful_run_returns_success(self):
        loop = make_agent_loop()
        result = await loop.run(make_context())

        assert result.success is True
        assert result.fallback_active is False
        assert result.fallback_reason is None
        assert result.session_id == "sess-001"

    @pytest.mark.asyncio
    async def test_successful_run_has_differentials(self):
        loop = make_agent_loop()
        result = await loop.run(make_context())

        assert len(result.differentials) == 1
        assert result.differentials[0]["title"] == "Possible cardiac event"

    @pytest.mark.asyncio
    async def test_successful_run_has_structured_context(self):
        loop = make_agent_loop()
        result = await loop.run(make_context())

        assert result.structured_context["chief_complaint"] == "chest pain"

    @pytest.mark.asyncio
    async def test_successful_run_skills_completed(self):
        loop = make_agent_loop()
        result = await loop.run(make_context())

        assert "ContextAggregation" in result.skills_completed
        assert "DifferentialFraming" in result.skills_completed

    @pytest.mark.asyncio
    async def test_pii_found_flag_propagated(self):
        loop = make_agent_loop(pii_modified=True)
        ctx = make_context()
        await loop.run(ctx)
        assert ctx.pii_was_found is True

    @pytest.mark.asyncio
    async def test_empty_answers_still_runs(self):
        loop = make_agent_loop()
        result = await loop.run(make_context(raw_answers=[]))
        assert result.success is True


class TestPIIStripFailure:
    @pytest.mark.asyncio
    async def test_pii_strip_failure_activates_fallback(self):
        loop = AgentLoop(
            context_aggregation_skill=make_aggregation_skill(),
            differential_framing_skill=make_differential_skill(),
            reasoning_trace_skill=make_trace_skill(),
            pii_stripper=MagicMock(
                run=AsyncMock(return_value=ToolResult.fail(
                    error="PII strip error"
                ))
            ),
        )
        result = await loop.run(make_context())

        assert result.success is False
        assert result.fallback_active is True
        assert result.fallback_reason == FallbackReason.PII_STRIP_FAILED

    @pytest.mark.asyncio
    async def test_pii_strip_failure_returns_empty_differentials(self):
        loop = AgentLoop(
            context_aggregation_skill=make_aggregation_skill(),
            differential_framing_skill=make_differential_skill(),
            reasoning_trace_skill=make_trace_skill(),
            pii_stripper=MagicMock(
                run=AsyncMock(return_value=ToolResult.fail(
                    error="PII strip error"
                ))
            ),
        )
        result = await loop.run(make_context())
        assert result.differentials == []


class TestAggregationFailure:
    @pytest.mark.asyncio
    async def test_aggregation_failure_activates_fallback(self):
        loop = make_agent_loop(agg_success=False)
        result = await loop.run(make_context())

        assert result.success is False
        assert result.fallback_active is True
        assert result.fallback_reason == FallbackReason.LLM_TIMEOUT

    @pytest.mark.asyncio
    async def test_aggregation_failure_has_empty_differentials(self):
        loop = make_agent_loop(agg_success=False)
        result = await loop.run(make_context())
        assert result.differentials == []

    @pytest.mark.asyncio
    async def test_aggregation_failure_skills_not_progressed(self):
        loop = make_agent_loop(agg_success=False)
        result = await loop.run(make_context())
        assert "DifferentialFraming" not in result.skills_completed


class TestDifferentialFailure:
    @pytest.mark.asyncio
    async def test_differential_failure_activates_fallback(self):
        loop = make_agent_loop(diff_success=False)
        result = await loop.run(make_context())

        assert result.success is False
        assert result.fallback_active is True
        assert result.fallback_reason == FallbackReason.OUTPUT_FILTER_BLOCKED

    @pytest.mark.asyncio
    async def test_differential_failure_has_empty_differentials(self):
        loop = make_agent_loop(diff_success=False)
        result = await loop.run(make_context())
        assert result.differentials == []

    @pytest.mark.asyncio
    async def test_differential_failure_aggregation_still_completed(self):
        loop = make_agent_loop(diff_success=False)
        result = await loop.run(make_context())
        assert "ContextAggregation" in result.skills_completed


class TestReasoningTraceFailure:
    @pytest.mark.asyncio
    async def test_trace_failure_is_non_fatal(self):
        """Reasoning trace failure must NOT activate fallback."""
        loop = make_agent_loop(trace_success=False)
        result = await loop.run(make_context())

        assert result.success is True
        assert result.fallback_active is False

    @pytest.mark.asyncio
    async def test_trace_failure_still_has_differentials(self):
        loop = make_agent_loop(trace_success=False)
        result = await loop.run(make_context())
        assert len(result.differentials) == 1


class TestLogging:
    @pytest.mark.asyncio
    async def test_to_log_dict_has_no_phi(self):
        loop = make_agent_loop()
        result = await loop.run(make_context())

        log = result.to_log_dict()
        assert "raw_answers" not in log
        assert "raw_vitals" not in log
        assert "session_id" in log
        assert "success" in log