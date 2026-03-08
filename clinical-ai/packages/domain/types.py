from typing import Annotated
from uuid import UUID

from pydantic import StringConstraints

# UUID as string — used in Pydantic schemas where UUID is passed as str
UUIDStr = str

# Phone in E.164 format — +919876543210
PhoneNumber = Annotated[
    str,
    StringConstraints(pattern=r"^\+[1-9]\d{7,14}$", strip_whitespace=True),
]

# SHA-256 hash — 64 hex chars
SHA256Hash = Annotated[
    str,
    StringConstraints(pattern=r"^[a-f0-9]{64}$"),
]

# Clinic ID — UUID string
ClinicID = str

# Session ID — UUID string
SessionID = str

# Patient ID — UUID string (internal token — never raw PII)
PatientID = str