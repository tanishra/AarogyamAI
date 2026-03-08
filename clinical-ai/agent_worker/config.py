from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentWorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    app_env: str = "development"
    log_level: str = "INFO"

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str
    database_pool_size: int = 5
    database_max_overflow: int = 10

    # ── SQS ───────────────────────────────────────────────────────────────────
    sqs_ai_task_queue_url: str
    sqs_visibility_timeout: int = 120
    sqs_max_messages: int = 1
    sqs_wait_time_seconds: int = 20
    aws_region: str = "ap-south-1"
    localstack_endpoint: str | None = None

    # ── LLM ───────────────────────────────────────────────────────────────────
    llm_provider: str = "anthropic"
    llm_model_id: str = "claude-sonnet-4-6"
    llm_timeout_seconds: int = 20
    llm_max_retries: int = 2
    llm_max_tokens: int = 1000

    # ── Agent ─────────────────────────────────────────────────────────────────
    agent_pii_stripper_enabled: bool = True
    agent_output_filter_enabled: bool = True

    # ── Secrets (fetched at runtime — not from env in production) ─────────────
    # In dev: set directly in .env
    # In prod: fetched from AWS Secrets Manager before worker starts
    llm_api_key: str = ""


@lru_cache(maxsize=1)
def get_settings() -> AgentWorkerSettings:
    return AgentWorkerSettings()