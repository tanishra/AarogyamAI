from pydantic import BaseModel, Field
from packages.domain.enums import UrgencyFlag, DoctorAction
from packages.schemas.errors import VitalsOutlierFlag


class DoctorQueuePatient(BaseModel):
    session_id: str
    arrival_order: int
    synthesis_ready: bool
    fallback_active: bool
    urgency_flag: UrgencyFlag
    chief_complaint: str
    ready_since: str
    patient_name: str | None = None
    patient_age: int | None = None
    patient_location: str | None = None
    short_summary: str | None = None
    nurse_feedback: str | None = None
    intake_verified: bool | None = None


class DoctorQueueResponse(BaseModel):
    queue: list[DoctorQueuePatient]
    total_waiting: int


class ReviewOfSystems(BaseModel):
    cardiac: str | None = None
    respiratory: str | None = None
    gastrointestinal: str | None = None
    neurological: str | None = None
    musculoskeletal: str | None = None
    other: str | None = None


class StructuredContext(BaseModel):
    chief_complaint: str
    history_of_present_illness: str
    past_medical_history: list[str]
    current_medications: list[str]
    allergies: list[str]
    social_history: str | None = None
    review_of_systems: ReviewOfSystems | None = None


class VitalsSummary(BaseModel):
    temperature_celsius: float
    bp_systolic_mmhg: float
    bp_diastolic_mmhg: float
    heart_rate_bpm: float
    respiratory_rate_pm: float
    spo2_percent: float
    weight_kg: float
    height_cm: float


class DifferentialConsideration(BaseModel):
    consideration_id: str
    title: str
    supporting_features: list[str]
    clinical_reasoning: str
    urgency_flag: UrgencyFlag
    ai_generated: bool
    doctor_action: DoctorAction | None = None
    doctor_modification: str | None = None
    sort_order: int


class PatientContextResponse(BaseModel):
    session_id: str
    synthesis_ready: bool
    fallback_active: bool
    fallback_reason: str | None = None
    structured_context: StructuredContext | None = None
    vitals_summary: VitalsSummary | None = None
    outlier_flags: list[VitalsOutlierFlag]
    emergency_flagged: bool
    differentials: list[DifferentialConsideration]
    synthesis_timestamp: str | None = None
    intake_summary_preview: str | None = None
    nurse_feedback: str | None = None
    patient_name: str | None = None
    patient_age: int | None = None
    patient_location: str | None = None


class DifferentialActionRequest(BaseModel):
    session_id: str
    action: DoctorAction
    modification_text: str | None = Field(default=None, max_length=1000)


class DifferentialActionResponse(BaseModel):
    updated_at: str


class AddConsiderationRequest(BaseModel):
    session_id: str
    title: str = Field(min_length=1, max_length=100)
    clinical_reasoning: str = Field(min_length=1, max_length=1000)
    urgency_flag: UrgencyFlag


class AddConsiderationResponse(BaseModel):
    consideration_id: str
    created_at: str


class SaveReasoningDraftRequest(BaseModel):
    session_id: str
    assessment: str | None = Field(default=None, max_length=5000)
    plan: str | None = Field(default=None, max_length=5000)
    rationale: str | None = Field(default=None, max_length=5000)
    free_text: str | None = Field(default=None, max_length=2000)


class SaveReasoningDraftResponse(BaseModel):
    saved_at: str


class CommitRecordRequest(BaseModel):
    session_id: str
    tier3_consent_confirmed: bool
    final_assessment: str = Field(min_length=1, max_length=5000)
    final_plan: str = Field(min_length=1, max_length=5000)
    final_rationale: str = Field(min_length=1, max_length=5000)
    doctor_free_text: str | None = Field(default=None, max_length=2000)
    accepted_consideration_ids: list[str] = Field(default_factory=list)
    modified_consideration_ids: list[str] = Field(default_factory=list)
    rejected_consideration_ids: list[str] = Field(default_factory=list)
    added_consideration_ids: list[str] = Field(default_factory=list)


class CommitRecordResponse(BaseModel):
    record_id: str
    committed_at: str
    receipt_sent: bool


class FeedbackRequest(BaseModel):
    session_id: str
    overall_quality: int = Field(ge=1, le=5)
    differentials_useful: bool
    comment: str | None = Field(default=None, max_length=1000)


class FeedbackResponse(BaseModel):
    received: bool
