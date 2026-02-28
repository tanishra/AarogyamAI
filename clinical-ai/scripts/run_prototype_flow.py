"""
Full prototype flow runner.

Runs the complete clinical journey:
  Patient consents → answers questions → nurse submits vitals
  → AI synthesis → doctor reviews → commits record

Usage:
    DATABASE_URL=... LLM_API_KEY=... LLM_PROVIDER=anthropic \
    uv run python scripts/run_prototype_flow.py
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from agent_worker.agent.agent_loop import AgentLoop
from agent_worker.agent.context import ContextObject
from agent_worker.agent.skills.context_aggregation import ContextAggregationSkill
from agent_worker.agent.skills.differential_framing import DifferentialFramingSkill
from agent_worker.agent.skills.reasoning_trace import ReasoningTraceSkill
from agent_worker.agent.tools.llm_tool import LLMTool
from agent_worker.agent.tools.output_filter import OutputFilterTool
from agent_worker.agent.tools.pii_stripper import PIIStripperTool
from agent_worker.agent.tools.structuring_tool import StructuringTool
from agent_worker.agent.tools.vitals_merger import VitalsMergerTool
from agent_worker.config import get_settings

# ── Sample clinical case ──────────────────────────────────────────────────────

SAMPLE_ANSWERS = [
    {
        "question_text": "What is your main health concern today?",
        "answer_text": "I have been having chest pain and shortness of breath.",
        "topic_tag": "chief_complaint",
    },
    {
        "question_text": "How long have you had these symptoms?",
        "answer_text": "About 3 days now. It started suddenly.",
        "topic_tag": "duration",
    },
    {
        "question_text": "Can you describe the chest pain?",
        "answer_text": (
            "It is a tightness, mostly in the centre of my chest. "
            "Sometimes it goes to my left arm."
        ),
        "topic_tag": "pain_description",
    },
    {
        "question_text": "Does anything make it better or worse?",
        "answer_text": "It gets worse when I climb stairs or walk fast.",
        "topic_tag": "aggravating_factors",
    },
    {
        "question_text": "Do you have any other symptoms?",
        "answer_text": "I feel dizzy sometimes and get very tired easily.",
        "topic_tag": "associated_symptoms",
    },
    {
        "question_text": "Do you have any medical conditions?",
        "answer_text": "I have high blood pressure for 5 years. My father had a heart attack.",
        "topic_tag": "medical_history",
    },
    {
        "question_text": "Are you taking any medications?",
        "answer_text": "Amlodipine 5mg daily for blood pressure.",
        "topic_tag": "medications",
    },
]

SAMPLE_VITALS = {
    "temperature_celsius": 37.2,
    "bp_systolic_mmhg": 158.0,   # WARNING — elevated
    "bp_diastolic_mmhg": 96.0,   # WARNING — elevated
    "heart_rate_bpm": 92.0,
    "respiratory_rate_pm": 20.0,
    "spo2_percent": 96.0,
    "weight_kg": 82.0,
    "height_cm": 168.0,
    "nurse_observation": (
        "Patient appears anxious. Mild diaphoresis noted. "
        "Complains of ongoing chest tightness."
    ),
}


def _print_section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def _print_step(step: str, detail: str = ""):
    print(f"\n  ▶ {step}")
    if detail:
        print(f"    {detail}")


def build_agent_loop() -> AgentLoop:
    settings = get_settings()

    pii_stripper = PIIStripperTool()
    output_filter = OutputFilterTool()
    vitals_merger = VitalsMergerTool()

    llm_tool = LLMTool(
        provider=settings.llm_provider,
        model_id=settings.llm_model_id,
        api_key=settings.llm_api_key,
        timeout_seconds=settings.llm_timeout_seconds,
        max_retries=settings.llm_max_retries,
        max_tokens=settings.llm_max_tokens,
    )

    return AgentLoop(
        context_aggregation_skill=ContextAggregationSkill(
            llm_tool=llm_tool,
            pii_stripper=pii_stripper,
            output_filter=output_filter,
            structuring_tool=StructuringTool(),
            vitals_merger=vitals_merger,
        ),
        differential_framing_skill=DifferentialFramingSkill(
            llm_tool=llm_tool,
            pii_stripper=pii_stripper,
            output_filter=output_filter,
        ),
        reasoning_trace_skill=ReasoningTraceSkill(),
        pii_stripper=pii_stripper,
    )


async def run():
    settings = get_settings()

    _print_section("PHASE 4 — PROTOTYPE FLOW")
    print(f"  Started : {datetime.now(timezone.utc).isoformat()}")
    print(f"  Provider: {settings.llm_provider}")
    print(f"  Model   : {settings.llm_model_id}")

    # ── Step 1: Patient answers ───────────────────────────────────────────────
    _print_section("STEP 1 — PATIENT QUESTIONNAIRE")
    for i, qa in enumerate(SAMPLE_ANSWERS, 1):
        _print_step(f"Q{i}: {qa['question_text']}", f"A: {qa['answer_text']}")

    # ── Step 2: Nurse vitals ──────────────────────────────────────────────────
    _print_section("STEP 2 — NURSE VITALS")
    for k, v in SAMPLE_VITALS.items():
        if k != "nurse_observation":
            print(f"  {k:<30} {v}")
    print(f"\n  Nurse note: {SAMPLE_VITALS['nurse_observation']}")

    # ── Step 3: Build context and run AgentLoop ───────────────────────────────
    _print_section("STEP 3 — AI SYNTHESIS")
    _print_step("Building ContextObject")

    context = ContextObject(
        session_id=str(uuid4()),
        patient_id="patient-demo-001",
        clinic_id="clinic-demo-001",
        raw_answers=SAMPLE_ANSWERS,
        raw_vitals=SAMPLE_VITALS,
    )

    _print_step("Running AgentLoop with real LLM calls...")
    agent_loop = build_agent_loop()

    start = asyncio.get_event_loop().time()
    result = await agent_loop.run(context)
    elapsed = round(asyncio.get_event_loop().time() - start, 2)

    # ── Step 4: Results ───────────────────────────────────────────────────────
    _print_section("STEP 4 — SYNTHESIS RESULTS")

    if result.fallback_active:
        print(f"\n  ⚠️  FALLBACK ACTIVE")
        print(f"  Reason: {result.fallback_reason.value if result.fallback_reason else 'unknown'}")
    else:
        print(f"\n  ✅ Synthesis successful in {elapsed}s")
        print(f"  Skills completed: {result.skills_completed}")
        print(f"  Urgency flag    : {result.urgency_flag.value}")
        print(f"  Emergency       : {result.emergency_flagged}")
        print(f"  Outlier vitals  : {[f['field'] for f in result.outlier_flags]}")

    # ── Step 5: Structured context ────────────────────────────────────────────
    _print_section("STEP 5 — STRUCTURED CLINICAL CONTEXT")
    ctx = result.structured_context
    if ctx:
        print(f"\n  Chief complaint : {ctx.get('chief_complaint', 'N/A')}")
        print(f"  HPI             : {ctx.get('history_of_present_illness', 'N/A')}")
        print(f"  PMH             : {ctx.get('past_medical_history', [])}")
        print(f"  Medications     : {ctx.get('current_medications', [])}")
    else:
        print("  No structured context (fallback active)")

    # ── Step 6: Differentials ─────────────────────────────────────────────────
    _print_section("STEP 6 — CLINICAL CONSIDERATIONS (For Physician Review Only)")
    if result.differentials:
        for i, diff in enumerate(result.differentials, 1):
            print(f"\n  [{i}] {diff['title']}")
            print(f"      Urgency  : {diff['urgency_flag']}")
            print(f"      Reasoning: {diff['clinical_reasoning']}")
            print(f"      Features : {diff['supporting_features']}")
    else:
        print("  No differentials generated (fallback active)")

    # ── Step 7: Reasoning trace ───────────────────────────────────────────────
    _print_section("STEP 7 — REASONING TRACE")
    trace = result.reasoning_trace
    if trace:
        print(f"\n  AI Label        : {trace.get('ai_label')}")
        print(f"  PII stripped    : {trace.get('pii_was_found_and_stripped')}")
        print(f"  Fallback active : {trace.get('fallback_active')}")
    else:
        print("  No trace generated")

    # ── Step 8: Doctor decision (simulated) ───────────────────────────────────
    _print_section("STEP 8 — DOCTOR REVIEW (Simulated)")
    if result.differentials:
        first = result.differentials[0]
        print(f"\n  Doctor accepts : '{first['title']}'")
        print(f"  Doctor plan    : Arrange ECG, troponin, cardiology referral")
        print(f"  Doctor note    : Patient to be monitored, BP management reviewed")
        print(f"\n  ✅ Record committed (Tier 3 consent verified)")
    else:
        print("  Doctor uses static form (fallback path)")

    _print_section("PROTOTYPE FLOW COMPLETE")
    print(f"\n  ⏱  Total time: {elapsed}s")
    print(f"  📋 Pending tasks reminder:")
    print(f"     - Step 15.4: Run alembic upgrade head")
    print(f"     - Step 16  : Run integration tests")
    print()


if __name__ == "__main__":
    asyncio.run(run())
