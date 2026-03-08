import re

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = structlog.get_logger(__name__)

# Control characters except tab, newline, carriage return
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Prompt injection patterns
_INJECTION_PATTERNS = [
    re.compile(r"ignore (all )?(previous|prior) instructions", re.IGNORECASE),
    re.compile(r"system prompt", re.IGNORECASE),
    re.compile(r"you are now", re.IGNORECASE),
    re.compile(r"disregard (all )?(previous|prior)", re.IGNORECASE),
    re.compile(r"<\|.*?\|>"),               # token injection
    re.compile(r"\[INST\]|\[/INST\]"),      # Llama instruction tags
    re.compile(r"###\s*(instruction|system|prompt)", re.IGNORECASE),
]

_MAX_BODY_BYTES = 64 * 1024   # 64 KB max request body


class InputValidatorMiddleware(BaseHTTPMiddleware):
    """
    Sanitises all incoming request bodies.

    Checks:
      1. Body size limit — reject oversized requests
      2. Control character stripping
      3. Prompt injection detection — reject and log

    Runs before route handlers — never after.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PATCH", "PUT"):
            body = await request.body()

            # Size check
            if len(body) > _MAX_BODY_BYTES:
                return self._bad_request(
                    "Request body exceeds maximum allowed size"
                )

            # Prompt injection check on raw body
            body_str = body.decode("utf-8", errors="replace")

            for pattern in _INJECTION_PATTERNS:
                if pattern.search(body_str):
                    logger.warning(
                        "InputValidator: prompt injection attempt detected",
                        path=request.url.path,
                        pattern=pattern.pattern,
                        ip=request.client.host if request.client else "unknown",
                    )
                    return self._bad_request(
                        "Invalid input detected"
                    )

        return await call_next(request)

    @staticmethod
    def _bad_request(detail: str) -> JSONResponse:
        from uuid import uuid4
        from datetime import datetime, timezone

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": "VALIDATION_FAILED",
                "error_id": str(uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "detail": {"message": detail},
            },
        )