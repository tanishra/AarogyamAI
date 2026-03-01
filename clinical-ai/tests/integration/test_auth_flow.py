import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestAuthFlow:
    async def test_patient_otp_login_success(self, client: AsyncClient):
        phone = "+919876543210"

        send = await client.post(
            "/api/v1/auth/patient/send-otp",
            json={"phone": phone},
        )
        assert send.status_code == 200
        send_data = send.json()
        assert send_data["otp_sent"] is True
        assert send_data["expires_in_seconds"] == 300
        assert send_data.get("dev_otp")

        verify = await client.post(
            "/api/v1/auth/patient/verify-otp",
            json={
                "phone": phone,
                "otp": send_data["dev_otp"],
                "clinic_id": "clinic-001",
            },
        )
        assert verify.status_code == 200
        verify_data = verify.json()
        assert verify_data["access_token"].startswith("Bearer ")
        assert verify_data["patient_id"]
        assert "consent_status" in verify_data

        # Token should authenticate a patient route.
        version_check = await client.get(
            "/api/v1/consent/version-check",
            headers={"Authorization": verify_data["access_token"]},
        )
        assert version_check.status_code == 200

    async def test_patient_otp_login_invalid_otp(self, client: AsyncClient):
        phone = "+919876543211"

        send = await client.post(
            "/api/v1/auth/patient/send-otp",
            json={"phone": phone},
        )
        assert send.status_code == 200

        verify = await client.post(
            "/api/v1/auth/patient/verify-otp",
            json={
                "phone": phone,
                "otp": "000000",
                "clinic_id": "clinic-001",
            },
        )
        assert verify.status_code == 401
        assert verify.json()["error"] == "INVALID_OTP"

