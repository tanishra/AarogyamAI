from fastapi import APIRouter

from api.dependencies import AuditDep, CurrentDoctor, DBSession
from api.services.doctor_service import DoctorService
from packages.schemas.doctor import (
    AddConsiderationRequest,
    AddConsiderationResponse,
    CommitRecordRequest,
    CommitRecordResponse,
    DifferentialActionRequest,
    DifferentialActionResponse,
    DoctorQueueResponse,
    FeedbackRequest,
    FeedbackResponse,
    PatientContextResponse,
    SaveReasoningDraftRequest,
    SaveReasoningDraftResponse,
)

router = APIRouter(tags=["doctor"])


def _svc(session, audit) -> DoctorService:
    return DoctorService(session=session, audit=audit)


@router.get("/doctor/queue", response_model=DoctorQueueResponse)
async def get_queue(
    token: CurrentDoctor,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).get_queue(clinic_id=token.clinic_id)


@router.get(
    "/doctor/patient/{session_id}/context",
    response_model=PatientContextResponse,
)
async def get_patient_context(
    session_id: str,
    token: CurrentDoctor,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).get_patient_context(
        session_id=session_id, doctor_id=token.sub
    )


@router.patch(
    "/doctor/differential/{consideration_id}/action",
    response_model=DifferentialActionResponse,
)
async def differential_action(
    consideration_id: str,
    body: DifferentialActionRequest,
    token: CurrentDoctor,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).differential_action(
        consideration_id=consideration_id,
        doctor_id=token.sub,
        request=body,
    )


@router.post(
    "/doctor/differential/add",
    response_model=AddConsiderationResponse,
)
async def add_consideration(
    body: AddConsiderationRequest,
    token: CurrentDoctor,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).add_consideration(
        doctor_id=token.sub, request=body
    )


@router.patch(
    "/doctor/reasoning/draft",
    response_model=SaveReasoningDraftResponse,
)
async def save_reasoning_draft(
    body: SaveReasoningDraftRequest,
    token: CurrentDoctor,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).save_reasoning_draft(
        doctor_id=token.sub, request=body
    )


@router.post("/doctor/record/commit", response_model=CommitRecordResponse)
async def commit_record(
    body: CommitRecordRequest,
    token: CurrentDoctor,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).commit_record(
        doctor_id=token.sub, request=body
    )


@router.post("/doctor/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    body: FeedbackRequest,
    token: CurrentDoctor,
    session: DBSession,
    audit: AuditDep,
):
    return await _svc(session, audit).submit_feedback(
        doctor_id=token.sub, request=body
    )