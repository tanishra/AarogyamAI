import pytest
from httpx import AsyncClient

from packages.db.models.clinic_user import ClinicUser
from tests.conftest import TestSessionLocal


@pytest.mark.asyncio
class TestAuthFlow:
    async def _seed_nurse(
        self,
        nurse_id: str,
        email: str,
        display_name: str,
        clinic_id: str = "clinic-001",
    ) -> None:
        async with TestSessionLocal() as session:
            nurse = ClinicUser(
                id=nurse_id,
                clinic_id=clinic_id,
                email=email,
                display_name=display_name,
                role="nurse",
                cognito_user_id=f"cognito-{nurse_id}",
                mfa_enabled=False,
                is_active=True,
            )
            session.add(nurse)
            await session.commit()

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

    async def test_nurse_otp_login_success(
        self,
        client: AsyncClient,
    ):
        nurse_email = "nurse.otp@clinic.test"
        await self._seed_nurse("nurse-otp-001", nurse_email, "Nurse OTP")

        send = await client.post(
            "/api/v1/auth/nurse/send-otp",
            json={"email": nurse_email, "clinic_id": "clinic-001"},
        )
        assert send.status_code == 200
        send_data = send.json()
        assert send_data["otp_sent"] is True
        assert send_data["expires_in_seconds"] == 300
        assert send_data.get("dev_otp")

        verify = await client.post(
            "/api/v1/auth/nurse/verify-otp",
            json={
                "email": nurse_email,
                "clinic_id": "clinic-001",
                "otp": send_data["dev_otp"],
            },
        )
        assert verify.status_code == 200
        verify_data = verify.json()
        assert verify_data["access_token"].startswith("Bearer ")
        assert verify_data["user_id"] == "nurse-otp-001"
        assert verify_data["role"] == "nurse"
        assert verify_data["clinic_id"] == "clinic-001"
        assert verify_data["display_name"] == "Nurse OTP"

    async def test_nurse_otp_login_invalid_otp(
        self,
        client: AsyncClient,
    ):
        nurse_email = "nurse.invalidotp@clinic.test"
        await self._seed_nurse(
            "nurse-otp-002",
            nurse_email,
            "Nurse Invalid OTP",
        )

        send = await client.post(
            "/api/v1/auth/nurse/send-otp",
            json={"email": nurse_email, "clinic_id": "clinic-001"},
        )
        assert send.status_code == 200

        verify = await client.post(
            "/api/v1/auth/nurse/verify-otp",
            json={
                "email": nurse_email,
                "clinic_id": "clinic-001",
                "otp": "000000",
            },
        )
        assert verify.status_code == 401
        assert verify.json()["error"] == "INVALID_OTP"
