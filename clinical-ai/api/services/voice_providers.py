from __future__ import annotations

import asyncio
import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Protocol

import structlog

from api.config import get_settings

logger = structlog.get_logger(__name__)

class VoiceUnavailable(RuntimeError):
    pass


class STTProvider(Protocol):
    async def transcribe(
        self,
        audio_bytes: bytes,
        *,
        mime_type: str,
        sample_rate: int | None = None,
    ) -> str: ...


@dataclass
class TTSResult:
    audio_bytes: bytes
    mime_type: str
    provider: str
    model: str


class TTSProvider(Protocol):
    async def synthesize(self, text: str) -> TTSResult: ...


class DisabledSTTProvider:
    async def transcribe(
        self,
        audio_bytes: bytes,
        *,
        mime_type: str,
        sample_rate: int | None = None,
    ) -> str:
        raise VoiceUnavailable("STT provider disabled")


class DisabledTTSProvider:
    async def synthesize(self, text: str) -> TTSResult:
        raise VoiceUnavailable("TTS provider disabled")


class DeepgramSTTProvider:
    async def transcribe(
        self,
        audio_bytes: bytes,
        *,
        mime_type: str,
        sample_rate: int | None = None,
    ) -> str:
        settings = get_settings()
        if not settings.deepgram_api_key:
            raise VoiceUnavailable("DEEPGRAM_API_KEY not set")

        model = settings.deepgram_stt_model
        if model.startswith("aura-"):
            logger.warning(
                "deepgram_stt_model_invalid_fallback",
                configured=model,
                fallback="nova-3",
            )
            model = "nova-3"

        base = "https://api.deepgram.com/v1/listen"
        query = urllib.parse.urlencode(
            {
                "model": model,
                "smart_format": "true",
                "punctuate": "true",
            }
        )
        url = f"{base}?{query}"

        def _call() -> str:
            logger.info(
                "Deepgram STT request",
                model=model,
                mime_type=mime_type,
                bytes=len(audio_bytes),
            )
            req = urllib.request.Request(
                url=url,
                data=audio_bytes,
                headers={
                    "Authorization": f"Token {settings.deepgram_api_key}",
                    "Content-Type": mime_type,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            channel = (
                payload.get("results", {})
                .get("channels", [{}])[0]
            )
            alt = channel.get("alternatives", [{}])[0]
            text = str(alt.get("transcript", "")).strip()
            logger.info(
                "Deepgram STT response",
                model=model,
                transcript_chars=len(text),
            )
            return text

        return await asyncio.to_thread(_call)


class DeepgramTTSProvider:
    async def synthesize(self, text: str) -> TTSResult:
        settings = get_settings()
        if not settings.deepgram_api_key:
            raise VoiceUnavailable("DEEPGRAM_API_KEY not set")
        if not text.strip():
            raise VoiceUnavailable("TTS input empty")

        model = settings.deepgram_tts_model
        if model.startswith("nova-"):
            logger.warning(
                "deepgram_tts_model_invalid_fallback",
                configured=model,
                fallback="aura-2-thalia-en",
            )
            model = "aura-2-thalia-en"

        base = "https://api.deepgram.com/v1/speak"
        query = urllib.parse.urlencode({"model": model})
        url = f"{base}?{query}"

        def _call() -> TTSResult:
            logger.info(
                "Deepgram TTS request",
                model=model,
                chars=len(text),
            )
            req = urllib.request.Request(
                url=url,
                data=json.dumps({"text": text}).encode("utf-8"),
                headers={
                    "Authorization": f"Token {settings.deepgram_api_key}",
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                audio = resp.read()
                mime = resp.headers.get("Content-Type", "audio/mpeg")
            logger.info(
                "Deepgram TTS response",
                model=model,
                bytes=len(audio),
                mime_type=mime,
            )
            return TTSResult(
                audio_bytes=audio,
                mime_type=mime,
                provider="deepgram",
                model=model,
            )

        return await asyncio.to_thread(_call)


class OpenAISTTProvider:
    async def transcribe(
        self,
        audio_bytes: bytes,
        *,
        mime_type: str,
        sample_rate: int | None = None,
    ) -> str:
        settings = get_settings()
        if not settings.llm_api_key:
            raise VoiceUnavailable("LLM_API_KEY not set")

        def _call() -> str:
            from openai import OpenAI

            client = OpenAI(api_key=settings.llm_api_key)
            ext = "wav" if "wav" in mime_type else "webm"
            tr = client.audio.transcriptions.create(
                model=settings.openai_stt_model,
                file=(f"audio.{ext}", audio_bytes, mime_type),
            )
            return str(getattr(tr, "text", "") or "").strip()

        return await asyncio.to_thread(_call)


class OpenAITTSProvider:
    async def synthesize(self, text: str) -> TTSResult:
        settings = get_settings()
        if not settings.llm_api_key:
            raise VoiceUnavailable("LLM_API_KEY not set")
        if not text.strip():
            raise VoiceUnavailable("TTS input empty")

        def _call() -> TTSResult:
            from openai import OpenAI

            client = OpenAI(api_key=settings.llm_api_key)
            speech = client.audio.speech.create(
                model=settings.openai_tts_model,
                voice=settings.openai_tts_voice,
                input=text,
            )
            return TTSResult(
                audio_bytes=speech.read(),
                mime_type="audio/mpeg",
                provider="openai",
                model=settings.openai_tts_model,
            )

        return await asyncio.to_thread(_call)


def get_stt_provider() -> STTProvider:
    provider = get_settings().voice_stt_provider.strip().lower()
    if provider == "deepgram":
        return DeepgramSTTProvider()
    if provider == "openai":
        return OpenAISTTProvider()
    return DisabledSTTProvider()


def get_tts_provider() -> TTSProvider:
    provider = get_settings().voice_tts_provider.strip().lower()
    if provider == "deepgram":
        return DeepgramTTSProvider()
    if provider == "openai":
        return OpenAITTSProvider()
    return DisabledTTSProvider()
