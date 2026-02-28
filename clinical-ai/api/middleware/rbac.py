from dataclasses import dataclass

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from packages.domain.enums import Role

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class RoutePermission:
    path_prefix: str
    method: str
    allowed_roles: frozenset[Role]
    allow_partial_token: bool = False   # True only for MFA endpoint


# ── Permission matrix — from LLD v1.0 ────────────────────────────────────────
# Order matters — first match wins

_PERMISSIONS: list[RoutePermission] = [
    # Auth — public routes handled by AuthMiddleware
    RoutePermission(
        "/api/v1/auth/staff/mfa-verify", "POST",
        frozenset([Role.NURSE, Role.DOCTOR, Role.ADMIN, Role.DPO]),
        allow_partial_token=True,
    ),
    # Consent
    RoutePermission(
        "/api/v1/consent", "GET",
        frozenset([Role.PATIENT]),
    ),
    RoutePermission(
        "/api/v1/consent", "POST",
        frozenset([Role.PATIENT]),
    ),
    # Patient
    RoutePermission(
        "/api/v1/patient", "GET",
        frozenset([Role.PATIENT]),
    ),
    RoutePermission(
        "/api/v1/patient", "POST",
        frozenset([Role.PATIENT]),
    ),
    RoutePermission(
        "/api/v1/rights", "GET",
        frozenset([Role.PATIENT]),
    ),
    RoutePermission(
        "/api/v1/rights", "POST",
        frozenset([Role.PATIENT]),
    ),
    # Nurse
    RoutePermission(
        "/api/v1/nurse", "GET",
        frozenset([Role.NURSE]),
    ),
    RoutePermission(
        "/api/v1/nurse", "POST",
        frozenset([Role.NURSE]),
    ),
    # Doctor
    RoutePermission(
        "/api/v1/doctor", "GET",
        frozenset([Role.DOCTOR]),
    ),
    RoutePermission(
        "/api/v1/doctor", "POST",
        frozenset([Role.DOCTOR]),
    ),
    RoutePermission(
        "/api/v1/doctor", "PATCH",
        frozenset([Role.DOCTOR]),
    ),
    # Admin
    RoutePermission(
        "/api/v1/admin", "GET",
        frozenset([Role.ADMIN]),
    ),
    RoutePermission(
        "/api/v1/admin", "POST",
        frozenset([Role.ADMIN]),
    ),
    RoutePermission(
        "/api/v1/admin", "PATCH",
        frozenset([Role.ADMIN]),
    ),
    # DPO
    RoutePermission(
        "/api/v1/dpo", "GET",
        frozenset([Role.DPO, Role.ADMIN]),
    ),
    RoutePermission(
        "/api/v1/dpo", "POST",
        frozenset([Role.DPO, Role.ADMIN]),
    ),
    RoutePermission(
        "/api/v1/dpo", "PATCH",
        frozenset([Role.DPO, Role.ADMIN]),
    ),
]

_PUBLIC_PATHS = frozenset([
    "/health",
    "/api/v1/auth/patient/send-otp",
    "/api/v1/auth/patient/verify-otp",
    "/api/v1/auth/staff/login",
    "/docs",
    "/openapi.json",
])


class RBACMiddleware(BaseHTTPMiddleware):
    """
    Enforces role-based access control on every non-public request.
    Runs AFTER AuthMiddleware — assumes request.state.token is set.

    Deterministic — no LLM, no DB. Pure permission matrix lookup.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)

        token = getattr(request.state, "token", None)
        if token is None:
            # AuthMiddleware should have caught this — defensive check
            return self._forbidden("AUTHENTICATION_REQUIRED", 401)

        permission = self._find_permission(request)

        if permission is None:
            # No rule found — deny by default
            logger.warning(
                "RBACMiddleware: no permission rule for route",
                path=request.url.path,
                method=request.method,
                role=token.role.value,
            )
            return self._forbidden("FORBIDDEN")

        if token.role not in permission.allowed_roles:
            logger.warning(
                "RBACMiddleware: role denied",
                path=request.url.path,
                method=request.method,
                role=token.role.value,
                allowed=list(r.value for r in permission.allowed_roles),
            )
            return self._forbidden("FORBIDDEN")

        if token.is_partial and not permission.allow_partial_token:
            return self._forbidden("MFA_REQUIRED", 401)

        return await call_next(request)

    def _find_permission(
        self, request: Request
    ) -> RoutePermission | None:
        path = request.url.path
        method = request.method.upper()

        for perm in _PERMISSIONS:
            if path.startswith(perm.path_prefix) and method == perm.method:
                return perm

        return None

    @staticmethod
    def _forbidden(error: str, code: int = 403) -> JSONResponse:
        from uuid import uuid4
        from datetime import datetime, timezone

        return JSONResponse(
            status_code=code,
            content={
                "error": error,
                "error_id": str(uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )