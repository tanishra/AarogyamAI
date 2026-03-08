import pytest
import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import make_patient_token


@pytest.mark.asyncio
class TestConsentFlow:

    async def test_version_check_no_consent(self, client: AsyncClient):
        """New patient — no consent — version check returns reconsent_required."""
        resp = await client.get(
            "/api/v1/consent/version-check",
            headers={"Authorization": make_patient_token("new-patient-001")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["reconsent_required"] is True
        assert data["patient_version"] == "none"

    async def test_grant_tier1_consent(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/consent/grant",
            headers={"Authorization": make_patient_token("patient-consent-001")},
            json={
                "consent_tier": 1,
                "consent_document_version": "1.1",
                "purposes_consented": [
                    "symptom_collection",
                    "ai_processing",
                    "clinical_record",
                    "nurse_access",
                ],
                "device_fingerprint": "test-device-001",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "active"
        assert "consent_id" in data

    async def test_grant_wrong_version_fails(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/consent/grant",
            headers={"Authorization": make_patient_token("patient-consent-002")},
            json={
                "consent_tier": 1,
                "consent_document_version": "0.9",  # old version
                "purposes_consented": [
                    "symptom_collection",
                    "ai_processing",
                    "clinical_record",
                    "nurse_access",
                ],
                "device_fingerprint": "test-device-002",
            },
        )
        assert resp.status_code == 400
        assert resp.json()["error"] == "VALIDATION_FAILED"

    async def test_grant_missing_purposes_fails(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/consent/grant",
            headers={"Authorization": make_patient_token("patient-consent-003")},
            json={
                "consent_tier": 1,
                "consent_document_version": "1.1",
                "purposes_consented": ["symptom_collection"],  # incomplete
                "device_fingerprint": "test-device-003",
            },
        )
        assert resp.status_code == 400

    async def test_withdraw_consent(self, client: AsyncClient):
        patient_id = "patient-withdraw-001"
        token = make_patient_token(patient_id)

        # Grant first
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
                "device_fingerprint": "test-device-004",
            },
        )

        # Withdraw
        resp = await client.post(
            "/api/v1/consent/withdraw",
            headers={"Authorization": token},
            json={
                "tiers_to_withdraw": [1],
                "reason": "No longer wish to use service",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["withdrawn_consent_ids"]) > 0

    async def test_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/consent/version-check")
        assert resp.status_code == 401