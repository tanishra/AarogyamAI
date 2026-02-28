from fastapi import APIRouter

from api.dependencies import (
    AuditDep,
    ConsentCacheDep,
    ConsentValidatorDep,
    CurrentPatient,
    DBSession,
)
from api.services.consent_service import ConsentService
from api.config import get_settings
from packages.schemas.consent import (
    ConsentVersionCheckResponse,
    GrantConsentRequest,
    GrantConsentResponse,
    WithdrawConsentRequest,
    WithdrawConsentResponse,
)

router = APIRouter(tags=["consent"])


def _svc(session, audit, cache, validator) -> ConsentService:
    return ConsentService(
        session=session,
        audit=audit,
        cache=cache,
        validator=validator,
        current_version=get_settings().current_consent_version,
    )


@router.get(
    "/consent/version-check",
    response_model=ConsentVersionCheckResponse,
)
async def version_check(
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
    cache: ConsentCacheDep,
    validator: ConsentValidatorDep,
):
    return await _svc(session, audit, cache, validator).check_version(
        patient_id=token.sub
    )


@router.post("/consent/grant", response_model=GrantConsentResponse)
async def grant_consent(
    body: GrantConsentRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
    cache: ConsentCacheDep,
    validator: ConsentValidatorDep,
):
    return await _svc(session, audit, cache, validator).grant(
        patient_id=token.sub, request=body
    )


@router.post("/consent/withdraw", response_model=WithdrawConsentResponse)
async def withdraw_consent(
    body: WithdrawConsentRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
    cache: ConsentCacheDep,
    validator: ConsentValidatorDep,
):
    return await _svc(session, audit, cache, validator).withdraw(
        patient_id=token.sub, request=body
    )