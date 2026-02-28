from fastapi import APIRouter

from api.dependencies import AuditDep, CurrentNurse, DBSession, SQSDep
from api.services.nurse_service import NurseService
from packages.schemas.nurse import (
    MarkReadyRequest,
    MarkReadyResponse,
    NurseQueueResponse,
    PatientSummaryResponse,
    SubmitVitalsRequest,
    SubmitVitalsResponse,
)

router = APIRouter(tags=["nurse"])


def _svc(session, audit, sqs) -> NurseService:
    return NurseService(session=session, audit=audit, sqs=sqs)


@router.get("/nurse/queue", response_model=NurseQueueResponse)
async def get_queue(
    token: CurrentNurse,
    session: DBSession,
    audit: AuditDep,
    sqs: SQSDep,
):
    return await _svc(session, audit, sqs).get_queue(
        clinic_id=token.clinic_id
    )


@router.get(
    "/nurse/patient/{session_id}/summary",
    response_model=PatientSummaryResponse,
)
async def get_patient_summary(
    session_id: str,
    token: CurrentNurse,
    session: DBSession,
    audit: AuditDep,
    sqs: SQSDep,
):
    return await _svc(session, audit, sqs).get_patient_summary(session_id)


@router.post("/nurse/vitals/submit", response_model=SubmitVitalsResponse)
async def submit_vitals(
    body: SubmitVitalsRequest,
    token: CurrentNurse,
    session: DBSession,
    audit: AuditDep,
    sqs: SQSDep,
):
    return await _svc(session, audit, sqs).submit_vitals(
        nurse_id=token.sub, request=body
    )


@router.post("/nurse/session/mark-ready", response_model=MarkReadyResponse)
async def mark_ready(
    body: MarkReadyRequest,
    token: CurrentNurse,
    session: DBSession,
    audit: AuditDep,
    sqs: SQSDep,
):
    return await _svc(session, audit, sqs).mark_ready(
        nurse_id=token.sub, request=body
    )