from pydantic import BaseModel, Field
from packages.schemas.errors import VitalsOutlierFlag


class QueuePatient(BaseModel):
    session_id: str
    arrival_order: int
    questionnaire_complete: bool
    vitals_submitted: bool
    waiting_since: str
    emergency_flagged: bool


class NurseQueueResponse(BaseModel):
    queue: list[QueuePatient]
    total_waiting: int


class PatientSummaryResponse(BaseModel):
    session_id: str
    chief_complaint: str
    emergency_flagged: bool
    vitals_submitted: bool


class OutlierConfirmation(BaseModel):
    field: str
    confirmed: bool


class SubmitVitalsRequest(BaseModel):
    session_id: str
    temperature_celsius: float = Field(ge=30.0, le=45.0)
    bp_systolic_mmhg: float = Field(ge=60.0, le=300.0)
    bp_diastolic_mmhg: float = Field(ge=30.0, le=200.0)
    heart_rate_bpm: float = Field(ge=20.0, le=250.0)
    respiratory_rate_pm: float = Field(ge=4.0, le=60.0)
    spo2_percent: float = Field(ge=60.0, le=100.0)
    weight_kg: float = Field(ge=10.0, le=300.0)
    height_cm: float = Field(ge=50.0, le=250.0)
    nurse_observation: str | None = Field(default=None, max_length=500)
    outlier_confirmations: list[OutlierConfirmation] = Field(default_factory=list)


class SubmitVitalsResponse(BaseModel):
    vitals_id: str
    outlier_flags: list[VitalsOutlierFlag]
    saved_at: str


class MarkReadyRequest(BaseModel):
    session_id: str


class MarkReadyResponse(BaseModel):
    synthesis_queued: bool
    estimated_ready_seconds: int