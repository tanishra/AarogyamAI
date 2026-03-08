from fastapi import APIRouter, Depends

from api.dependencies import AuditDep, DBSession, require_role
from api.services.admin_service import AdminService
from packages.domain.enums import Role
from packages.schemas.admin import (
    ConsentReportResponse,
    CreateUserRequest,
    CreateUserResponse,
    GrievanceListResponse,
    ListUsersResponse,
    MetricsResponse,
    RespondGrievanceRequest,
    RespondGrievanceResponse,
    UpdateUserRequest,
    UpdateUserResponse,
)

router = APIRouter(tags=["admin"])

_admin = Depends(require_role(Role.ADMIN))
_dpo = Depends(require_role(Role.DPO, Role.ADMIN))


def _svc(session, audit) -> AdminService:
    return AdminService(session=session, audit=audit)


@router.get("/admin/users", response_model=ListUsersResponse)
async def list_users(
    session: DBSession,
    audit: AuditDep,
    token=_admin,
):
    return await _svc(session, audit).list_users(
        admin_id=token.sub,
        clinic_id=token.clinic_id,
    )


@router.post("/admin/users", response_model=CreateUserResponse)
async def create_user(
    body: CreateUserRequest,
    session: DBSession,
    audit: AuditDep,
    token=_admin,
):
    return await _svc(session, audit).create_user(
        admin_id=token.sub,
        clinic_id=token.clinic_id,
        request=body,
    )


@router.patch("/admin/users/{user_id}", response_model=UpdateUserResponse)
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    session: DBSession,
    audit: AuditDep,
    token=_admin,
):
    return await _svc(session, audit).update_user(
        admin_id=token.sub,
        clinic_id=token.clinic_id,
        user_id=user_id,
        request=body,
    )


@router.get("/admin/metrics", response_model=MetricsResponse)
async def get_metrics(
    session: DBSession,
    audit: AuditDep,
    token=_admin,
):
    return await _svc(session, audit).get_metrics(
        admin_id=token.sub,
        clinic_id=token.clinic_id,
    )


@router.get("/dpo/consent-reports", response_model=ConsentReportResponse)
async def consent_reports(
    session: DBSession,
    audit: AuditDep,
    token=_dpo,
):
    return await _svc(session, audit).get_consent_report(
        actor_id=token.sub,
        clinic_id=token.clinic_id,
    )


@router.get("/dpo/grievances", response_model=GrievanceListResponse)
async def list_grievances(
    session: DBSession,
    audit: AuditDep,
    token=_dpo,
):
    return await _svc(session, audit).list_grievances(
        actor_id=token.sub,
        clinic_id=token.clinic_id,
    )


@router.patch(
    "/dpo/grievances/{grievance_id}",
    response_model=RespondGrievanceResponse,
)
async def respond_grievance(
    grievance_id: str,
    body: RespondGrievanceRequest,
    session: DBSession,
    audit: AuditDep,
    token=_dpo,
):
    return await _svc(session, audit).respond_grievance(
        actor_id=token.sub,
        grievance_id=grievance_id,
        request=body,
    )