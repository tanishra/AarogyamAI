import pytest

from api.services.intake_assistant import IntakeAssistant


@pytest.mark.asyncio
async def test_greeting_does_not_advance_from_chief_complaint():
    assistant = IntakeAssistant()
    answers = [
        {
            "question_hash": "a" * 64,
            "answer_text": "hi",
            "topic_tag": "chief_complaint",
        }
    ]
    decision = await assistant.decide_next(
        answers,
        current_topic="chief_complaint",
    )
    assert decision.questionnaire_done is False
    assert decision.next_question is not None
    assert decision.next_question.topic_tag == "chief_complaint"


@pytest.mark.asyncio
async def test_name_intro_does_not_satisfy_main_concern():
    assistant = IntakeAssistant()
    answers = [
        {
            "question_hash": "a" * 64,
            "answer_text": "I am Tanish",
            "topic_tag": "chief_complaint",
        }
    ]
    decision = await assistant.decide_next(
        answers,
        current_topic="chief_complaint",
    )
    assert decision.next_question is not None
    assert decision.next_question.topic_tag == "chief_complaint"


@pytest.mark.asyncio
async def test_age_text_does_not_satisfy_main_concern():
    assistant = IntakeAssistant()
    answers = [
        {
            "question_hash": "a" * 64,
            "answer_text": "I am 23 years old",
            "topic_tag": "chief_complaint",
        }
    ]
    decision = await assistant.decide_next(
        answers,
        current_topic="chief_complaint",
    )
    assert decision.next_question is not None
    assert decision.next_question.topic_tag == "chief_complaint"


@pytest.mark.asyncio
async def test_after_main_concern_bot_asks_free_follow_up():
    assistant = IntakeAssistant()
    answers = [
        {
            "question_hash": "a" * 64,
            "answer_text": "I have chest pain since yesterday",
            "topic_tag": "chief_complaint",
        }
    ]
    decision = await assistant.decide_next(
        answers,
        current_topic="chief_complaint",
    )
    assert decision.next_question is not None
    assert decision.next_question.topic_tag == "details"


@pytest.mark.asyncio
async def test_completion_after_done_intent_once_concern_exists():
    assistant = IntakeAssistant()
    answers = [
        {"question_hash": "a" * 64, "answer_text": "Chest pain", "topic_tag": "chief_complaint"},
        {"question_hash": "b" * 64, "answer_text": "that's all", "topic_tag": "details"},
    ]
    decision = await assistant.decide_next(answers, current_topic="details")
    assert decision.questionnaire_done is True
    assert decision.next_question is None


@pytest.mark.asyncio
async def test_soft_done_phrase_completes_after_context():
    assistant = IntakeAssistant()
    answers = [
        {"question_hash": "a" * 64, "answer_text": "I am having fever", "topic_tag": "chief_complaint"},
        {"question_hash": "b" * 64, "answer_text": "Since 2 days, resting at home", "topic_tag": "details"},
        {"question_hash": "c" * 64, "answer_text": "no thanks", "topic_tag": "details"},
    ]
    decision = await assistant.decide_next(answers, current_topic="details")
    assert decision.questionnaire_done is True
    assert decision.next_question is None


def test_summary_includes_name_and_age():
    assistant = IntakeAssistant()
    answers = [
        {"question_hash": "a" * 64, "answer_text": "Hi I am Tanish", "topic_tag": "chief_complaint"},
        {"question_hash": "b" * 64, "answer_text": "I am 23 years old", "topic_tag": "details"},
        {"question_hash": "c" * 64, "answer_text": "I have fever", "topic_tag": "chief_complaint"},
    ]
    summary = assistant.build_summary(answers)
    assert "Name: Tanish" in summary
    assert "Age: 23" in summary
