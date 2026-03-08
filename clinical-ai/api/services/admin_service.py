from datetime import datetime, timezone
from uuid import uuid4

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditEntryBuilder, AuditService
from packages.db.models.clinic_user import ClinicUser
from packages.db.models.consent import ConsentLedger, ConsentToken
from packages.db.models.session import PatientSession
from packages.db.models.medical_record import MedicalRecord
from packages.domain.enums import (
    ActorRole,
    AuditEventType,
    ConsentStatus,
    OutcomeStatus,
    Role,
)
from packages.schemas.admin import (
    ConsentReportResponse,
    ConsentSummary,
    ConsentEventSummary,
    CreateUserRequest,
    CreateUserResponse,
    GrievanceItem,
    GrievanceListResponse,
    ListUsersResponse,
    MetricsPeriod,
    MetricsResponse,
    RespondGrievanceRequest,
    RespondGrievanceResponse,
    UpdateUserRequest,
    UpdateUserResponse,
    UserItem,
)

logger = structlog.get_logger(__name__)


class AdminService:

    def __init__(
        self,
        session: AsyncSession,
        audit: AuditService,
    ) -> None:
        self._session = session
        self._audit = audit

    # ── Users ─────────────────────────────────────────────────────────────────

    async def list_users(
        self,
        admin_id: str,
        clinic_id: str,
    ) -> ListUsersResponse:
        stmt = (
            select(ClinicUser)
            .where(ClinicUser.clinic_id == clinic_id)
            .where(ClinicUser.is_active == True)
            .order_by(ClinicUser.created_at.desc())
        )
        result = await self._session.execute(stmt)
        users = result.scalars().all()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.ADMIN_USER_LISTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.ADMIN, actor_id=admin_id)
            .clinic(clinic_id)
            .build(),
        )

        return ListUsersResponse(
            users=[
                UserItem(
                    user_id=u.id,
                    display_name=u.display_name,
                    role=Role(u.role),
                    email_masked=self._mask_email(u.email),
                    is_active=u.is_active,
                    mfa_enabled=u.mfa_enabled,
                    created_at=u.created_at.isoformat(),
                )
                for u in users
            ],
            total=len(users),
        )

    async def create_user(
        self,
        admin_id: str,
        clinic_id: str,
        request: CreateUserRequest,
    ) -> CreateUserResponse:
        user_id = str(uuid4())

        user = ClinicUser(
            id=user_id,
            clinic_id=clinic_id,
            display_name=request.display_name,
            role=request.role.value,
            email=request.email,
            cognito_user_id=str(uuid4()),  # replaced by real Cognito user in prod
            is_active=True,
            mfa_enabled=False,
        )
        self._session.add(user)
        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.ADMIN_USER_CREATED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.ADMIN, actor_id=admin_id)
            .clinic(clinic_id)
            .metadata({
                "new_user_id": user_id,
                "role": request.role.value,
            })
            .build(),
        )

        # In production — trigger Cognito AdminCreateUser + temp password email
        return CreateUserResponse(
            user_id=user_id,
            temp_password_sent=True,
        )

    async def update_user(
        self,
        admin_id: str,
        clinic_id: str,
        user_id: str,
        request: UpdateUserRequest,
    ) -> UpdateUserResponse:
        stmt = select(ClinicUser).where(
            ClinicUser.id == user_id,
            ClinicUser.clinic_id == clinic_id,
        )
        result = await self._session.execute(stmt)
        user = result.scalar_one_or_none()

        if user is None:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "USER_NOT_FOUND", "error_id": str(uuid4())},
            )

        if request.display_name is not None:
            user.display_name = request.display_name
        if request.is_active is not None:
            user.is_active = request.is_active
        if request.role is not None:
            user.role = request.role.value

        await self._session.flush()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.ADMIN_USER_UPDATED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.ADMIN, actor_id=admin_id)
            .clinic(clinic_id)
            .metadata({"target_user_id": user_id})
            .build(),
        )

        return UpdateUserResponse(
            updated_at=datetime.now(timezone.utc).isoformat()
        )

    # ── Metrics ───────────────────────────────────────────────────────────────

    async def get_metrics(
        self,
        admin_id: str,
        clinic_id: str,
    ) -> MetricsResponse:
        from packages.domain.enums import SessionStatus

        now = datetime.now(timezone.utc)

        # Total sessions
        total_stmt = select(func.count()).select_from(PatientSession).where(
            PatientSession.clinic_id == clinic_id
        )
        total = (await self._session.execute(total_stmt)).scalar() or 0

        # Sessions with AI synthesis
        ai_stmt = select(func.count()).select_from(PatientSession).where(
            PatientSession.clinic_id == clinic_id,
            PatientSession.status == SessionStatus.SYNTHESIS_COMPLETE.value,
        )
        ai_total = (await self._session.execute(ai_stmt)).scalar() or 0

        # Fallback sessions
        fallback_stmt = select(func.count()).select_from(PatientSession).where(
            PatientSession.clinic_id == clinic_id,
            PatientSession.synthesis_fallback_active == True,
        )
        fallback_total = (await self._session.execute(fallback_stmt)).scalar() or 0

        # Committed records
        records_stmt = select(func.count()).select_from(MedicalRecord).where(
            MedicalRecord.clinic_id == clinic_id
        )
        records_total = (await self._session.execute(records_stmt)).scalar() or 0

        # Consent withdrawals
        withdrawal_stmt = select(func.count()).select_from(ConsentLedger).where(
            ConsentLedger.event_type == "withdrawn"
        )
        withdrawals = (await self._session.execute(withdrawal_stmt)).scalar() or 0

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.ADMIN_METRICS_VIEWED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.ADMIN, actor_id=admin_id)
            .clinic(clinic_id)
            .build(),
        )

        return MetricsResponse(
            period=MetricsPeriod(
                from_date=now.isoformat(),
                to_date=now.isoformat(),
            ),
            total_sessions=total,
            sessions_with_ai=ai_total,
            sessions_fallback=fallback_total,
            records_committed=records_total,
            consent_withdrawals=withdrawals,
        )

    # ── DPO — Consent Reports ─────────────────────────────────────────────────

    async def get_consent_report(
        self,
        actor_id: str,
        clinic_id: str,
    ) -> ConsentReportResponse:
        stmt = (
            select(ConsentLedger)
            .order_by(ConsentLedger.occurred_at.desc())
            .limit(500)
        )
        result = await self._session.execute(stmt)
        events = result.scalars().all()

        # Count granted vs withdrawn
        granted = sum(1 for e in events if e.event_type == "granted")
        withdrawn = sum(1 for e in events if e.event_type == "withdrawn")

        # Version mismatches — active tokens where version != current
        from api.config import get_settings
        current_version = get_settings().current_consent_version

        mismatch_stmt = select(func.count()).select_from(ConsentToken).where(
            ConsentToken.status == ConsentStatus.ACTIVE.value,
            ConsentToken.consent_document_version != current_version,
        )
        mismatches = (
            await self._session.execute(mismatch_stmt)
        ).scalar() or 0

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.DPO_CONSENT_REPORT_VIEWED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.DPO, actor_id=actor_id)
            .clinic(clinic_id)
            .build(),
        )

        return ConsentReportResponse(
            events=[
                ConsentEventSummary(
                    event_id=e.id,
                    event_type=e.event_type,
                    tier=e.tier,
                    occurred_at=e.occurred_at.isoformat(),
                    patient_id_hash=e.patient_id[:8] + "***",  # partial only
                )
                for e in events
            ],
            summary=ConsentSummary(
                granted=granted,
                withdrawn=withdrawn,
                version_mismatches=mismatches,
            ),
        )

    # ── DPO — Grievances ──────────────────────────────────────────────────────

    async def list_grievances(
        self,
        actor_id: str,
        clinic_id: str,
    ) -> GrievanceListResponse:
        """
        Grievances are stored in audit log with event type RIGHTS_GRIEVANCE_SUBMITTED.
        DPO views them here.
        """
        from packages.db.models.audit import AuditLogEntry

        stmt = (
            select(AuditLogEntry)
            .where(
                AuditLogEntry.event_type
                == AuditEventType.RIGHTS_GRIEVANCE_SUBMITTED.value
            )
            .order_by(AuditLogEntry.occurred_at.desc())
            .limit(100)
        )
        result = await self._session.execute(stmt)
        entries = result.scalars().all()

        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.DPO_GRIEVANCE_LIST_VIEWED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.DPO, actor_id=actor_id)
            .clinic(clinic_id)
            .build(),
        )

        return GrievanceListResponse(
            grievances=[
                GrievanceItem(
                    grievance_id=e.id,
                    patient_id_hash=e.patient_id[:8] + "***"
                    if e.patient_id else "unknown",
                    subject=e.event_metadata.get("subject", "")
                    if e.event_metadata else "",
                    submitted_at=e.occurred_at.isoformat(),
                    status="open",
                    response=None,
                )
                for e in entries
            ]
        )

    async def respond_grievance(
        self,
        actor_id: str,
        grievance_id: str,
        request: RespondGrievanceRequest,
    ) -> RespondGrievanceResponse:
        await self._audit.record(
            self._session,
            AuditEntryBuilder()
            .event(AuditEventType.DPO_GRIEVANCE_RESPONDED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.DPO, actor_id=actor_id)
            .metadata({
                "grievance_id": grievance_id,
                "resolution": request.resolution,
            })
            .build(),
        )

        return RespondGrievanceResponse(
            updated_at=datetime.now(timezone.utc).isoformat()
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _mask_email(email: str) -> str:
        if "@" not in email:
            return "***"
        local, domain = email.split("@", 1)
        return local[:2] + "***@" + domain