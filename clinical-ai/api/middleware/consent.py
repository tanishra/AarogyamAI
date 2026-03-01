import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from packages.domain.enums import ConsentStatus, ConsentTier, Role

logger = structlog.get_logger(__name__)


# ── Consent tier requirements per route ───────────────────────────────────────

_TIER_REQUIREMENTS: dict[str, ConsentTier] = {
    "/api/v1/intake": ConsentTier.TIER_1,
    "/api/v1/patient/session/start": ConsentTier.TIER_1,
    "/api/v1/patient/session/answer": ConsentTier.TIER_1,
    "/api/v1/patient/session/complete": ConsentTier.TIER_1,
    "/api/v1/patient/portal/my-data": ConsentTier.TIER_1,
    "/api/v1/rights/grievance": ConsentTier.TIER_1,
    "/api/v1/rights/erasure-request": ConsentTier.TIER_1,
    "/api/v1/rights/correction": ConsentTier.TIER_1,
    "/api/v1/doctor/record/commit": ConsentTier.TIER_3,
}

_CONSENT_EXEMPT_PATHS = frozenset([
    "/health",
    "/api/v1/auth/patient/send-otp",
    "/api/v1/auth/patient/verify-otp",
    "/api/v1/auth/staff/login",
    "/api/v1/auth/staff/mfa-verify",
    "/api/v1/consent/version-check",
    "/api/v1/consent/grant",
    "/api/v1/consent/withdraw",
    "/docs",
    "/openapi.json",
])

# Staff routes never check patient consent
_STAFF_ROLES = frozenset([Role.NURSE, Role.DOCTOR, Role.ADMIN, Role.DPO])


class ConsentMiddleware(BaseHTTPMiddleware):
    """
    Enforces consent tier requirements on patient-facing routes.
    Reads consent status from Redis cache — falls back to DB on cache miss.

    Runs AFTER RBACMiddleware — assumes request.state.token is set.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        if path in _CONSENT_EXEMPT_PATHS:
            return await call_next(request)

        token = getattr(request.state, "token", None)
        if token is None:
            return await call_next(request)

        # Staff routes skip patient consent check
        if token.role in _STAFF_ROLES:
            return await call_next(request)

        # Find tier requirement for this route
        required_tier = self._get_required_tier(path)
        if required_tier is None:
            return await call_next(request)

        # Check consent
        consent_ok = await self._check_consent(
            patient_id=token.sub,
            tier=required_tier,
        )

        if not consent_ok:
            return self._consent_required(required_tier)

        return await call_next(request)

    def _get_required_tier(self, path: str) -> ConsentTier | None:
        # Exact match first
        if path in _TIER_REQUIREMENTS:
            return _TIER_REQUIREMENTS[path]

        # Prefix match for parameterised routes
        for route_path, tier in _TIER_REQUIREMENTS.items():
            if path.startswith(route_path.rstrip("/")):
                return tier

        return None

    async def _check_consent(
        self,
        patient_id: str,
        tier: ConsentTier,
    ) -> bool:
        """
        Check consent from cache.
        Falls back to DB on cache miss.
        Fail-closed: returns False on any error.
        """
        try:
            from packages.cache.redis_client import ConsentCache, get_redis
            from api.config import get_settings

            settings = get_settings()
            cache = ConsentCache(
                redis=get_redis(),
                ttl_seconds=settings.redis_consent_ttl_seconds,
            )

            cached_status = await cache.get_consent_status(
                patient_id=patient_id,
                tier=tier.value,
            )

            if cached_status is not None:
                return cached_status == ConsentStatus.ACTIVE.value

            # Cache miss — check DB
            db_status = await self._check_consent_db(patient_id, tier)

            # Populate cache for next request
            if db_status is not None:
                await cache.set_consent_status(
                    patient_id=patient_id,
                    tier=tier.value,
                    status=db_status,
                )
                return db_status == ConsentStatus.ACTIVE.value

            return False

        except Exception as exc:
            logger.error(
                "ConsentMiddleware: consent check error — failing closed",
                patient_id=patient_id,
                tier=tier.value,
                error=str(exc),
            )
            return False   # fail closed — never grant access on error

    async def _check_consent_db(
        self,
        patient_id: str,
        tier: ConsentTier,
    ) -> str | None:
        """
        Query DB for consent status.
        Returns status string or None if not found.
        """
        try:
            from packages.db.client import get_session
            from packages.db.models.consent import ConsentToken
            from sqlalchemy import select

            async with get_session() as session:
                stmt = (
                    select(ConsentToken)
                    .where(ConsentToken.patient_id == patient_id)
                    .where(ConsentToken.tier == tier.value)
                    .order_by(ConsentToken.granted_at.desc())
                    .limit(1)
                )
                result = await session.execute(stmt)
                token = result.scalar_one_or_none()

                if token is None:
                    return ConsentStatus.NOT_GRANTED.value
                return token.status

        except Exception as exc:
            logger.error(
                "ConsentMiddleware: DB consent check failed",
                error=str(exc),
            )
            return None

    @staticmethod
    def _consent_required(tier: ConsentTier) -> JSONResponse:
        from uuid import uuid4
        from datetime import datetime, timezone

        error = (
            "CONSENT_REQUIRED"
            if tier != ConsentTier.TIER_3
            else "CONSENT_REQUIRED"
        )

        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "error": error,
                "error_id": str(uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "tier": tier.value,
                "reconsent_required": False,
            },
        )
