from pydantic import BaseModel, Field
from packages.domain.enums import QuestionType


class StartSessionRequest(BaseModel):
    clinic_id: str


class QuestionObject(BaseModel):
    question_id: str           # SHA-256 hash
    question_text: str
    question_type: QuestionType
    options: list[str] | None = None
    topic_tag: str
    is_emergency_check: bool


class StartSessionResponse(BaseModel):
    session_id: str
    expires_at: str
    use_static_form: bool
    first_question: QuestionObject


class SubmitAnswerRequest(BaseModel):
    session_id: str
    question_hash: str
    answer_text: str = Field(min_length=1, max_length=2000)
    topic_tag: str


class SubmitAnswerResponse(BaseModel):
    saved: bool
    questionnaire_done: bool
    next_question: QuestionObject | None = None
    emergency_advisory: str | None = None
    questions_remaining: int


class CompleteSessionRequest(BaseModel):
    session_id: str


class CompleteSessionResponse(BaseModel):
    questionnaire_complete: bool
    nurse_notified: bool
    message: str


# ── Rights Portal ─────────────────────────────────────────────────────────────

class ConsentRecord(BaseModel):
    tier: int
    status: str
    granted_at: str
    version: str
    withdrawn_at: str | None = None


class SessionSummary(BaseModel):
    session_id: str
    date: str
    status: str


class MyDataResponse(BaseModel):
    patient_id: str
    age_band: str
    consent_records: list[ConsentRecord]
    sessions: list[SessionSummary]
    data_categories_held: list[str]


class GrievanceRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    contact_email: str | None = Field(default=None, max_length=254)


class GrievanceResponse(BaseModel):
    grievance_id: str
    acknowledged_at: str
    resolution_sla_days: int


class ErasureRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ErasureResponse(BaseModel):
    request_id: str
    submitted_at: str
    sla_days: int
    note: str