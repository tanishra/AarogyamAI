from collections.abc import AsyncGenerator
import os
import time
from typing import Any

import redis.asyncio as aioredis
from redis.asyncio import Redis

# ── Module-level singleton ─────────────────────────────────────────────────────
_redis: Redis | None = None


class _InMemoryRedis:
    """Minimal async Redis substitute for local dev/tests."""

    def __init__(self) -> None:
        self._store: dict[str, Any] = {}
        self._expiry: dict[str, float] = {}

    def _is_expired(self, key: str) -> bool:
        exp = self._expiry.get(key)
        if exp is None:
            return False
        if exp <= time.time():
            self._store.pop(key, None)
            self._expiry.pop(key, None)
            return True
        return False

    async def get(self, key: str):
        if self._is_expired(key):
            return None
        return self._store.get(key)

    async def setex(self, key: str, ttl_seconds: int, value: Any) -> bool:
        self._store[key] = value
        self._expiry[key] = time.time() + ttl_seconds
        return True

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            if key in self._store:
                deleted += 1
            self._store.pop(key, None)
            self._expiry.pop(key, None)
        return deleted

    async def incr(self, key: str) -> int:
        if self._is_expired(key):
            current = 0
        else:
            current = int(self._store.get(key, 0))
        current += 1
        self._store[key] = str(current)
        return current

    async def expire(self, key: str, ttl_seconds: int) -> bool:
        if key not in self._store:
            return False
        self._expiry[key] = time.time() + ttl_seconds
        return True

    async def ping(self) -> bool:
        return True

    async def info(self, section: str | None = None) -> dict[str, Any]:
        return {"used_memory": 0}

    async def aclose(self) -> None:
        return


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
    global _redis
    if _redis is None:
        app_env = os.getenv("APP_ENV", "development").lower()
        if app_env != "production":
            _redis = _InMemoryRedis()  # type: ignore[assignment]
        else:
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
