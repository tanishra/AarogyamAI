import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = structlog.get_logger(__name__)

# Routes that do NOT require a token
_PUBLIC_PATHS = frozenset([
    "/health",
    "/api/v1/auth/patient/send-otp",
    "/api/v1/auth/patient/verify-otp",
    "/api/v1/auth/staff/login",
    "/docs",
    "/openapi.json",
])


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Validates JWT on every non-public request.
    Attaches decoded token payload to request.state.token.

    Does NOT enforce roles — that is RBAC middleware's job.
    Does NOT check consent — that is ConsentMiddleware's job.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        if self._is_public(request):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return self._unauthorized("AUTHENTICATION_REQUIRED")

        token_str = auth_header.removeprefix("Bearer ").strip()

        if not token_str:
            return self._unauthorized("AUTHENTICATION_REQUIRED")

        try:
            from api.config import get_settings
            from api.dependencies import (
                _decode_unverified,
                _verify_cognito_token,
            )

            settings = get_settings()

            if settings.dev_skip_cognito_verify:
                payload = _decode_unverified(token_str)
            else:
                payload = await _verify_cognito_token(token_str, settings)
        except Exception as exc:
            logger.warning(
                "AuthMiddleware: token rejected",
                path=request.url.path,
                error=str(exc),
            )
            return self._unauthorized("AUTHENTICATION_REQUIRED")

        request.state.token = payload
        return await call_next(request)

    def _is_public(self, request: Request) -> bool:
        return request.url.path in _PUBLIC_PATHS

    @staticmethod
    def _unauthorized(error: str) -> JSONResponse:
        from uuid import uuid4
        from datetime import datetime, timezone

        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={
                "error": error,
                "error_id": str(uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
