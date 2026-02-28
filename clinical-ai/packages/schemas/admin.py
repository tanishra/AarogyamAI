from pydantic import BaseModel, Field
from packages.domain.enums import Role


# ── Admin ─────────────────────────────────────────────────────────────────────

class UserSummary(BaseModel):
    user_id: str
    display_name: str
    role: Role
    mfa_enabled: bool
    is_active: bool
    last_login_at: str | None = None


class ListUsersResponse(BaseModel):
    users: list[UserSummary]
    total: int


class CreateUserRequest(BaseModel):
    email: str = Field(max_length=254)
    role: Role
    display_name: str = Field(min_length=1, max_length=100)


class CreateUserResponse(BaseModel):
    user_id: str
    temp_password_sent: bool


class UpdateUserRequest(BaseModel):
    is_active: bool | None = None
    role: Role | None = None


class UpdateUserResponse(BaseModel):
    updated_at: str


class MetricsPeriod(BaseModel):
    from_date: str
    to_date: str


class MetricsResponse(BaseModel):
    period: MetricsPeriod
    total_sessions: int
    sessions_with_ai: int
    sessions_fallback: int
    records_committed: int
    ai_feedback_avg_rating: float | None = None
    consent_withdrawals: int


# ── DPO ───────────────────────────────────────────────────────────────────────

class ConsentEvent(BaseModel):
    event_type: str
    tier: int
    timestamp: str
    clinic_id: str


class ConsentSummary(BaseModel):
    granted: int
    withdrawn: int
    version_mismatches: int


class ConsentReportResponse(BaseModel):
    events: list[ConsentEvent]
    summary: ConsentSummary


class GrievanceSummary(BaseModel):
    grievance_id: str
    subject: str
    status: str
    submitted_at: str
    sla_deadline: str


class GrievanceListResponse(BaseModel):
    grievances: list[GrievanceSummary]


class RespondGrievanceRequest(BaseModel):
    status: str = Field(pattern="^(pending|in_progress|resolved)$")
    response: str = Field(min_length=1, max_length=2000)


class RespondGrievanceResponse(BaseModel):
    updated_at: str


class ConsentEventSummary(BaseModel):
    event_type: str
    tier: int
    timestamp: str
    clinic_id: str
    patient_ref: str | None = None


class GrievanceItem(BaseModel):
    grievance_id: str
    subject: str
    status: str
    submitted_at: str
    sla_deadline: str
    response: str | None = None


class UserItem(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: Role
    mfa_enabled: bool
    is_active: bool
    last_login_at: str | None = None