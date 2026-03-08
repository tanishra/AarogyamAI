import pytest
from httpx import AsyncClient

from tests.conftest import make_patient_token


@pytest.mark.asyncio
class TestPatientSessionFlow:

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
                "device_fingerprint": "test-device",
            },
        )

    async def test_start_session(self, client: AsyncClient):
        patient_id = "patient-session-001"
        await self._grant_consent(client, patient_id)

        resp = await client.post(
            "/api/v1/patient/session/start",
            headers={"Authorization": make_patient_token(patient_id)},
            json={"clinic_id": "clinic-001"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data
        assert "first_question" in data
        assert data["first_question"]["question_text"] != ""

    async def test_submit_answer(self, client: AsyncClient):
        patient_id = "patient-session-002"
        await self._grant_consent(client, patient_id)

        # Start session
        start_resp = await client.post(
            "/api/v1/patient/session/start",
            headers={"Authorization": make_patient_token(patient_id)},
            json={"clinic_id": "clinic-001"},
        )
        session_id = start_resp.json()["session_id"]

        # Submit answer
        resp = await client.post(
            "/api/v1/patient/session/answer",
            headers={"Authorization": make_patient_token(patient_id)},
            json={
                "session_id": session_id,
                "question_hash": "a" * 64,
                "answer_text": "I have chest pain for 2 days",
                "topic_tag": "chief_complaint",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["saved"] is True
        assert "next_question" in data

    async def test_complete_session(self, client: AsyncClient):
        patient_id = "patient-session-003"
        await self._grant_consent(client, patient_id)

        start_resp = await client.post(
            "/api/v1/patient/session/start",
            headers={"Authorization": make_patient_token(patient_id)},
            json={"clinic_id": "clinic-001"},
        )
        session_id = start_resp.json()["session_id"]

        resp = await client.post(
            "/api/v1/patient/session/complete",
            headers={"Authorization": make_patient_token(patient_id)},
            json={"session_id": session_id},
        )
        assert resp.status_code == 200
        assert resp.json()["questionnaire_complete"] is True

    async def test_my_data(self, client: AsyncClient):
        patient_id = "patient-session-004"
        await self._grant_consent(client, patient_id)

        resp = await client.get(
            "/api/v1/patient/portal/my-data",
            headers={"Authorization": make_patient_token(patient_id)},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "consent_records" in data
        assert "sessions" in data

    async def test_session_without_consent_blocked(self, client: AsyncClient):
        """Patient without consent cannot start session."""
        resp = await client.post(
            "/api/v1/patient/session/start",
            headers={"Authorization": make_patient_token("no-consent-patient")},
            json={"clinic_id": "clinic-001"},
        )
        assert resp.status_code == 403