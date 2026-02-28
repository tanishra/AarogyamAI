import pytest
from httpx import AsyncClient

from tests.conftest import make_patient_token, make_staff_token


@pytest.mark.asyncio
class TestNurseFlow:

    async def _setup_session(
        self, client: AsyncClient, patient_id: str
    ) -> str:
        """Grant consent + start + complete questionnaire. Return session_id."""
        token = make_patient_token(patient_id)

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
                "device_fingerprint": "device",
            },
        )

        start = await client.post(
            "/api/v1/patient/session/start",
            headers={"Authorization": token},
            json={"clinic_id": "clinic-001"},
        )
        session_id = start.json()["session_id"]

        await client.post(
            "/api/v1/patient/session/complete",
            headers={"Authorization": token},
            json={"session_id": session_id},
        )
        return session_id

    async def test_nurse_queue(self, client: AsyncClient):
        nurse_token = make_staff_token(role="nurse")
        resp = await client.get(
            "/api/v1/nurse/queue",
            headers={"Authorization": nurse_token},
        )
        assert resp.status_code == 200
        assert "queue" in resp.json()

    async def test_submit_vitals_valid(self, client: AsyncClient):
        session_id = await self._setup_session(client, "patient-nurse-001")
        nurse_token = make_staff_token(role="nurse")

        resp = await client.post(
            "/api/v1/nurse/vitals/submit",
            headers={"Authorization": nurse_token},
            json={
                "session_id": session_id,
                "temperature_celsius": 37.0,
                "bp_systolic_mmhg": 120.0,
                "bp_diastolic_mmhg": 80.0,
                "heart_rate_bpm": 75.0,
                "respiratory_rate_pm": 16.0,
                "spo2_percent": 98.0,
                "weight_kg": 70.0,
                "height_cm": 170.0,
                "nurse_observation": "Patient appears calm",
                "outlier_confirmations": [],
            },
        )
        assert resp.status_code == 200
        assert "vitals_id" in resp.json()

    async def test_submit_vitals_outlier_requires_confirmation(
        self, client: AsyncClient
    ):
        session_id = await self._setup_session(client, "patient-nurse-002")
        nurse_token = make_staff_token(role="nurse")

        resp = await client.post(
            "/api/v1/nurse/vitals/submit",
            headers={"Authorization": nurse_token},
            json={
                "session_id": session_id,
                "temperature_celsius": 39.5,   # WARNING outlier
                "bp_systolic_mmhg": 120.0,
                "bp_diastolic_mmhg": 80.0,
                "heart_rate_bpm": 75.0,
                "respiratory_rate_pm": 16.0,
                "spo2_percent": 98.0,
                "weight_kg": 70.0,
                "height_cm": 170.0,
                "nurse_observation": "",
                "outlier_confirmations": [],
            },
        )
        assert resp.status_code == 422
        data = resp.json()
        assert data["error"] == "VITALS_OUTLIER_CONFIRMATION_REQUIRED"
        assert len(data["outlier_flags"]) > 0

    async def test_patient_summary(self, client: AsyncClient):
        session_id = await self._setup_session(client, "patient-nurse-003")
        nurse_token = make_staff_token(role="nurse")

        resp = await client.get(
            f"/api/v1/nurse/patient/{session_id}/summary",
            headers={"Authorization": nurse_token},
        )
        assert resp.status_code == 200
        assert resp.json()["session_id"] == session_id

    async def test_patient_rejects_nurse_role(self, client: AsyncClient):
        """Patient token cannot access nurse routes."""
        resp = await client.get(
            "/api/v1/nurse/queue",
            headers={"Authorization": make_patient_token()},
        )
        assert resp.status_code == 403