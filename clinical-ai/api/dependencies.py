from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from packages.audit.audit_service import AuditService, get_audit_service
from packages.cache.redis_client import ConsentCache, get_redis
from packages.db.client import get_session_dependency
from packages.domain.enums import Role
from packages.queue.sqs_client import SQSClient, get_sqs
from packages.validators.consent_validator import ConsentValidator

logger = structlog.get_logger(__name__)

# ── Auth scheme ───────────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=True)


# ── DB session ────────────────────────────────────────────────────────────────

async def get_db(
    session: AsyncSession = Depends(get_session_dependency),
) -> AsyncSession:
    return session


# ── Verified token payload ────────────────────────────────────────────────────

class TokenPayload:
    """Decoded and verified JWT claims."""

    def __init__(
        self,
        sub: str,
        role: Role,
        clinic_id: str,
        is_partial: bool = False,
    ) -> None:
        self.sub = sub
        self.role = role
        self.clinic_id = clinic_id
        self.is_partial = is_partial  # True for staff after login, before MFA


async def get_current_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> TokenPayload:
    """
    Decode and verify JWT.
    In dev with DEV_SKIP_COGNITO_VERIFY=true — decode without verification.
    In all other envs — verify against Cognito JWKS.
    """
    from api.config import get_settings

    settings = get_settings()
    token = credentials.credentials

    try:
        if settings.dev_skip_cognito_verify:
            payload = _decode_unverified(token)
        else:
            payload = await _verify_cognito_token(token, settings)

        return payload

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Token verification failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "AUTHENTICATION_REQUIRED", "error_id": _new_id()},
        )


def _decode_unverified(token: str) -> TokenPayload:
    """Dev only — decode JWT without signature verification."""
    from jose import jwt as jose_jwt

    claims = jose_jwt.get_unverified_claims(token)
    return TokenPayload(
        sub=claims.get("sub", "dev-user"),
        role=Role(claims.get("custom:role", "doctor")),
        clinic_id=claims.get("custom:clinic_id", "dev-clinic"),
        is_partial=claims.get("partial", False),
    )


async def _verify_cognito_token(token: str, settings) -> TokenPayload:
    """
    Verify JWT against Cognito JWKS endpoint.
    Tries patient pool first, then staff pool.
    """
    import httpx
    from jose import jwt as jose_jwt, JWTError

    for pool_id, client_id in [
        (settings.cognito_patient_pool_id, settings.cognito_patient_client_id),
        (settings.cognito_staff_pool_id, settings.cognito_staff_client_id),
    ]:
        if not pool_id:
            continue
        try:
            jwks_url = (
                f"https://cognito-idp.{settings.cognito_region}"
                f".amazonaws.com/{pool_id}/.well-known/jwks.json"
            )
            async with httpx.AsyncClient() as client:
                resp = await client.get(jwks_url, timeout=5.0)
                jwks = resp.json()

            claims = jose_jwt.decode(
                token,
                jwks,
                algorithms=["RS256"],
                audience=client_id,
            )
            return TokenPayload(
                sub=claims["sub"],
                role=Role(claims.get("custom:role", "patient")),
                clinic_id=claims.get("custom:clinic_id", ""),
                is_partial=claims.get("partial", False),
            )
        except JWTError:
            continue

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": "AUTHENTICATION_REQUIRED", "error_id": _new_id()},
    )


# ── Role guards ───────────────────────────────────────────────────────────────

def require_role(*roles: Role):
    """
    FastAPI dependency factory.
    Usage: Depends(require_role(Role.DOCTOR, Role.ADMIN))
    """
    async def _guard(
        token: TokenPayload = Depends(get_current_token),
    ) -> TokenPayload:
        if token.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "FORBIDDEN", "error_id": _new_id()},
            )
        if token.is_partial:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "MFA_REQUIRED", "error_id": _new_id()},
            )
        return token

    return _guard


def require_patient(
    token: TokenPayload = Depends(get_current_token),
) -> TokenPayload:
    if token.role != Role.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "FORBIDDEN", "error_id": _new_id()},
        )
    return token


def require_nurse(
    token: TokenPayload = Depends(get_current_token),
) -> TokenPayload:
    if token.role != Role.NURSE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "FORBIDDEN", "error_id": _new_id()},
        )
    if token.is_partial:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "MFA_REQUIRED", "error_id": _new_id()},
        )
    return token


def require_doctor(
    token: TokenPayload = Depends(get_current_token),
) -> TokenPayload:
    if token.role != Role.DOCTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "FORBIDDEN", "error_id": _new_id()},
        )
    if token.is_partial:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "MFA_REQUIRED", "error_id": _new_id()},
        )
    return token


# ── Shared service dependencies ───────────────────────────────────────────────

def get_consent_cache() -> ConsentCache:
    from api.config import get_settings
    settings = get_settings()
    return ConsentCache(
        redis=get_redis(),
        ttl_seconds=settings.redis_consent_ttl_seconds,
    )


def get_consent_validator() -> ConsentValidator:
    from api.config import get_settings
    settings = get_settings()
    return ConsentValidator(
        current_consent_version=settings.current_consent_version,
    )


def get_audit() -> AuditService:
    return get_audit_service()


def get_sqs_client() -> SQSClient:
    return get_sqs()


# ── Type aliases for cleaner route signatures ─────────────────────────────────

DBSession = Annotated[AsyncSession, Depends(get_db)]
CurrentPatient = Annotated[TokenPayload, Depends(require_patient)]
CurrentNurse = Annotated[TokenPayload, Depends(require_nurse)]
CurrentDoctor = Annotated[TokenPayload, Depends(require_doctor)]
ConsentCacheDep = Annotated[ConsentCache, Depends(get_consent_cache)]
ConsentValidatorDep = Annotated[ConsentValidator, Depends(get_consent_validator)]
AuditDep = Annotated[AuditService, Depends(get_audit)]
SQSDep = Annotated[SQSClient, Depends(get_sqs_client)]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _new_id() -> str:
    from uuid import uuid4
    return str(uuid4())