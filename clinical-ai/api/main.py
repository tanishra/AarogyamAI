from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.config import get_settings
from packages.cache.redis_client import close_redis, init_redis
from packages.db.client import close_db, init_db
from packages.queue.sqs_client import init_sqs
from api.middleware.consent import ConsentMiddleware
from api.middleware.rbac import RBACMiddleware

logger = structlog.get_logger(__name__)


# ── Lifespan — startup and shutdown ──────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once at startup and once at shutdown.
    Initialises all infrastructure singletons.
    """
    settings = get_settings()

    logger.info(
        "API starting up",
        env=settings.app_env,
        name=settings.app_name,
    )

    # Initialise DB
    init_db(
        database_url=settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
    )
    logger.info("Database initialised")

    # Initialise Redis
    init_redis(redis_url=settings.redis_url)
    logger.info("Redis initialised")

    # Initialise SQS
    init_sqs(
        queue_url=settings.sqs_ai_task_queue_url,
        region=settings.aws_region,
        endpoint_url=settings.localstack_endpoint,
    )
    logger.info("SQS initialised")

    yield  # app is running

    # Shutdown
    logger.info("API shutting down")
    await close_db()
    await close_redis()
    logger.info("Shutdown complete")


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Clinical AI API",
        version="1.0.0",
        docs_url="/docs" if settings.app_env == "development" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.parsed_cors_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    # ── Middleware stack — order matters, last added runs first ───────────────
    # Execution order on request: AuditLogger → InputValidator → Auth → RBAC → Consent
    _register_middleware(app)

    # ── Routes ────────────────────────────────────────────────────────────────
    _register_routes(app)

    # ── Global exception handlers ─────────────────────────────────────────────
    _register_exception_handlers(app)

    return app

def _register_middleware(app: FastAPI) -> None:
    from api.middleware.consent import ConsentMiddleware
    from api.middleware.rbac import RBACMiddleware
    from api.middleware.auth import AuthMiddleware
    from api.middleware.input_validator import InputValidatorMiddleware
    from api.middleware.audit_logger import AuditLoggerMiddleware

    # Starlette adds middleware as a stack — last added = outermost = runs first
    app.add_middleware(ConsentMiddleware)
    app.add_middleware(RBACMiddleware)
    app.add_middleware(AuthMiddleware)
    app.add_middleware(InputValidatorMiddleware)
    app.add_middleware(AuditLoggerMiddleware)

def _register_routes(app: FastAPI) -> None:
    from api.routes.auth import router as auth_router
    from api.routes.consent import router as consent_router
    from api.routes.patient import router as patient_router
    from api.routes.nurse import router as nurse_router
    from api.routes.doctor import router as doctor_router
    from api.routes.admin import router as admin_router
    from api.routes.intake import rest_router as intake_router
    from api.routes.intake import ws_router as intake_ws_router

    app.include_router(auth_router,    prefix="/api/v1")
    app.include_router(consent_router, prefix="/api/v1")
    app.include_router(patient_router, prefix="/api/v1")
    app.include_router(intake_router,  prefix="/api/v1")
    app.include_router(nurse_router,   prefix="/api/v1")
    app.include_router(doctor_router,  prefix="/api/v1")
    app.include_router(admin_router,   prefix="/api/v1")
    app.include_router(intake_ws_router)


def _register_exception_handlers(app: FastAPI) -> None:
    from uuid import uuid4

    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request, exc: HTTPException
    ) -> JSONResponse:
        if isinstance(exc.detail, dict):
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        error_id = str(uuid4())
        logger.error(
            "Unhandled exception",
            error_id=error_id,
            path=request.url.path,
            method=request.method,
            error=str(exc),
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "INTERNAL_ERROR",
                "error_id": error_id,
                "timestamp": _utcnow(),
            },
        )

    @app.get("/health", include_in_schema=False)
    async def health() -> dict:
        return {"status": "ok"}


def _utcnow() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ── WSGI entry point ──────────────────────────────────────────────────────────
app = create_app()
