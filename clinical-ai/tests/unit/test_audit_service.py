import hashlib
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from packages.audit.audit_service import (
    GENESIS_HASH,
    AuditEntryBuilder,
    AuditService,
    ChainVerificationResult,
    _compute_entry_hash,
    get_audit_service,
)
from packages.domain.enums import ActorRole, AuditEventType, OutcomeStatus


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_entry(
    event: AuditEventType = AuditEventType.CONSENT_GRANTED,
    outcome: OutcomeStatus = OutcomeStatus.SUCCESS,
    role: ActorRole = ActorRole.PATIENT,
):
    return (
        AuditEntryBuilder()
        .event(event)
        .outcome(outcome)
        .actor(role=role, actor_id="actor-001")
        .patient("patient-001")
        .session("session-001")
        .clinic("clinic-001")
        .metadata({"tier": 1})
        .build()
    )


# ── Builder tests ─────────────────────────────────────────────────────────────

class TestAuditEntryBuilder:
    def test_build_valid_entry(self):
        entry = make_entry()
        assert entry.event_type == AuditEventType.CONSENT_GRANTED.value
        assert entry.outcome == OutcomeStatus.SUCCESS.value
        assert entry.actor_role == ActorRole.PATIENT.value
        assert entry.patient_id == "patient-001"
        assert entry.metadata == {"tier": 1}

    def test_missing_event_raises(self):
        with pytest.raises(ValueError, match="event_type is required"):
            (
                AuditEntryBuilder()
                .outcome(OutcomeStatus.SUCCESS)
                .actor(role=ActorRole.SYSTEM)
                .build()
            )

    def test_missing_outcome_raises(self):
        with pytest.raises(ValueError, match="outcome is required"):
            (
                AuditEntryBuilder()
                .event(AuditEventType.AUTH_FAILED)
                .actor(role=ActorRole.PATIENT)
                .build()
            )

    def test_missing_actor_role_raises(self):
        with pytest.raises(ValueError, match="actor_role is required"):
            (
                AuditEntryBuilder()
                .event(AuditEventType.AUTH_FAILED)
                .outcome(OutcomeStatus.FAILURE)
                .build()
            )

    def test_ip_is_hashed_not_stored_raw(self):
        entry = (
            AuditEntryBuilder()
            .event(AuditEventType.AUTH_OTP_SENT)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT)
            .ip("192.168.1.100")
            .build()
        )
        expected_hash = hashlib.sha256(b"192.168.1.100").hexdigest()
        assert entry.ip_address_hash == expected_hash
        assert "192.168.1.100" not in str(entry.ip_address_hash)

    def test_metadata_is_defensive_copy(self):
        original = {"tier": 1}
        entry = (
            AuditEntryBuilder()
            .event(AuditEventType.CONSENT_GRANTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(role=ActorRole.PATIENT)
            .metadata(original)
            .build()
        )
        original["tier"] = 999
        assert entry.metadata["tier"] == 1  # not mutated


# ── Hash function tests ───────────────────────────────────────────────────────

class TestComputeEntryHash:
    def test_same_inputs_produce_same_hash(self):
        kwargs = dict(
            sequence_number=1,
            prev_hash=GENESIS_HASH,
            event_type="consent_granted",
            outcome="success",
            actor_id="actor-001",
            actor_role="patient",
            patient_id="patient-001",
            session_id="session-001",
            occurred_at="2026-02-15T10:00:00+00:00",
        )
        h1 = _compute_entry_hash(**kwargs)
        h2 = _compute_entry_hash(**kwargs)
        assert h1 == h2

    def test_different_sequence_produces_different_hash(self):
        base = dict(
            prev_hash=GENESIS_HASH,
            event_type="consent_granted",
            outcome="success",
            actor_id="actor-001",
            actor_role="patient",
            patient_id="patient-001",
            session_id="session-001",
            occurred_at="2026-02-15T10:00:00+00:00",
        )
        h1 = _compute_entry_hash(sequence_number=1, **base)
        h2 = _compute_entry_hash(sequence_number=2, **base)
        assert h1 != h2

    def test_different_prev_hash_produces_different_hash(self):
        base = dict(
            sequence_number=2,
            event_type="consent_granted",
            outcome="success",
            actor_id="actor-001",
            actor_role="patient",
            patient_id="patient-001",
            session_id="session-001",
            occurred_at="2026-02-15T10:00:00+00:00",
        )
        h1 = _compute_entry_hash(prev_hash="a" * 64, **base)
        h2 = _compute_entry_hash(prev_hash="b" * 64, **base)
        assert h1 != h2

    def test_output_is_64_hex_chars(self):
        h = _compute_entry_hash(
            sequence_number=1,
            prev_hash=GENESIS_HASH,
            event_type="test",
            outcome="success",
            actor_id=None,
            actor_role="system",
            patient_id=None,
            session_id=None,
            occurred_at="2026-02-15T10:00:00+00:00",
        )
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# ── AuditService record tests (sync — mock DB session) ───────────────────────

class TestAuditServiceRecord:
    @pytest.mark.asyncio
    async def test_first_entry_uses_genesis_hash(self):
        service = AuditService()
        mock_session = AsyncMock()

        # Simulate no previous entry
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        entry = make_entry()
        log = await service.record(mock_session, entry)

        assert log.prev_hash == GENESIS_HASH
        assert log.sequence_number == 1

    @pytest.mark.asyncio
    async def test_subsequent_entry_chains_to_previous(self):
        service = AuditService()
        mock_session = AsyncMock()

        # Simulate one previous entry
        prev = MagicMock()
        prev.entry_hash = "a" * 64
        prev.sequence_number = 5

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = prev
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        entry = make_entry()
        log = await service.record(mock_session, entry)

        assert log.prev_hash == "a" * 64
        assert log.sequence_number == 6

    @pytest.mark.asyncio
    async def test_entry_hash_is_deterministic(self):
        service = AuditService()
        mock_session = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        entry = make_entry()

        # Run twice — patch datetime to be deterministic
        fixed_time = datetime(2026, 2, 15, 10, 0, 0, tzinfo=timezone.utc)
        with patch(
            "packages.audit.audit_service.datetime"
        ) as mock_dt:
            mock_dt.now.return_value = fixed_time

            log1 = await service.record(mock_session, entry)
            log2 = await service.record(mock_session, entry)

        assert log1.entry_hash == log2.entry_hash


# ── Singleton test ────────────────────────────────────────────────────────────

class TestGetAuditService:
    def test_returns_same_instance(self):
        s1 = get_audit_service()
        s2 = get_audit_service()
        assert s1 is s2