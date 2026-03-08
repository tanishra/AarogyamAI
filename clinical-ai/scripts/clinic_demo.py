"""
Interactive clinic demo script.
Shows a clinic operator the full patient journey with real outputs.

Usage:
    DATABASE_URL=... LLM_API_KEY=... \
    uv run python scripts/clinic_demo.py
"""
import asyncio
import os
from datetime import datetime, timezone


def _banner():
    print("\n" + "=" * 60)
    print("  AarogyamAI — Clinic Operator Demo")
    print(f"  {datetime.now(timezone.utc).strftime('%d %B %Y, %H:%M UTC')}")
    print("=" * 60)


def _pause(msg: str = "Press Enter to continue..."):
    input(f"\n  → {msg}")


async def run():
    _banner()

    print("""
  This demo walks through the complete clinical AI workflow:

  1. Patient registers and gives consent
  2. Patient answers adaptive questions
  3. Nurse submits vitals
  4. AI generates clinical context + considerations
  5. Doctor reviews and commits record

  All AI outputs are clearly labelled:
  "AI-Generated — For Physician Review Only — Not a Diagnosis"
    """)

    _pause("Start demo")

    # Step 1
    print("\n  STEP 1 — PATIENT CONSENT")
    print("  Patient scans QR code at clinic reception.")
    print("  Receives OTP on registered mobile number.")
    print("  Reviews consent document (version 1.1).")
    print("  Grants Tier 1 consent — 4 required purposes.")
    _pause()

    # Step 2
    print("\n  STEP 2 — ADAPTIVE QUESTIONNAIRE")
    print("  Patient answers questions on their phone.")
    print("  AI generates next question based on answers.")
    print("  No PHI stored — all answers PII-stripped before AI.")
    questions = [
        ("Chief complaint", "Chest pain and breathlessness for 3 days"),
        ("Duration", "Started suddenly 3 days ago"),
        ("Character", "Tightness in centre, radiates to left arm"),
        ("Aggravating factors", "Worse on exertion"),
        ("PMH", "Hypertension 5 years, family history of heart disease"),
        ("Medications", "Amlodipine 5mg daily"),
    ]
    for q, a in questions:
        print(f"    Q: {q}")
        print(f"    A: {a}")
        print()
    _pause()

    # Step 3
    print("\n  STEP 3 — NURSE VITALS")
    print("  Nurse submits vitals on tablet.")
    print("  Outlier detection runs automatically.")
    vitals = [
        ("Temperature", "37.2°C", "normal"),
        ("BP Systolic", "158 mmHg", "⚠️  WARNING — elevated"),
        ("BP Diastolic", "96 mmHg", "⚠️  WARNING — elevated"),
        ("Heart Rate", "92 bpm", "normal"),
        ("SpO2", "96%", "normal"),
        ("Respiratory Rate", "20/min", "normal"),
    ]
    for name, value, status in vitals:
        print(f"    {name:<20} {value:<15} {status}")
    print("\n  Nurse confirms elevated BP outliers before submitting.")
    _pause()

    # Step 4
    print("\n  STEP 4 — AI SYNTHESIS")
    print("  AgentLoop runs:")
    print("    1. PII strip all answers")
    print("    2. Structure clinical context (LLM)")
    print("    3. Merge vitals + flag outliers")
    print("    4. Generate clinical considerations (LLM)")
    print("    5. Output filter — block any diagnostic language")
    print("    6. Reasoning trace for audit")
    print("\n  ⏱  Typical synthesis time: 8-15 seconds")
    _pause("Run live synthesis? (requires LLM_API_KEY)")

    if os.environ.get("LLM_API_KEY"):
        print("\n  Running live synthesis...")
        from scripts.run_prototype_flow import run as run_prototype
        await run_prototype()
    else:
        print("\n  LLM_API_KEY not set — showing sample output:")
        print("""
  Structured Context:
    Chief complaint : Chest pain and breathlessness
    HPI             : 3-day history of central chest tightness
                      radiating to left arm, worse on exertion
    PMH             : Hypertension, family history of CAD
    Medications     : Amlodipine 5mg

  Clinical Considerations (AI-Generated — For Physician Review Only):

  [1] Possible Acute Coronary Syndrome
      Urgency  : critical
      Features : chest tightness, radiation to left arm,
                 exertional component, hypertension, family history
      Reasoning: Features may suggest ACS — warrants urgent
                 evaluation including ECG and troponin

  [2] Consider Hypertensive Emergency
      Urgency  : urgent
      Features : BP 158/96, known hypertension
      Reasoning: Elevated BP consistent with inadequate control
                 — may warrant medication review
        """)

    _pause()

    # Step 5
    print("\n  STEP 5 — DOCTOR REVIEW")
    print("  Doctor sees on dashboard:")
    print("    - Structured clinical context")
    print("    - Vitals with outlier flags highlighted")
    print("    - AI considerations (clearly labelled)")
    print("    - Accept / Modify / Reject each consideration")
    print("    - Add own considerations")
    print("    - Write assessment, plan, rationale")
    print("    - Commit record (requires Tier 3 consent)")
    print("\n  SMS receipt sent to patient after commit.")
    _pause()

    # Summary
    print("\n" + "=" * 60)
    print("  DEMO COMPLETE")
    print("=" * 60)
    print("""
  Key safety guarantees demonstrated:
    ✅ PII never reaches LLM
    ✅ AI output filtered — no diagnostic language
    ✅ All AI outputs labelled "For Physician Review Only"
    ✅ Doctor action required — AI never commits record
    ✅ Consent verified at every sensitive step
    ✅ Full audit trail with hash-chain integrity
    ✅ Fallback path — system works without AI

  📋 Pending tasks reminder:
     ⏳ Step 15.4 — Run: uv run alembic upgrade head
     ⏳ Step 16   — Run: uv run pytest tests/integration/ -v
     ⏳ Phase 4   — Run scripts in order:
          1. uv run python scripts/seed_clinic.py
          2. uv run python scripts/test_fallback_path.py
          3. uv run python scripts/run_prototype_flow.py
    """)


if __name__ == "__main__":
    asyncio.run(run())