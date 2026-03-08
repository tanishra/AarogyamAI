from typing import Any
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str
    error_id: str
    timestamp: str
    detail: dict[str, Any] | None = None


class ValidationErrorResponse(ErrorResponse):
    fields: list[str]


class ConsentErrorResponse(ErrorResponse):
    tier: int | None = None
    reconsent_required: bool = False


class RateLimitErrorResponse(ErrorResponse):
    retry_after: int  # seconds


class VitalsOutlierFlag(BaseModel):
    field: str
    value: float
    threshold: str
    severity: str  # "warning" | "critical"


class VitalsOutlierErrorResponse(ErrorResponse):
    outlier_flags: list[VitalsOutlierFlag]