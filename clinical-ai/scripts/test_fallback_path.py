"""
Validates that the fallback path works correctly.

Tests:
  1. PII strip failure → fallback
  2. LLM timeout → fallback  
  3. Output filter block → fallback
  4. All fallbacks return valid AgentLoopResult

Usage:
    uv run python scripts/test_fallback_path.py
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

from agent_worker.agent.agent_loop import AgentLoop
from agent_worker.agent.context import ContextObject
from agent_worker.agent.skills.context_aggregation import ContextAggregationSkill
from agent_worker.agent.skills.differential_framing import DifferentialFramingSkill
from agent_worker.agent.skills.reasoning_trace import ReasoningTraceSkill
from agent_worker.agent.skills.base import SkillResult
from agent_worker.agent.tools.base import ToolResult
from packages.domain.enums import FallbackReason


def make_context() -> ContextObject:
    return ContextObject(
        session_id="fallback-test-001",
        patient_id="patient-fallback",
        clinic_id="clinic-demo-001",
        raw_answers=[
            {
                "question_text": "Main complaint?",
                "answer_text": "Chest pain",
                "topic_tag": "chief_complaint",
            }
        ],
        raw_vitals={
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


async def test_pii_failure():
    print("\n  Test 1: PII strip failure")
    pii_tool = MagicMock()
    pii_tool.run = AsyncMock(return_value=ToolResult.fail(error="strip failed"))

    loop = AgentLoop(
        context_aggregation_skill=MagicMock(),
        differential_framing_skill=MagicMock(),
        reasoning_trace_skill=MagicMock(),
        pii_stripper=pii_tool,
    )

    result = await loop.run(make_context())
    assert result.success is False
    assert result.fallback_reason == FallbackReason.PII_STRIP_FAILED
    assert result.differentials == []
    print("  ✅ PII failure → fallback activated correctly")


async def test_llm_timeout():
    print("\n  Test 2: LLM timeout fallback")
    pii_tool = MagicMock()
    pii_tool.run = AsyncMock(return_value=ToolResult.ok(output={
        "stripped_text": "chest pain",
        "was_modified": False,
        "categories_found": [],
        "input_hash": "a" * 64,
    }))

    agg_skill = MagicMock()
    agg_skill.execute = AsyncMock(return_value=SkillResult.fail(
        skill_name="ContextAggregation",
        error="LLM timed out after 20s",
        fallback_reason=FallbackReason.LLM_TIMEOUT,
    ))

    loop = AgentLoop(
        context_aggregation_skill=agg_skill,
        differential_framing_skill=MagicMock(),
        reasoning_trace_skill=MagicMock(),
        pii_stripper=pii_tool,
    )

    result = await loop.run(make_context())
    assert result.success is False
    assert result.fallback_reason == FallbackReason.LLM_TIMEOUT
    print("  ✅ LLM timeout → fallback activated correctly")


async def test_output_filter_block():
    print("\n  Test 3: Output filter block fallback")
    pii_tool = MagicMock()
    pii_tool.run = AsyncMock(return_value=ToolResult.ok(output={
        "stripped_text": "chest pain",
        "was_modified": False,
        "categories_found": [],
        "input_hash": "a" * 64,
    }))

    agg_skill = MagicMock()
    agg_skill.execute = AsyncMock(return_value=SkillResult.ok(
        skill_name="ContextAggregation",
        output={
            "structured_context": {"chief_complaint": "chest pain"},
            "merged_context": {"chief_complaint": "chest pain"},
            "urgency_flag": "routine",
            "outlier_flags": [],
            "emergency_flagged": False,
        },
    ))

    diff_skill = MagicMock()
    diff_skill.execute = AsyncMock(return_value=SkillResult.fail(
        skill_name="DifferentialFraming",
        error="Output filter blocked — diagnostic language detected",
        fallback_reason=FallbackReason.OUTPUT_FILTER_BLOCKED,
    ))

    loop = AgentLoop(
        context_aggregation_skill=agg_skill,
        differential_framing_skill=diff_skill,
        reasoning_trace_skill=MagicMock(),
        pii_stripper=pii_tool,
    )

    result = await loop.run(make_context())
    assert result.success is False
    assert result.fallback_reason == FallbackReason.OUTPUT_FILTER_BLOCKED
    # Structured context still available even on diff fallback
    assert result.structured_context.get("chief_complaint") == "chest pain"
    print("  ✅ Output filter block → fallback, structured context preserved")


async def run():
    print("=" * 60)
    print("  FALLBACK PATH VALIDATION")
    print("=" * 60)

    await test_pii_failure()
    await test_llm_timeout()
    await test_output_filter_block()

    print("\n" + "=" * 60)
    print("  ✅ All fallback paths validated")
    print("=" * 60)
    print("\n  📋 Pending tasks reminder:")
    print("     - Step 15.4: Run alembic upgrade head")
    print("     - Step 16  : Run integration tests")


if __name__ == "__main__":
    asyncio.run(run())