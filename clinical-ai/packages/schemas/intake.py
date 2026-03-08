from pydantic import BaseModel, Field


class DeviceInfo(BaseModel):
    platform: str | None = Field(default=None, max_length=40)
    app_version: str | None = Field(default=None, max_length=40)


class IntakeSessionInitRequest(BaseModel):
    session_id: str
    preferred_mode: str = Field(default="text_llm")
    locale: str = Field(default="en-IN", max_length=20)
    device_info: DeviceInfo | None = None


class IntakeSessionInitResponse(BaseModel):
    session_id: str
    active_mode: str
    fallback_chain: list[str]
    ws_url: str
    voice_token: str | None = None
    expires_at: str


class IntakeModeSwitchRequest(BaseModel):
    session_id: str
    target_mode: str
    reason: str = Field(default="manual_switch", max_length=80)


class IntakeModeSwitchResponse(BaseModel):
    session_id: str
    active_mode: str
    previous_mode: str
    fallback_reason: str


class FallbackTransition(BaseModel):
    from_mode: str
    to_mode: str
    reason: str
    at: str


class IntakeStateResponse(BaseModel):
    session_id: str
    active_mode: str
    questionnaire_done: bool
    questions_remaining: int
    emergency_flagged: bool
    nurse_verification_required: bool
    fallback_history: list[FallbackTransition]


class IntakeFinalizeResponse(BaseModel):
    session_id: str
    questionnaire_complete: bool
    intake_summary_preview: str
    nurse_verification_required: bool
