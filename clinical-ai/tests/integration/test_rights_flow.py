import pytest
from httpx import AsyncClient

from tests.conftest import make_patient_token


@pytest.mark.asyncio
class TestRightsFlow:

    async def _grant_consent(self, client: AsyncClient, patient_id: str):
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
                "device_fingerprint": "device",
            },
        )

    async def test_grievance_submission(self, client: AsyncClient):
        patient_id = "patient-rights-001"
        await self._grant_consent(client, patient_id)

        resp = await client.post(
            "/api/v1/rights/grievance",
            headers={"Authorization": make_patient_token(patient_id)},
            json={
                "subject": "Data was used without consent",
                "description": "I believe my data was shared without my knowledge.",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "grievance_id" in data
        assert data["resolution_sla_days"] == 30

    async def test_erasure_request(self, client: AsyncClient):
        patient_id = "patient-rights-002"
        await self._grant_consent(client, patient_id)

        resp = await client.post(
            "/api/v1/rights/erasure-request",
            headers={"Authorization": make_patient_token(patient_id)},
            json={"reason": "I no longer wish to use this service"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "request_id" in data
        assert data["sla_days"] == 30

    async def test_correction_request(self, client: AsyncClient):
        patient_id = "patient-rights-003"
        await self._grant_consent(client, patient_id)

        resp = await client.post(
            "/api/v1/rights/correction",
            headers={"Authorization": make_patient_token(patient_id)},
            json={
                "field_to_correct": "age_band",
                "correction_description": "My age band is incorrect",
            },
        )
        assert resp.status_code == 200
        assert "request_id" in resp.json()

    async def test_portability_request(self, client: AsyncClient):
        patient_id = "patient-rights-004"
        await self._grant_consent(client, patient_id)

        resp = await client.post(
            "/api/v1/rights/portability",
            headers={"Authorization": make_patient_token(patient_id)},
            json={"format": "json"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "request_id" in data
        assert data["delivery_method"] == "sms"