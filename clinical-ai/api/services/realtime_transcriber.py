from __future__ import annotations

import asyncio
import io
import wave
from collections import defaultdict
from dataclasses import dataclass

from api.services.voice_providers import VoiceUnavailable, get_stt_provider


class TranscriptionUnavailable(RuntimeError):
    pass


@dataclass
class TranscriptionResult:
    partial_text: str | None
    final_text: str | None
    confidence: float


class RealtimeTranscriber:
    """
    Session-scoped PCM16 chunk buffer + best-effort transcription.

    Input audio contract:
      - raw PCM16 mono data base64-decoded by caller
      - sample_rate provided per chunk
    """

    def __init__(self) -> None:
        self._buffers: dict[str, bytearray] = defaultdict(bytearray)
        self._sample_rate: dict[str, int] = {}
        self._mime_type: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._stt = get_stt_provider()

    async def push_chunk(
        self,
        session_id: str,
        pcm_chunk: bytes,
        sample_rate: int,
        is_last: bool,
        mime_type: str = "audio/pcm",
    ) -> TranscriptionResult:
        async with self._lock:
            self._buffers[session_id].extend(pcm_chunk)
            self._sample_rate[session_id] = sample_rate
            self._mime_type[session_id] = mime_type
            buffered = len(self._buffers[session_id])

        # Lightweight partial signal for "live" UX.
        partial = None
        if not is_last and buffered >= 16000:  # ~0.5s at 16k/16bit mono
            partial = "..."

        if not is_last:
            return TranscriptionResult(
                partial_text=partial or "Listening...",
                final_text=None,
                confidence=0.0 if partial is None else 0.4,
            )

        async with self._lock:
            audio = bytes(self._buffers.pop(session_id, bytearray()))
            sr = self._sample_rate.pop(session_id, sample_rate)
            mime = self._mime_type.pop(session_id, mime_type)

        text = await self._transcribe_audio(audio, sr, mime)
        return TranscriptionResult(
            partial_text=None,
            final_text=text,
            confidence=0.85 if text else 0.0,
        )

    async def _transcribe_audio(
        self,
        audio_bytes: bytes,
        sample_rate: int,
        mime_type: str,
    ) -> str:
        # Provider APIs generally expect containerized formats; wrap raw PCM.
        prepared = audio_bytes
        prepared_mime = mime_type
        if mime_type in {"audio/pcm", "audio/raw", "application/octet-stream"}:
            prepared = self._pcm16_to_wav_bytes(audio_bytes, sample_rate)
            prepared_mime = "audio/wav"
        try:
            return await self._stt.transcribe(
                prepared,
                mime_type=prepared_mime,
                sample_rate=sample_rate,
            )
        except VoiceUnavailable as exc:
            raise TranscriptionUnavailable(str(exc)) from exc

    @staticmethod
    def _pcm16_to_wav_bytes(pcm_bytes: bytes, sample_rate: int) -> bytes:
        buff = io.BytesIO()
        with wave.open(buff, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # PCM16
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_bytes)
        return buff.getvalue()
