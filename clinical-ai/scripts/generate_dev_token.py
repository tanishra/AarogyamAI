"""
Generate dev JWT tokens for local testing.

Usage:
    uv run python scripts/generate_dev_token.py --role patient
    uv run python scripts/generate_dev_token.py --role nurse
    uv run python scripts/generate_dev_token.py --role doctor
"""
import argparse
from jose import jwt

CLINIC_ID = "clinic-demo-001"
PATIENT_ID = "patient-demo-001"
NURSE_ID = "nurse-demo-001"
DOCTOR_ID = "doctor-demo-001"
ADMIN_ID = "admin-demo-001"

PROFILES = {
    "patient": {
        "sub": PATIENT_ID,
        "custom:role": "patient",
        "custom:clinic_id": CLINIC_ID,
        "partial": False,
    },
    "nurse": {
        "sub": NURSE_ID,
        "custom:role": "nurse",
        "custom:clinic_id": CLINIC_ID,
        "partial": False,
    },
    "doctor": {
        "sub": DOCTOR_ID,
        "custom:role": "doctor",
        "custom:clinic_id": CLINIC_ID,
        "partial": False,
    },
    "admin": {
        "sub": ADMIN_ID,
        "custom:role": "admin",
        "custom:clinic_id": CLINIC_ID,
        "partial": False,
    },
}


def generate(role: str) -> str:
    payload = PROFILES.get(role)
    if not payload:
        raise ValueError(f"Unknown role: {role}")
    token = jwt.encode(payload, "dev-secret", algorithm="HS256")
    return f"Bearer {token}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", required=True, choices=list(PROFILES.keys()))
    args = parser.parse_args()

    token = generate(args.role)
    print(f"\nRole  : {args.role}")
    print(f"Token : {token}")
    print()
    print("Usage:")
    print(f'  curl -H "Authorization: {token}" http://localhost:8080/api/v1/...')