from functools import lru_cache
import json

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

    # ── LLM (optional for conversational intake) ─────────────────────────────
    llm_provider: str = "openai"   # openai | anthropic
    llm_model_id: str = "gpt-4o-mini"
    llm_api_key: str = ""
    llm_timeout_seconds: int = 20
    llm_max_retries: int = 2
    llm_max_tokens: int = 200
    intake_assistant_persona: str = "calm, empathetic clinical intake nurse"
    intake_assistant_style: str = "concise, warm, professional"

    # ── Voice provider routing (model/provider agnostic) ─────────────────────
    voice_stt_provider: str = "deepgram"   # deepgram | openai | disabled
    voice_tts_provider: str = "deepgram"   # deepgram | openai | disabled

    # Deepgram
    deepgram_api_key: str = ""
    deepgram_stt_model: str = "nova-3"
    deepgram_tts_model: str = "aura-2-thalia-en"

    # OpenAI voice defaults
    openai_stt_model: str = "gpt-4o-mini-transcribe"
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "alloy"

    # ── Security ──────────────────────────────────────────────────────────────
    dev_skip_cognito_verify: bool = False  # NEVER True in staging/production
    jwt_secret_key: str = "change-me-in-production"
    jwt_issuer: str = "clinical-ai-local"
    jwt_algorithm: str = "HS256"
    jwt_expiry_seconds: int = 4 * 60 * 60  # 4 hours patient token

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Accepts:
    # - JSON array string: '["http://localhost:3000"]'
    # - CSV string: "http://localhost:3000,https://app.example.com"
    # - Single origin string: "http://localhost:3000"
    cors_origins: str = (
        "https://app.clinicaldomain.in,https://clinic.clinicaldomain.in"
    )

    def parsed_cors_origins(self) -> list[str]:
        raw = (self.cors_origins or "").strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed if str(x).strip()]
            except Exception:
                pass
        return [item.strip() for item in raw.split(",") if item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> APISettings:
    return APISettings()
