from fastapi import APIRouter

from api.dependencies import AuditDep, CurrentPatient, DBSession
from api.services.patient_service import PatientService
from api.services.rights_service import RightsService
from packages.schemas.patient import (
    CompleteSessionRequest,
    CompleteSessionResponse,
    CorrectionRequest,
    CorrectionResponse,
    ErasureRequest,
    ErasureResponse,
    GrievanceRequest,
    GrievanceResponse,
    MyDataResponse,
    PortabilityRequest,
    PortabilityResponse,
    StartSessionRequest,
    StartSessionResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
)

router = APIRouter(tags=["patient"])


def _svc(session, audit) -> PatientService:
    return PatientService(session=session, audit=audit)


def _rights(session, audit) -> RightsService:
    return RightsService(session=session, audit=audit)


@router.post("/patient/session/start", response_model=StartSessionResponse)
async def start_session(
    body: StartSessionRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).start_session(
        patient_id=token.sub, request=body
    )


@router.post("/patient/session/answer", response_model=SubmitAnswerResponse)
async def submit_answer(
    body: SubmitAnswerRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).submit_answer(
        patient_id=token.sub, request=body
    )


@router.post("/patient/session/complete", response_model=CompleteSessionResponse)
async def complete_session(
    body: CompleteSessionRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).complete_session(
        patient_id=token.sub, request=body
    )


@router.get("/patient/portal/my-data", response_model=MyDataResponse)
async def get_my_data(
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).get_my_data(patient_id=token.sub)


@router.post("/rights/grievance", response_model=GrievanceResponse)
async def submit_grievance(
    body: GrievanceRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).submit_grievance(
        patient_id=token.sub, request=body
    )


@router.post("/rights/erasure-request", response_model=ErasureResponse)
async def erasure_request(
    body: ErasureRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
):
    return await _rights(session, audit).request_erasure(
        patient_id=token.sub, request=body
    )


@router.post("/rights/correction", response_model=CorrectionResponse)
async def correction_request(
    body: CorrectionRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
):
    return await _rights(session, audit).request_correction(
        patient_id=token.sub, request=body
    )


@router.post("/rights/portability", response_model=PortabilityResponse)
async def portability_request(
    body: PortabilityRequest,
    token: CurrentPatient,
    session: DBSession,
    audit: AuditDep,
):
    return await _rights(session, audit).request_portability(
        patient_id=token.sub, request=body
    )