import hashlib
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.models.audit import AuditLogEntry
from packages.domain.enums import ActorRole, AuditEventType, OutcomeStatus

logger = logging.getLogger(__name__)

# ── Genesis constant — prev_hash of the very first entry ──────────────────────
GENESIS_HASH = "0" * 64


# ── Entry builder ─────────────────────────────────────────────────────────────

class AuditEntryBuilder:
    """
    Fluent builder for audit log entries.
    Forces callers to be explicit about every field.

    Usage:
        entry = (
            AuditEntryBuilder()
            .event(AuditEventType.CONSENT_GRANTED)
            .outcome(OutcomeStatus.SUCCESS)
            .actor(actor_id="uuid", role=ActorRole.PATIENT)
            .patient(patient_id="uuid")
            .session(session_id="uuid")
            .clinic(clinic_id="uuid")
            .metadata({"tier": 1})
            .build()
        )
    """

    def __init__(self) -> None:
        self._event_type: str | None = None
        self._outcome: str | None = None
        self._actor_id: str | None = None
        self._actor_role: str | None = None
        self._patient_id: str | None = None
        self._session_id: str | None = None
        self._clinic_id: str | None = None
        self._metadata: dict | None = None
        self._ip_address_hash: str | None = None

    def event(self, event_type: AuditEventType) -> "AuditEntryBuilder":
        self._event_type = event_type.value
        return self

    def outcome(self, outcome: OutcomeStatus) -> "AuditEntryBuilder":
        self._outcome = outcome.value
        return self

    def actor(
        self, role: ActorRole, actor_id: str | None = None
    ) -> "AuditEntryBuilder":
        self._actor_role = role.value
        self._actor_id = actor_id
        return self

    def patient(self, patient_id: str) -> "AuditEntryBuilder":
        self._patient_id = patient_id
        return self

    def session(self, session_id: str) -> "AuditEntryBuilder":
        self._session_id = session_id
        return self

    def clinic(self, clinic_id: str) -> "AuditEntryBuilder":
        self._clinic_id = clinic_id
        return self

    def metadata(self, data: dict) -> "AuditEntryBuilder":
        # Defensive copy — caller cannot mutate after build
        self._metadata = dict(data)
        return self

    def ip(self, ip_address: str) -> "AuditEntryBuilder":
        # Hash the IP — never store raw IP
        self._ip_address_hash = hashlib.sha256(
            ip_address.encode()
        ).hexdigest()
        return self

    def build(self) -> "_PendingAuditEntry":
        if self._event_type is None:
            raise ValueError("event_type is required")
        if self._outcome is None:
            raise ValueError("outcome is required")
        if self._actor_role is None:
            raise ValueError("actor_role is required")

        return _PendingAuditEntry(
            event_type=self._event_type,
            outcome=self._outcome,
            actor_id=self._actor_id,
            actor_role=self._actor_role,
            patient_id=self._patient_id,
            session_id=self._session_id,
            clinic_id=self._clinic_id,
            metadata=self._metadata,
            ip_address_hash=self._ip_address_hash,
        )


# ── Internal data class — not exposed outside this module ─────────────────────

class _PendingAuditEntry:
    """
    Holds all fields before the hash and sequence number are assigned.
    Only AuditService touches this.
    """

    def __init__(
        self,
        event_type: str,
        outcome: str,
        actor_id: str | None,
        actor_role: str,
        patient_id: str | None,
        session_id: str | None,
        clinic_id: str | None,
        metadata: dict | None,
        ip_address_hash: str | None,
    ) -> None:
        self.event_type = event_type
        self.outcome = outcome
        self.actor_id = actor_id
        self.actor_role = actor_role
        self.patient_id = patient_id
        self.session_id = session_id
        self.clinic_id = clinic_id
        self.metadata = metadata
        self.ip_address_hash = ip_address_hash


# ── Hash chain logic ──────────────────────────────────────────────────────────

def _compute_entry_hash(
    sequence_number: int,
    prev_hash: str,
    event_type: str,
    outcome: str,
    actor_id: str | None,
    actor_role: str,
    patient_id: str | None,
    session_id: str | None,
    occurred_at: str,
) -> str:
    """
    Deterministic SHA-256 over the canonical fields of an entry.
    Same inputs always produce the same hash.
    Metadata is intentionally excluded — it may contain variable whitespace.
    """
    canonical = json.dumps(
        {
            "sequence_number": sequence_number,
            "prev_hash": prev_hash,
            "event_type": event_type,
            "outcome": outcome,
            "actor_id": actor_id,
            "actor_role": actor_role,
            "patient_id": patient_id,
            "session_id": session_id,
            "occurred_at": occurred_at,
        },
        sort_keys=True,
        separators=(",", ":"),  # no extra whitespace
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


# ── Audit Service ─────────────────────────────────────────────────────────────

class AuditService:
    """
    Tamper-evident append-only audit log writer.

    Responsibilities:
      1. Assign monotonically increasing sequence numbers
      2. Compute and store SHA-256 hash chain
      3. Write entries — never update, never delete
      4. Verify chain integrity on demand

    One instance per application — shared across all services.
    Thread-safe: sequence number assigned inside DB transaction with row lock.
    """

    async def record(
        self,
        session: AsyncSession,
        entry: "_PendingAuditEntry",
    ) -> AuditLogEntry:
        """
        Append one entry to the audit log.

        Steps:
          1. Lock and fetch last entry to get prev_hash + last sequence number
          2. Compute this entry's hash
          3. Insert new entry
          4. Return the persisted entry

        Raises RuntimeError if insert fails — caller must NOT silently swallow this.
        """
        occurred_at = datetime.now(timezone.utc)
        occurred_at_str = occurred_at.isoformat()

        # Step 1 — get previous entry under advisory lock
        # FOR UPDATE SKIP LOCKED ensures concurrent writers don't race
        stmt = (
            select(AuditLogEntry)
            .order_by(AuditLogEntry.sequence_number.desc())
            .limit(1)
            .with_for_update()
        )
        result = await session.execute(stmt)
        last_entry = result.scalar_one_or_none()

        if last_entry is None:
            prev_hash = GENESIS_HASH
            sequence_number = 1
        else:
            prev_hash = last_entry.entry_hash
            sequence_number = last_entry.sequence_number + 1

        # Step 2 — compute hash
        entry_hash = _compute_entry_hash(
            sequence_number=sequence_number,
            prev_hash=prev_hash,
            event_type=entry.event_type,
            outcome=entry.outcome,
            actor_id=entry.actor_id,
            actor_role=entry.actor_role,
            patient_id=entry.patient_id,
            session_id=entry.session_id,
            occurred_at=occurred_at_str,
        )

        # Step 3 — insert
        log_entry = AuditLogEntry(
            id=str(uuid4()),
            entry_hash=entry_hash,
            prev_hash=prev_hash,
            sequence_number=sequence_number,
            event_type=entry.event_type,
            outcome=entry.outcome,
            actor_id=entry.actor_id,
            actor_role=entry.actor_role,
            patient_id=entry.patient_id,
            session_id=entry.session_id,
            clinic_id=entry.clinic_id,
            event_metadata=entry.metadata,
            ip_address_hash=entry.ip_address_hash,
            occurred_at=occurred_at,
        )

        session.add(log_entry)
        await session.flush()   # write to DB — not committed yet

        logger.info(
            "Audit entry recorded",
            extra={
                "sequence_number": sequence_number,
                "event_type": entry.event_type,
                "outcome": entry.outcome,
                "actor_role": entry.actor_role,
                "session_id": entry.session_id,
            },
        )

        return log_entry

    async def verify_chain(
        self,
        session: AsyncSession,
        from_sequence: int = 1,
        to_sequence: int | None = None,
    ) -> "ChainVerificationResult":
        """
        Verify hash chain integrity between two sequence numbers.
        Use this in the integrity-check Lambda and admin diagnostics.

        Returns ChainVerificationResult with first_break if chain is broken.
        """
        stmt = select(AuditLogEntry).order_by(
            AuditLogEntry.sequence_number.asc()
        )
        if from_sequence:
            stmt = stmt.where(
                AuditLogEntry.sequence_number >= from_sequence
            )
        if to_sequence:
            stmt = stmt.where(
                AuditLogEntry.sequence_number <= to_sequence
            )

        result = await session.execute(stmt)
        entries = list(result.scalars().all())

        if not entries:
            return ChainVerificationResult(
                valid=True,
                entries_checked=0,
                first_break=None,
            )

        # Verify first entry
        expected_prev = GENESIS_HASH if entries[0].sequence_number == 1 else None

        for i, entry in enumerate(entries):
            # Verify sequence is contiguous
            if i > 0:
                expected_seq = entries[i - 1].sequence_number + 1
                if entry.sequence_number != expected_seq:
                    return ChainVerificationResult(
                        valid=False,
                        entries_checked=i,
                        first_break=entry.sequence_number,
                        reason=f"Sequence gap at {entry.sequence_number}",
                    )

            # Verify prev_hash links correctly
            if i > 0:
                expected_prev = entries[i - 1].entry_hash

            if expected_prev is not None:
                if entry.prev_hash != expected_prev:
                    return ChainVerificationResult(
                        valid=False,
                        entries_checked=i,
                        first_break=entry.sequence_number,
                        reason=(
                            f"Hash chain break at sequence "
                            f"{entry.sequence_number}"
                        ),
                    )

            # Recompute and verify this entry's own hash
            recomputed = _compute_entry_hash(
                sequence_number=entry.sequence_number,
                prev_hash=entry.prev_hash,
                event_type=entry.event_type,
                outcome=entry.outcome,
                actor_id=entry.actor_id,
                actor_role=entry.actor_role,
                patient_id=entry.patient_id,
                session_id=entry.session_id,
                occurred_at=entry.occurred_at.isoformat(),
            )

            if recomputed != entry.entry_hash:
                return ChainVerificationResult(
                    valid=False,
                    entries_checked=i,
                    first_break=entry.sequence_number,
                    reason=(
                        f"Entry hash mismatch at sequence "
                        f"{entry.sequence_number} — possible tampering"
                    ),
                )

        return ChainVerificationResult(
            valid=True,
            entries_checked=len(entries),
            first_break=None,
        )


# ── Result type ───────────────────────────────────────────────────────────────

class ChainVerificationResult:
    def __init__(
        self,
        valid: bool,
        entries_checked: int,
        first_break: int | None,
        reason: str | None = None,
    ) -> None:
        self.valid = valid
        self.entries_checked = entries_checked
        self.first_break = first_break
        self.reason = reason

    def __repr__(self) -> str:
        return (
            f"<ChainVerificationResult valid={self.valid} "
            f"checked={self.entries_checked} "
            f"first_break={self.first_break}>"
        )


# ── Module-level singleton ────────────────────────────────────────────────────
_audit_service: AuditService | None = None


def get_audit_service() -> AuditService:
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service