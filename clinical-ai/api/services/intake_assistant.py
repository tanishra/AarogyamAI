from __future__ import annotations

import json
import re
from dataclasses import dataclass

import structlog
from pydantic import BaseModel, Field, ValidationError

from api.config import get_settings
from packages.domain.enums import QuestionType
from packages.schemas.patient import QuestionObject

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class IntakeDecision:
    next_question: QuestionObject | None
    questionnaire_done: bool
    questions_remaining: int
    emergency_advisory: str | None


@dataclass(frozen=True)
class IntakeChatReply:
    assistant_text: str
    extracted_fields: dict[str, str]
    completed: bool
    emergency_advisory: str | None


class IntakePatientProfile(BaseModel):
    name: str | None = None
    age: int | None = None
    location: str | None = None


class IntakeLLMChatTurn(BaseModel):
    assistant_text: str = Field(min_length=1, max_length=500)
    done: bool = False
    profile: IntakePatientProfile = Field(default_factory=IntakePatientProfile)
    main_concern: str | None = None
    key_points: list[str] = Field(default_factory=list)


class IntakeLLMSummary(BaseModel):
    profile: IntakePatientProfile = Field(default_factory=IntakePatientProfile)
    main_concern: str
    additional_details: list[str] = Field(default_factory=list)


class IntakeAssistant:
    """
    Conversational intake assistant.

    Goal: have a natural chat, capture the patient's main concern and key notes,
    then complete when patient indicates they are done.
    """

    _TOPICS: list[tuple[str, str]] = [
        (
            "chief_complaint",
            "What health concern brought you in today?",
        ),
        ("duration", "How long have you been experiencing this?"),
        ("severity", "On a scale of 1 to 10, how severe is it right now?"),
        ("aggravating_factors", "Does anything make it worse?"),
        ("relieving_factors", "Does anything help make it better?"),
        ("associated_symptoms", "Are you experiencing any other symptoms along with this?"),
        ("past_medical_history", "Do you have any known medical conditions?"),
        ("medications", "Are you currently taking any medicines?"),
        ("allergies", "Do you have any allergies to medicines or food?"),
    ]

    # These topics MUST all be explicitly answered before questionnaire completes.
    # We check these only via tagged answers — inference cannot skip them.
    _MANDATORY_TOPICS: set[str] = {
        "chief_complaint",
        "duration",
        "severity",
        "associated_symptoms",
        "past_medical_history",
        "medications",
        "allergies",
    }

    _EMERGENCY_TRIGGERS = (
        "severe chest pain",
        "can't breathe",
        "cannot breathe",
        "fainting",
        "unconscious",
        "seizure",
        "heavy bleeding",
        "suicidal",
    )

    async def decide_next(
        self,
        answers: list[dict],
        current_topic: str | None = None,
    ) -> IntakeDecision:
        settings = get_settings()
        if settings.llm_api_key:
            llm_decision = await self._decide_next_llm_chat(answers)
            if llm_decision is not None:
                logger.info("intake_next_question_source", source="llm_chat")
                return llm_decision
        logger.info("intake_next_question_source", source="deterministic_simple")
        return await self._decide_next_simple(answers)

    async def _decide_next_llm_chat(self, answers: list[dict]) -> IntakeDecision | None:
        settings = get_settings()
        if not settings.llm_api_key:
            return None

        advisory = self._emergency_advisory(answers)
        if not answers:
            return IntakeDecision(
                next_question=QuestionObject(
                    question_id=self._question_id("chief_complaint"),
                    question_text="Hi, I am Priya from the clinic intake team. What brings you in today?",
                    question_type=QuestionType.TEXT,
                    options=None,
                    topic_tag="chief_complaint",
                    is_emergency_check=True,
                ),
                questionnaire_done=False,
                questions_remaining=1,
                emergency_advisory=advisory,
            )

        latest = str(answers[-1].get("answer_text", "")).strip()
        latest_low = latest.lower()
        main_concern = self._extract_main_concern(answers)
        clinical_count = len(self._clinical_messages(answers))
        if main_concern and self._is_completion_intent(latest_low, clinical_count):
            return IntakeDecision(
                next_question=None,
                questionnaire_done=True,
                questions_remaining=0,
                emergency_advisory=advisory,
            )

        name, age, location = self._extract_patient_profile(answers)
        convo_lines = []
        for idx, a in enumerate(answers[-10:], start=1):
            convo_lines.append(f'{idx}. "{str(a.get("answer_text", "")).strip()}"')
        conversation = "\n".join(convo_lines) if convo_lines else "(none)"
        main_concern_text = main_concern or "missing"
        detail_hint = (
            "Ask for main health problem."
            if not main_concern
            else "Continue naturally; avoid repeating already-answered prompts."
        )

        system_prompt = (
            "You are Priya, a warm clinical intake assistant. "
            "Talk naturally like ChatGPT in short conversational style. "
            "Understand greetings, small talk, and patient questions. "
            "Do not diagnose or prescribe. "
            "If patient seems done and enough intake exists, mark done=true. "
            "Never ask the exact same question repeatedly. "
            "Respond ONLY in JSON with keys: assistant_text, done, profile, main_concern, key_points. "
            "profile must include name, age, location when available."
        )
        user_prompt = (
            f"Patient profile known: name={name or 'unknown'}, age={age or 'unknown'}, location={location or 'unknown'}\n"
            f"Main concern status: {main_concern_text}\n"
            f"Clinical detail count: {clinical_count}\n"
            f"Current guidance: {detail_hint}\n"
            f"Latest message: \"{latest}\"\n"
            f"Recent conversation:\n{conversation}\n"
            "Rules:\n"
            "1. assistant_text should be <=45 words, natural and human.\n"
            "2. Include at most one follow-up question.\n"
            "3. If patient asks a side question, acknowledge it and continue intake naturally.\n"
            "4. If done=true, assistant_text can be a brief closure line.\n"
            "5. Do not repeat same question already answered by patient.\n"
        )
        try:
            raw = await self._call_llm(
                provider=settings.llm_provider,
                model_id=settings.llm_model_id,
                api_key=settings.llm_api_key,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=180,
            )
            payload = self._parse_json_object(raw)
            if payload is None:
                return None
            try:
                turn = IntakeLLMChatTurn.model_validate(payload)
            except ValidationError:
                return None

            assistant_text = turn.assistant_text.strip()
            done = bool(turn.done)
            if not assistant_text:
                return None
            if done and main_concern:
                return IntakeDecision(
                    next_question=None,
                    questionnaire_done=True,
                    questions_remaining=0,
                    emergency_advisory=advisory,
                )

            next_topic = "chief_complaint" if not main_concern else "details"
            return IntakeDecision(
                next_question=QuestionObject(
                    question_id=self._question_id(next_topic),
                    question_text=assistant_text,
                    question_type=QuestionType.TEXT,
                    options=None,
                    topic_tag=next_topic,
                    is_emergency_check=(next_topic == "chief_complaint"),
                ),
                questionnaire_done=False,
                questions_remaining=0 if main_concern else 1,
                emergency_advisory=advisory,
            )
        except Exception as exc:
            logger.warning("intake_llm_chat_failed", error=str(exc))
            return None

    async def _decide_next_simple(self, answers: list[dict]) -> IntakeDecision:
        advisory = self._emergency_advisory(answers)
        if not answers:
            return IntakeDecision(
                next_question=QuestionObject(
                    question_id=self._question_id("chief_complaint"),
                    question_text=(
                        "Hi, I am Priya from the clinic intake team. "
                        "What brings you in today?"
                    ),
                    question_type=QuestionType.TEXT,
                    options=None,
                    topic_tag="chief_complaint",
                    is_emergency_check=True,
                ),
                questionnaire_done=False,
                questions_remaining=1,
                emergency_advisory=advisory,
            )

        latest = str(answers[-1].get("answer_text", "")).strip()
        latest_low = latest.lower()
        main_concern = self._extract_main_concern(answers)

        clinical_count = len(self._clinical_messages(answers))
        if main_concern and self._is_completion_intent(latest_low, clinical_count):
            return IntakeDecision(
                next_question=None,
                questionnaire_done=True,
                questions_remaining=0,
                emergency_advisory=advisory,
            )

        if not main_concern:
            return IntakeDecision(
                next_question=QuestionObject(
                    question_id=self._question_id("chief_complaint"),
                    question_text=self._contextualize_question(
                        "Could you share your main health problem or symptom right now?",
                        answers,
                        target_topic="chief_complaint",
                    ),
                    question_type=QuestionType.TEXT,
                    options=None,
                    topic_tag="chief_complaint",
                    is_emergency_check=True,
                ),
                questionnaire_done=False,
                questions_remaining=1,
                emergency_advisory=advisory,
            )

        meaningful_clinical_count = clinical_count
        if meaningful_clinical_count >= 3:
            follow_up = (
                "Thanks, that helps. If there is anything else important, tell me now. "
                "If not, say 'that's all' and I will send this to your nurse."
            )
        elif self._looks_like_patient_question(latest_low):
            follow_up = (
                "Great question. I will include that for your care team. "
                "Could you also share any other important symptom or detail?"
            )
        elif meaningful_clinical_count == 1:
            follow_up = (
                "Got it. Since when has this been happening, and is anything making it better or worse?"
            )
        else:
            follow_up = (
                "Understood. Any other details I should note, such as medicines, allergies, "
                "or other symptoms?"
            )

        return IntakeDecision(
            next_question=QuestionObject(
                question_id=self._question_id("details"),
                question_text=follow_up,
                question_type=QuestionType.TEXT,
                options=None,
                topic_tag="details",
                is_emergency_check=False,
            ),
            questionnaire_done=False,
            questions_remaining=0,
            emergency_advisory=advisory,
        )

    def _decide_next_deterministic(
        self,
        answers: list[dict],
        current_topic: str | None = None,
    ) -> IntakeDecision:
        # Mandatory topics: only count explicitly tagged valid answers
        mandatory_covered = (
            self._covered_topics_from_tagged_answers(answers) & self._MANDATORY_TOPICS
        )
        missing_mandatory = self._MANDATORY_TOPICS - mandatory_covered

        # Optional topics: can use inference
        all_covered = self._covered_topics_from_tagged_answers(answers)
        all_covered |= self._infer_covered_topics_from_answers(answers)

        advisory = self._emergency_advisory(answers)

        topic_to_default = {topic: text for topic, text in self._TOPICS}
        target_topic = self._pick_target_topic(
            all_covered=all_covered,
            missing_mandatory=missing_mandatory,
            current_topic=current_topic,
        )
        if target_topic is not None:
            question_text = self._contextualize_question(
                topic_to_default.get(target_topic, "Could you tell me more?"),
                answers,
                target_topic=target_topic,
            )
            remaining = max(0, len(missing_mandatory) - (1 if target_topic in missing_mandatory else 0))
            return IntakeDecision(
                next_question=QuestionObject(
                    question_id=self._question_id(target_topic),
                    question_text=question_text,
                    question_type=QuestionType.TEXT,
                    options=None,
                    topic_tag=target_topic,
                    is_emergency_check=target_topic == "chief_complaint",
                ),
                questionnaire_done=False,
                questions_remaining=remaining,
                emergency_advisory=advisory,
            )

        return IntakeDecision(
            next_question=None,
            questionnaire_done=True,
            questions_remaining=0,
            emergency_advisory=advisory,
        )

    async def _decide_next_via_llm(
        self,
        answers: list[dict],
        current_topic: str | None = None,
    ) -> IntakeDecision | None:
        settings = get_settings()
        if not settings.llm_api_key:
            logger.warning("intake_llm_unavailable", reason="LLM_API_KEY missing")
            return None

        # Mandatory coverage: only from explicitly tagged answers
        mandatory_covered = (
            self._covered_topics_from_tagged_answers(answers) & self._MANDATORY_TOPICS
        )
        missing_mandatory = self._MANDATORY_TOPICS - mandatory_covered

        # All coverage (for optional topics)
        all_covered = self._covered_topics_from_tagged_answers(answers)
        all_covered |= self._infer_covered_topics_from_answers(answers)

        # Build ordered list of remaining topics
        topic_order = [t for t, _ in self._TOPICS]
        remaining_topics: list[str] = []
        for t in topic_order:
            if t in missing_mandatory or t not in all_covered:
                remaining_topics.append(t)

        if not remaining_topics:
            # All topics covered — let deterministic handle completion
            return None

        topic_to_default = {topic: text for topic, text in self._TOPICS}
        target_topic = self._pick_target_topic(
            all_covered=all_covered,
            missing_mandatory=missing_mandatory,
            current_topic=current_topic,
        ) or remaining_topics[0]
        default_question = topic_to_default.get(target_topic, "Could you tell me more?")
        latest_answer = (
            str(answers[-1].get("answer_text", "")).strip() if answers else ""
        )

        is_near_end = len(remaining_topics) <= 2
        summary_so_far = self.build_summary(answers)

        # Full conversation history for LLM context
        conversation_history = ""
        for i, a in enumerate(answers[-8:], 1):
            conversation_history += f'  Turn {i}: "{a.get("answer_text", "")}"\n'

        system_prompt = (
            "You are Priya, a warm and experienced clinical intake nurse at a clinic. "
            "You are having a natural, friendly conversation with a patient to collect "
            "their health information before the doctor sees them. "
            "You sound like a REAL human nurse — warm, caring, empathetic, conversational. "
            "NEVER sound robotic. "
            "CRITICAL VARIETY RULE: You must NEVER repeat the same acknowledgment phrase twice in a conversation. "
            "Do NOT use: 'Thanks for sharing that', 'Thank you for sharing that', 'Thanks for sharing'. "
            "Instead vary naturally. Use things like: "
            "'Got it.', 'I see.', 'Okay.', 'Alright.', 'I understand.', 'That makes sense.', "
            "'Okay [Name].', 'Right.', 'Good to know.', 'Noted.', 'Understood.', "
            "or just naturally flow into the next question without any filler. "
            "NEVER use patient name more than once in a row across consecutive turns. "
            "If patient just gave their name, greet warmly and ask health concern. "
            "Do NOT diagnose, recommend treatment, or give medical advice. "
            "Ask exactly ONE follow-up question per response. Keep it short and natural — under 40 words. "
            "IMPORTANT: If the patient already answered a topic (even with 'no', 'nothing', 'none'), "
            "that topic IS covered. Do NOT ask about it again. Move on immediately. "
            "If all remaining topics are covered, output: "
            '{"topic_tag": "done", "question_text": "QUESTIONNAIRE_COMPLETE"}. '
            + (
                "You are on the last 1-2 topics. Finish up naturally. "
                if is_near_end
                else ""
            )
            + "\nRespond ONLY with valid JSON:\n"
            '{"topic_tag": "<topic>", "question_text": "<response>"}'
        )

        # Build explicit already-answered list for the LLM
        covered_summary_lines = []
        for a in answers:
            t = a.get("topic_tag", "")
            v = a.get("answer_text", "")
            if t and v and t not in ("free_text",):
                covered_summary_lines.append(f"  - {t}: \"{v}\"")
        covered_detail = "\n".join(covered_summary_lines) if covered_summary_lines else "  (none yet)"

        user_prompt = (
            f"ALREADY ANSWERED (DO NOT ASK AGAIN):\n{covered_detail}\n\n"
            f"Topics still needed: {remaining_topics}\n"
            f"Collect THIS topic next: '{target_topic}'\n"
            f"Latest patient message: \"{latest_answer or 'none'}\"\n"
            f"Recent conversation:\n{conversation_history}"
            "RULES:\n"
            "1. Only ask about a topic from 'Topics still needed'.\n"
            "2. topic_tag MUST be from that list.\n"
            "3. 'no', 'nothing', 'none', 'no issues' ARE valid answers — mark that topic done.\n"
            "4. VARY acknowledgment every turn — never repeat same phrase.\n"
            "5. Even if patient asks a side question, still gently collect the target topic in this turn.\n"
        )

        try:
            text = await self._call_llm(
                provider=settings.llm_provider,
                model_id=settings.llm_model_id,
                api_key=settings.llm_api_key,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=150,
            )

            payload = self._parse_json_object(text)
            if payload is None:
                logger.warning("intake_llm_json_parse_failed", raw=text[:200])
                return None

            topic_tag = target_topic
            question_text = str(payload.get("question_text", default_question)).strip()

            # LLM signalled all done
            if topic_tag == "done" or "QUESTIONNAIRE_COMPLETE" in question_text:
                return None  # let deterministic handle completion

            if not question_text:
                question_text = self._contextualize_question(
                    default_question,
                    answers,
                    target_topic=target_topic,
                )
            elif answers:
                latest_low = str(answers[-1].get("answer_text", "")).strip().lower()
                if (
                    IntakeAssistant._looks_like_patient_question(latest_low)
                    and "great question" not in question_text.lower()
                ):
                    question_text = f"Great question. {question_text}"

            advisory = self._emergency_advisory(answers)
            remaining_count = max(0, len(remaining_topics) - 1)

            return IntakeDecision(
                next_question=QuestionObject(
                    question_id=self._question_id(topic_tag),
                    question_text=question_text[:300],
                    question_type=QuestionType.TEXT,
                    options=None,
                    topic_tag=topic_tag,
                    is_emergency_check=topic_tag == "chief_complaint",
                ),
                questionnaire_done=False,
                questions_remaining=remaining_count,
                emergency_advisory=advisory,
            )
        except Exception as exc:
            logger.warning("intake_llm_failed_fallback", error=str(exc))
            return None

    def build_summary(self, answers: list[dict]) -> str:
        """Machine-readable summary for nurse dashboard."""
        if not answers:
            return "No intake responses submitted yet."

        name, age, location = self._extract_patient_profile(answers)
        main_concern = self._extract_main_concern(answers) or "Not clearly stated yet."
        details = self._clinical_messages(answers)[1:6]
        summary_parts: list[str] = []
        if name:
            summary_parts.append(f"Name: {name}")
        if age is not None:
            summary_parts.append(f"Age: {age}")
        if location:
            summary_parts.append(f"Location: {location}")
        summary_parts.append(f"Main concern: {main_concern}")
        if details:
            summary_parts.append(f"Additional details: {' | '.join(details)}")
        return " | ".join(summary_parts)[:1200]

    async def build_summary_for_nurse(self, answers: list[dict]) -> str:
        structured = await self._build_structured_summary_via_llm(answers)
        if structured is None:
            return self.build_summary(answers)
        parts: list[str] = []
        if structured.profile.name:
            parts.append(f"Name: {structured.profile.name}")
        if structured.profile.age is not None:
            parts.append(f"Age: {structured.profile.age}")
        if structured.profile.location:
            parts.append(f"Location: {structured.profile.location}")
        parts.append(f"Main concern: {structured.main_concern}")
        if structured.additional_details:
            parts.append(f"Additional details: {' | '.join(structured.additional_details[:5])}")
        return " | ".join(parts)[:1200]

    def build_human_summary(self, answers: list[dict]) -> str:
        """
        Human-readable summary shown to patient at end of intake.
        Returns two things:
          - display_text: formatted with bullet points for rendering
          - tts_text: plain spoken version for TTS (no bullets, spoken naturally)
        Returned as a JSON string so frontend can split them.
        """
        if not answers:
            return ""

        name, age, location = self._extract_patient_profile(answers)
        main_concern = self._extract_main_concern(answers) or "Not clearly stated yet."
        detail_items = self._clinical_messages(answers)[1:6]

        # Display version — with bullet points for UI
        display_lines = ["Here's a quick summary of what you've shared with me:"]
        if name:
            display_lines.append(f"• Name: {name}")
        if age is not None:
            display_lines.append(f"• Age: {age}")
        if location:
            display_lines.append(f"• Location: {location}")
        display_lines.append(f"• Main concern: {main_concern}")
        if detail_items:
            for value in detail_items:
                display_lines.append(f"• {value}")
        else:
            display_lines.append("• Additional details: None shared")
        display_lines.append("\nI'll pass all of this to your nurse now. You're all set — thank you, take care!")
        display_text = "\n".join(display_lines)

        # TTS version — spoken naturally, no bullets
        tts_parts = ["Great, here's a quick summary of what you've shared with me."]
        if name:
            tts_parts.append(f"Name: {name}.")
        if age is not None:
            tts_parts.append(f"Age: {age}.")
        if location:
            tts_parts.append(f"Location: {location}.")
        tts_parts.append(f"Main concern: {main_concern}.")
        if detail_items:
            for value in detail_items:
                tts_parts.append(f"Additional detail: {value}.")
        tts_parts.append("I'll pass all of this to your nurse now. You're all set — thank you, and take care!")
        tts_text = " ".join(tts_parts)

        return json.dumps({"display_text": display_text, "tts_text": tts_text})

    async def build_human_summary_for_patient(self, answers: list[dict]) -> str:
        structured = await self._build_structured_summary_via_llm(answers)
        if structured is None:
            return self.build_human_summary(answers)
        display_lines = ["Here's a quick summary of what you've shared with me:"]
        if structured.profile.name:
            display_lines.append(f"• Name: {structured.profile.name}")
        if structured.profile.age is not None:
            display_lines.append(f"• Age: {structured.profile.age}")
        if structured.profile.location:
            display_lines.append(f"• Location: {structured.profile.location}")
        display_lines.append(f"• Main concern: {structured.main_concern}")
        if structured.additional_details:
            for item in structured.additional_details[:5]:
                display_lines.append(f"• {item}")
        display_lines.append("\nI'll pass all of this to your nurse now. You're all set — thank you, take care!")
        display_text = "\n".join(display_lines)

        tts_parts = ["Great, here's a quick summary of what you've shared with me."]
        if structured.profile.name:
            tts_parts.append(f"Name: {structured.profile.name}.")
        if structured.profile.age is not None:
            tts_parts.append(f"Age: {structured.profile.age}.")
        if structured.profile.location:
            tts_parts.append(f"Location: {structured.profile.location}.")
        tts_parts.append(f"Main concern: {structured.main_concern}.")
        for item in structured.additional_details[:5]:
            tts_parts.append(f"Additional detail: {item}.")
        tts_parts.append("I'll pass all of this to your nurse now. You're all set — thank you, and take care!")
        tts_text = " ".join(tts_parts)
        return json.dumps({"display_text": display_text, "tts_text": tts_text})

    @staticmethod
    def _question_id(topic_tag: str) -> str:
        return (topic_tag * 8)[:64].ljust(64, "0")

    def _emergency_advisory(self, answers: list[dict]) -> str | None:
        if not answers:
            return None
        latest = str(answers[-1].get("answer_text", "")).lower()
        if any(trigger in latest for trigger in self._EMERGENCY_TRIGGERS):
            return (
                "Your response may indicate an urgent issue. "
                "Please alert clinic staff immediately or seek emergency care."
            )
        return None

    @staticmethod
    def _contextualize_question(
        question_text: str,
        answers: list[dict],
        target_topic: str,
    ) -> str:
        if not answers:
            if target_topic == "chief_complaint":
                return (
                    "Hi, I am Priya from the clinic intake team. "
                    "What health concern brought you in today?"
                )
            return question_text
        latest = str(answers[-1].get("answer_text", "")).strip()
        if not latest:
            return question_text
        low = latest.lower()

        if IntakeAssistant._is_greeting_like(low):
            if target_topic == "chief_complaint":
                return (
                    "Hi, nice to meet you. "
                    "Could you share what symptoms or concern you have today?"
                )
            return f"Hi, thanks for that. {question_text}"
        if IntakeAssistant._is_name_intro(low):
            name_match = re.search(r"\b(?:i am|i'm|my name is)\s+([A-Za-z]+)", low)
            name = name_match.group(1).capitalize() if name_match else ""
            greeting = f"Nice to meet you{', ' + name if name else ''}!"
            if target_topic == "chief_complaint":
                return f"{greeting} What health concern brought you in today?"
            return f"{greeting} {question_text}"
        if re.search(r"\b(i am|i'm)\s+\d{1,3}\b", low):
            if target_topic == "chief_complaint":
                return (
                    "Thanks for sharing. "
                    "To help you properly, what symptoms or concern brings you in today?"
                )
            return f"Thanks for sharing. {question_text}"
        if IntakeAssistant._looks_like_patient_question(low):
            return (
                "Great question. I will capture that for your doctor as well. "
                f"{question_text}"
            )

        return f"Thanks for sharing that. {question_text}"

    @staticmethod
    def _looks_like_patient_question(text: str) -> bool:
        if "?" in text:
            return True
        return bool(
            re.match(
                r"^\s*(what|why|how|can|could|should|is|are|do|does|will|when|where)\b",
                text.strip(),
                re.IGNORECASE,
            )
        )

    @staticmethod
    def _is_completion_intent(text: str, clinical_count: int = 0) -> bool:
        hard_done = bool(
            re.search(
                r"\b(that'?s all|thats all|i am done|i'm done|im done|no more|nothing else|that is it|that's it|finished)\b",
                text,
                re.IGNORECASE,
            )
        )
        if hard_done:
            return True
        soft_done = bool(
            re.search(
                r"^\s*(no|nope|nah|no thanks|no thank you|thank you|thanks)\b",
                text,
                re.IGNORECASE,
            )
        )
        return soft_done and clinical_count >= 2

    def _clinical_messages(self, answers: list[dict]) -> list[str]:
        messages: list[str] = []
        for answer in answers:
            text = str(answer.get("answer_text", "")).strip()
            if not text:
                continue
            low = text.lower()
            if self._is_greeting_like(low):
                continue
            if self._is_name_intro(low):
                continue
            if re.fullmatch(r"(i am|i'm)\s+\d{1,3}(\s+years?\s+old)?[.,!]*", low):
                continue
            if self._is_completion_intent(low):
                continue
            if self._is_soft_closure_message(low):
                continue
            if len(low.split()) <= 2 and not self._looks_like_symptom_statement(low):
                continue
            messages.append(text)
        return messages

    def _extract_main_concern(self, answers: list[dict]) -> str | None:
        # Prefer explicitly tagged chief complaint first.
        for answer in answers:
            topic = str(answer.get("topic_tag", "")).strip().lower()
            text = str(answer.get("answer_text", "")).strip()
            if topic == "chief_complaint" and self._looks_like_symptom_statement(text.lower()):
                return text
        # Fallback to first symptom-like statement anywhere in the conversation.
        for text in self._clinical_messages(answers):
            if self._looks_like_symptom_statement(text.lower()):
                return text
        return None

    async def _build_structured_summary_via_llm(
        self,
        answers: list[dict],
    ) -> IntakeLLMSummary | None:
        if not answers:
            return None
        settings = get_settings()
        if not settings.llm_api_key:
            return None

        name, age, location = self._extract_patient_profile(answers)
        main_concern = self._extract_main_concern(answers) or ""
        details = self._clinical_messages(answers)[:8]
        convo = "\n".join(f'- "{d}"' for d in details) if details else "- (none)"

        system_prompt = (
            "You are a clinical intake summarizer for nurse handoff. "
            "Convert patient chat into concise, clinically clear statements. "
            "Do not add diagnosis or treatment advice. "
            "Respond ONLY as JSON with keys: profile, main_concern, additional_details."
        )
        user_prompt = (
            f"Known profile: name={name or 'unknown'}, age={age or 'unknown'}, location={location or 'unknown'}\n"
            f"Detected main concern: {main_concern or 'unknown'}\n"
            f"Chat snippets:\n{convo}\n"
            "Requirements:\n"
            "1. Rewrite main_concern in professional concise nurse-handoff style.\n"
            "2. Rewrite additional_details as short factual points.\n"
            "3. Keep details list max 5 items.\n"
            "4. Preserve facts only.\n"
        )
        try:
            raw = await self._call_llm(
                provider=settings.llm_provider,
                model_id=settings.llm_model_id,
                api_key=settings.llm_api_key,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=220,
            )
            payload = self._parse_json_object(raw)
            if payload is None:
                return None
            return IntakeLLMSummary.model_validate(payload)
        except Exception as exc:
            logger.warning("intake_llm_summary_failed", error=str(exc))
            return None

    @staticmethod
    def _is_soft_closure_message(text: str) -> bool:
        return bool(
            re.match(
                r"^\s*(ok|okay|no thanks|no thank you|thanks|thank you|got it|understood|nothing)\b",
                text,
                re.IGNORECASE,
            )
        )

    @staticmethod
    def _extract_patient_profile(answers: list[dict]) -> tuple[str | None, int | None, str | None]:
        name: str | None = None
        age: int | None = None
        location: str | None = None
        for answer in answers:
            text = str(answer.get("answer_text", "")).strip()
            if not text:
                continue
            low = text.lower()
            # Name patterns: "I am Tanish", "I'm Tanish", "My name is Tanish"
            name_match = re.search(r"\b(?:my name is|i am|i'm)\s+([A-Za-z]{2,})\b", text, re.IGNORECASE)
            if name_match:
                candidate = name_match.group(1)
                if candidate.lower() not in {"having", "feeling", "facing", "suffering", "experiencing"}:
                    if not re.fullmatch(r"\d{1,3}", candidate):
                        name = candidate.capitalize()
            # Age patterns: "I am 23", "I'm 23 years old"
            age_match = re.search(r"\b(?:i am|i'm)\s+(\d{1,3})(?:\s*(?:years?\s*old|yrs?|yo))?\b", low)
            if age_match:
                try:
                    value = int(age_match.group(1))
                    if 0 < value < 125:
                        age = value
                except Exception:
                    pass
            location_match = re.search(
                r"\b(?:i live in|i am from|i'm from|from)\s+([A-Za-z][A-Za-z\s'-]{1,40})$",
                text,
                re.IGNORECASE,
            )
            if location_match:
                candidate_loc = location_match.group(1).strip(" .,!").title()
                if candidate_loc and len(candidate_loc) >= 2:
                    location = candidate_loc
        return name, age, location

    def _pick_target_topic(
        self,
        all_covered: set[str],
        missing_mandatory: set[str],
        current_topic: str | None,
    ) -> str | None:
        # Keep current topic sticky until a valid answer is captured.
        if current_topic:
            if current_topic in missing_mandatory or current_topic not in all_covered:
                return current_topic

        # Ask missing mandatory topics first in canonical order.
        for topic_tag, _ in self._TOPICS:
            if topic_tag in missing_mandatory:
                return topic_tag

        # Then ask optional missing topics in order.
        for topic_tag, _ in self._TOPICS:
            if topic_tag not in all_covered:
                return topic_tag

        return None

    @staticmethod
    def _covered_topics_from_tagged_answers(answers: list[dict]) -> set[str]:
        covered: set[str] = set()
        for answer in answers:
            topic = str(answer.get("topic_tag", "")).strip()
            if not topic:
                continue
            text = str(answer.get("answer_text", "")).strip()
            if IntakeAssistant._is_valid_answer_for_topic(topic, text):
                covered.add(topic)
        return covered

    # Short answers that count as valid responses to any non-chief-complaint topic
    _NEGATIVE_ANSWERS: frozenset = frozenset({
        "no", "none", "nope", "nah", "nothing", "nothing like that",
        "not really", "not at all", "no i don't", "no i do not",
        "never", "negative", "nil", "nka", "n/a", "na",
        "no known", "no allergies", "no medicine", "no medication",
        "no medical", "no history", "no conditions", "nothing else",
        "no other", "no symptoms", "no issues", "no problems",
    })

    @staticmethod
    def _is_negative_answer(text: str) -> bool:
        low = text.lower().strip().rstrip(".,!")
        if low in IntakeAssistant._NEGATIVE_ANSWERS:
            return True
        if re.match(r"^no\b", low) and len(low.split()) <= 5:
            return True
        if re.match(r"^nothing\b", low) and len(low.split()) <= 4:
            return True
        return False

    @staticmethod
    def _is_valid_answer_for_topic(topic: str, text: str) -> bool:
        low = text.lower().strip()
        if not low:
            return False
        if IntakeAssistant._is_greeting_like(low):
            return False
        if IntakeAssistant._is_name_intro(low):
            return False
        if re.fullmatch(r"(i am|i'm)\s+\d{1,3}(\s+years?\s+old)?[.,!]*", low):
            return False

        # Negative/nil answers are valid for every topic except chief_complaint
        if topic != "chief_complaint" and IntakeAssistant._is_negative_answer(low):
            return True

        # Single digit or "X/10" is valid for severity
        if topic == "severity" and re.match(r"^\d{1,2}(/10)?$", low):
            return True

        # Short duration answers
        if topic == "duration":
            if re.search(r"\b\d+\s*(day|days|week|weeks|month|months|year|years|hour|hours)\b", low):
                return True
            if re.search(r"\b(since yesterday|since last|since morning|since night|for a while)\b", low):
                return True
            return False

        # Affirmative + substance counts for relieving/aggravating
        if topic in ("relieving_factors", "aggravating_factors"):
            if re.match(r"^(yes|yeah|yep)\b", low) and len(low.split()) >= 2:
                return True
            if len(low) >= 6:
                return True

        topic_hits = IntakeAssistant._infer_topics_from_text(low)
        if topic in topic_hits:
            return True

        if topic == "chief_complaint":
            return IntakeAssistant._looks_like_symptom_statement(low)

        if topic == "associated_symptoms":
            if IntakeAssistant._is_negative_answer(low):
                return True
            return len(low) >= 3

        if topic == "past_medical_history":
            return IntakeAssistant._is_negative_answer(low) or len(low) >= 3

        if topic == "medications":
            if IntakeAssistant._is_negative_answer(low):
                return True
            return bool(
                re.search(
                    r"\b(mg|tablet|capsule|once daily|twice daily|medication|medicine|taking)\b",
                    low,
                )
            ) or len(low) >= 3

        if topic == "allergies":
            return IntakeAssistant._is_negative_answer(low) or "allerg" in low or len(low) >= 3

        # Generic fallback for optional topics only
        return len(low) >= 5

    @staticmethod
    def _is_greeting_like(text: str) -> bool:
        return bool(
            re.fullmatch(
                r"(hi+|hello+|hey+|good\s+(morning|afternoon|evening)|namaste)[!.,\s]*",
                text.strip(),
                re.IGNORECASE,
            )
        )

    @staticmethod
    def _is_name_intro(text: str) -> bool:
        """Matches 'I am Tanish', 'my name is XYZ', 'I'm Tanish' with no health info."""
        low = text.lower().strip()
        is_name = bool(re.search(r"\b(i am|i'm|my name is)\b", low)) and len(low.split()) <= 8
        has_symptom = IntakeAssistant._looks_like_symptom_statement(low)
        return is_name and not has_symptom

    @staticmethod
    def _looks_like_symptom_statement(text: str) -> bool:
        symptom_words = (
            "pain", "fever", "cough", "cold", "breath", "dizzy", "vomit",
            "nausea", "headache", "weak", "swelling", "bleeding", "rash",
            "fatigue", "tired", "chest", "throat", "stomach", "back",
            "ache", "hurt", "sore", "burning", "itching", "discharge",
            "diarrhea", "constipation", "weight", "appetite", "sleep",
        )
        return any(word in text for word in symptom_words) or (
            ("have" in text or "having" in text or "feeling" in text) and len(text) >= 12
        )

    @staticmethod
    def _infer_covered_topics_from_answers(answers: list[dict]) -> set[str]:
        """
        Light heuristic topic recognition from free-text.
        NOTE: Never used to mark mandatory topics as covered — only supplements
        optional topics like aggravating_factors, relieving_factors.
        """
        inferred: set[str] = set()
        if not answers:
            return inferred
        for answer in answers:
            text = str(answer.get("answer_text", "")).strip().lower()
            if not text:
                continue
            inferred |= IntakeAssistant._infer_topics_from_text(text)
        # Remove mandatory topics from inference — they must come from explicit tagged answers
        inferred -= IntakeAssistant._MANDATORY_TOPICS
        return inferred

    @staticmethod
    def _infer_topics_from_text(text: str) -> set[str]:
        inferred: set[str] = set()
        if not text:
            return inferred

        if any(re.search(p, text) for p in (
            r"\b\d+\s*(day|days|week|weeks|month|months|year|years|hour|hours)\b",
            r"\b(since yesterday|since last|for a while|for some time)\b",
        )):
            inferred.add("duration")
        if any(re.search(p, text) for p in (
            r"\b([1-9]|10)\s*/\s*10\b",
            r"\b(severe|mild|moderate|unbearable|worst)\b",
        )):
            inferred.add("severity")
        if any(re.search(p, text) for p in (
            r"\b(worse when|worsens with|triggered by|on exertion|while walking|climbing stairs)\b",
        )):
            inferred.add("aggravating_factors")
        if any(re.search(p, text) for p in (
            r"\b(better with|relieved by|improves with|after rest|rest helps)\b",
        )):
            inferred.add("relieving_factors")
        if any(re.search(p, text) for p in (
            r"\b(mg|tablet|capsule|once daily|twice daily|medication|medicine|taking)\b",
        )):
            inferred.add("medications")
        if any(re.search(p, text) for p in (
            r"\b(allergy|allergic to|no known allergies|nka)\b",
        )):
            inferred.add("allergies")
        if any(re.search(p, text) for p in (
            r"\b(hypertension|diabetes|asthma|thyroid|heart disease|bp)\b",
            r"\b(diagnosed with|history of)\b",
        )):
            inferred.add("past_medical_history")
        if (
            any(re.search(p, text) for p in (r"\b(also|along with|plus)\b",))
            or " and " in text
        ):
            inferred.add("associated_symptoms")
        if IntakeAssistant._looks_like_symptom_statement(text):
            inferred.add("chief_complaint")

        return inferred

    async def _call_llm(
        self,
        provider: str,
        model_id: str,
        api_key: str,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str:
        if provider == "openai":
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model=model_id,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content or ""

        if provider == "anthropic":
            import anthropic

            client = anthropic.AsyncAnthropic(api_key=api_key)
            message = await client.messages.create(
                model=model_id,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return message.content[0].text

        raise ValueError(f"Unsupported intake LLM provider: {provider}")

    @staticmethod
    def _parse_json_object(raw_text: str) -> dict | None:
        text = raw_text.strip()
        if not text:
            return None
        if text.startswith("```"):
            lines = text.splitlines()
            text = "\n".join(lines[1:-1]).strip()
        try:
            payload = json.loads(text)
            return payload if isinstance(payload, dict) else None
        except Exception:
            pass
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            payload = json.loads(match.group(0))
            return payload if isinstance(payload, dict) else None
        except Exception:
            return None
