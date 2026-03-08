from pydantic import BaseModel, Field
from packages.domain.enums import ConsentTier, ConsentPurpose, ConsentStatus


class GrantConsentRequest(BaseModel):
    consent_tier: ConsentTier
    purposes_consented: list[ConsentPurpose] = Field(min_length=1)
    consent_document_version: str = Field(max_length=20)
    device_fingerprint: str = Field(max_length=512)


class GrantConsentResponse(BaseModel):
    consent_id: str
    status: ConsentStatus
    expires_at: str | None = None


class WithdrawConsentRequest(BaseModel):
    tiers_to_withdraw: list[ConsentTier] = Field(min_length=1)
    reason: str | None = Field(default=None, max_length=500)


class WithdrawConsentResponse(BaseModel):
    withdrawn_consent_ids: list[str]
    processing_halted_at: str


class ConsentVersionCheckResponse(BaseModel):
    version_match: bool
    patient_version: str
    current_version: str
    reconsent_required: bool