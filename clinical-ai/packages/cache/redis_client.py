from collections.abc import AsyncGenerator

import redis.asyncio as aioredis
from redis.asyncio import Redis

# ── Module-level singleton ─────────────────────────────────────────────────────
_redis: Redis | None = None


def init_redis(redis_url: str) -> None:
    """
    Call once at application startup.
    """
    global _redis
    _redis = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
        health_check_interval=30,
    )


async def close_redis() -> None:
    """
    Call once at application shutdown.
    """
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


def get_redis() -> Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialised. Call init_redis() first.")
    return _redis


# ── Typed key builders — single source of truth for all cache keys ─────────────

class CacheKeys:
    """
    All Redis key patterns in one place.
    No raw strings anywhere else in the codebase.
    """

    @staticmethod
    def consent(patient_id: str, tier: int) -> str:
        """consent:{patient_id}:tier{tier}"""
        return f"consent:{patient_id}:tier{tier}"

    @staticmethod
    def consent_version(patient_id: str) -> str:
        """consent_version:{patient_id}"""
        return f"consent_version:{patient_id}"

    @staticmethod
    def session_status(session_id: str) -> str:
        """session_status:{session_id}"""
        return f"session_status:{session_id}"

    @staticmethod
    def synthesis_status(session_id: str) -> str:
        """synthesis_status:{session_id}"""
        return f"synthesis_status:{session_id}"

    @staticmethod
    def rate_limit(identifier: str, endpoint: str) -> str:
        """rate_limit:{identifier}:{endpoint}"""
        return f"rate_limit:{identifier}:{endpoint}"

    @staticmethod
    def otp(phone_hash: str) -> str:
        """otp:{phone_hash}"""
        return f"otp:{phone_hash}"

    @staticmethod
    def nurse_queue(clinic_id: str) -> str:
        """nurse_queue:{clinic_id}"""
        return f"nurse_queue:{clinic_id}"

    @staticmethod
    def doctor_queue(clinic_id: str) -> str:
        """doctor_queue:{clinic_id}"""
        return f"doctor_queue:{clinic_id}"

    @staticmethod
    def circuit_breaker(service: str) -> str:
        """circuit_breaker:{service}"""
        return f"circuit_breaker:{service}"


# ── Typed cache operations ─────────────────────────────────────────────────────

class ConsentCache:
    """
    Consent-specific cache operations.
    Consent middleware imports this — not raw Redis.
    """

    def __init__(self, redis: Redis, ttl_seconds: int = 300) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    async def get_consent_status(self, patient_id: str, tier: int) -> str | None:
        """Returns 'active' | 'withdrawn' | 'not_granted' | None (cache miss)"""
        key = CacheKeys.consent(patient_id, tier)
        return await self._redis.get(key)

    async def set_consent_status(
        self, patient_id: str, tier: int, status: str
    ) -> None:
        key = CacheKeys.consent(patient_id, tier)
        await self._redis.setex(key, self._ttl, status)

    async def invalidate_patient_consent(self, patient_id: str) -> None:
        """Call immediately when patient withdraws consent."""
        keys = [CacheKeys.consent(patient_id, tier) for tier in range(1, 5)]
        keys.append(CacheKeys.consent_version(patient_id))
        if keys:
            await self._redis.delete(*keys)

    async def get_synthesis_status(self, session_id: str) -> str | None:
        key = CacheKeys.synthesis_status(session_id)
        return await self._redis.get(key)

    async def set_synthesis_status(
        self, session_id: str, status: str, ttl_seconds: int = 3600
    ) -> None:
        key = CacheKeys.synthesis_status(session_id)
        await self._redis.setex(key, ttl_seconds, status)