import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from packages.db.models.audit import AuditLogEntry
from packages.audit.audit_service import get_audit_service
from tests.conftest import make_patient_token


@pytest.mark.asyncio
class TestAuditChain:

    async def test_audit_entries_created_on_consent(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        patient_id = "patient-audit-001"

        await client.post(
            "/api/v1/consent/grant",
            headers={"Authorization": make_patient_token(patient_id)},
            json={
                "consent_tier": 1,
                "consent_document_version": "1.1",
                "purposes_consented": [
                    "symptom_collection",
                    "ai_processing",
                    "clinical_record",
                    "nurse_access",
                ],
                "device_fingerprint": "device-audit",
            },
        )

        stmt = (
            select(AuditLogEntry)
            .where(AuditLogEntry.patient_id == patient_id)
            .order_by(AuditLogEntry.sequence_number.asc())
        )
        result = await db_session.execute(stmt)
        entries = result.scalars().all()

        assert len(entries) >= 1
        assert entries[0].event_type == "consent_granted"

    async def test_audit_chain_integrity(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Verify hash chain is valid after multiple operations."""
        patient_id = "patient-audit-002"
        token = make_patient_token(patient_id)

        # Generate multiple audit entries
        await client.post(
            "/api/v1/consent/grant",
            headers={"Authorization": token},
            json={
                "consent_tier": 1,
                "consent_document_version": "1.1",
                "purposes_consented": [
                    "symptom_collection",
                    "ai_processing",
                    "clinical_record",
                    "nurse_access",
                ],
                "device_fingerprint": "device-chain",
            },
        )
        await client.post(
            "/api/v1/patient/session/start",
            headers={"Authorization": token},
            json={"clinic_id": "clinic-001"},
        )

        # Verify chain
        audit = get_audit_service()
        verification = await audit.verify_chain(db_session)

        assert verification.valid is True
        assert verification.entries_checked >= 1
        assert verification.first_break is None

    async def test_audit_entries_have_no_phi(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Audit entries must never contain raw PII."""
        patient_id = "patient-audit-003"

        await client.post(
            "/api/v1/consent/grant",
            headers={"Authorization": make_patient_token(patient_id)},
            json={
                "consent_tier": 1,
                "consent_document_version": "1.1",
                "purposes_consented": [
                    "symptom_collection",
                    "ai_processing",
                    "clinical_record",
                    "nurse_access",
                ],
                "device_fingerprint": "device-phi",
            },
        )

        stmt = select(AuditLogEntry).where(
            AuditLogEntry.patient_id == patient_id
        )
        result = await db_session.execute(stmt)
        entries = result.scalars().all()

        for entry in entries:
            meta = entry.event_metadata or {}
            # Must never contain these raw fields
            assert "phone" not in str(meta)
            assert "name" not in str(meta)
            assert "address" not in str(meta)