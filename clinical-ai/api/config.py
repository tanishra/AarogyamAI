from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class APISettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    app_env: str = "development"
    app_name: str = "clinical-ai"
    log_level: str = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8080

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str
    database_pool_size: int = 10
    database_max_overflow: int = 20

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    redis_consent_ttl_seconds: int = 300

    # ── AWS ───────────────────────────────────────────────────────────────────
    aws_region: str = "ap-south-1"
    localstack_endpoint: str | None = None

    # ── SQS ───────────────────────────────────────────────────────────────────
    sqs_ai_task_queue_url: str
    sqs_visibility_timeout: int = 120

    # ── Cognito ───────────────────────────────────────────────────────────────
    cognito_patient_pool_id: str = ""
    cognito_staff_pool_id: str = ""
    cognito_patient_client_id: str = ""
    cognito_staff_client_id: str = ""
    cognito_region: str = "ap-south-1"

    # ── Consent ───────────────────────────────────────────────────────────────
    current_consent_version: str = "1.1"

    # ── Security ──────────────────────────────────────────────────────────────
    dev_skip_cognito_verify: bool = False  # NEVER True in staging/production

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = [
        "https://app.clinicaldomain.in",
        "https://clinic.clinicaldomain.in",
    ]


@lru_cache(maxsize=1)
def get_settings() -> APISettings:
    return APISettings()