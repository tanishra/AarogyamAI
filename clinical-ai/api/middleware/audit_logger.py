import time

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = structlog.get_logger(__name__)

_SKIP_PATHS = frozenset(["/health", "/docs", "/openapi.json"])


class AuditLoggerMiddleware(BaseHTTPMiddleware):
    """
    Logs every request and response for observability.

    Logs:
      - method, path, status_code, latency_ms
      - actor_id, role (from token if present)
      - request_id (from X-Request-ID header or generated)

    Never logs:
      - request body — may contain PHI
      - response body — may contain PHI
      - raw auth tokens
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        start = time.monotonic()
        request_id = request.headers.get("X-Request-ID", _new_id())

        # Attach request_id to request state for use in route handlers
        request.state.request_id = request_id

        response = await call_next(request)

        latency_ms = round((time.monotonic() - start) * 1000, 2)
        token = getattr(request.state, "token", None)

        logger.info(
            "request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            latency_ms=latency_ms,
            actor_id=token.sub if token else None,
            role=token.role.value if token else None,
            clinic_id=token.clinic_id if token else None,
        )

        response.headers["X-Request-ID"] = request_id
        return response


def _new_id() -> str:
    from uuid import uuid4
    return str(uuid4())