from dataclasses import dataclass

from packages.domain.enums import ConsentPurpose, ConsentStatus, ConsentTier


# ── Value objects ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ConsentValidationResult:
    is_valid: bool
    reason: str | None = None   # machine-readable — used in error responses


# ── Required purposes per tier — from LLD v1.0 ────────────────────────────────

REQUIRED_PURPOSES: dict[ConsentTier, list[ConsentPurpose]] = {
    ConsentTier.TIER_1: [
        ConsentPurpose.SYMPTOM_COLLECTION,
        ConsentPurpose.AI_PROCESSING,
        ConsentPurpose.CLINICAL_RECORD,
        ConsentPurpose.NURSE_ACCESS,
    ],
    ConsentTier.TIER_2: [
        ConsentPurpose.AI_ADAPTIVE_QUESTIONING,
        ConsentPurpose.AI_CONTEXT_STRUCTURING,
    ],
    ConsentTier.TIER_3: [
        ConsentPurpose.DOCTOR_RECORD_COMMIT,
    ],
    ConsentTier.TIER_4: [
        ConsentPurpose.ANONYMISED_RESEARCH,
    ],
}


# ── Validator ──────────────────────────────────────────────────────────────────

class ConsentValidator:
    """
    Deterministic consent validation.

    Responsibilities:
      1. Validate that a grant request includes all required purposes for the tier
      2. Validate that a consent token status allows a given operation
      3. Validate consent document version matches current system version
      4. Validate tier dependencies (Tier 2 requires Tier 1 active)

    No DB access. No Redis. Pure logic only.
    """

    def __init__(self, current_consent_version: str) -> None:
        self._current_version = current_consent_version

    def validate_grant_request(
        self,
        tier: ConsentTier,
        purposes_consented: list[ConsentPurpose],
        document_version: str,
    ) -> ConsentValidationResult:
        """
        Validate a consent grant request before writing to DB.

        Checks:
          1. Document version matches current system version
          2. All required purposes for the tier are present
        """
        # Check 1 — version must match exactly
        if document_version != self._current_version:
            return ConsentValidationResult(
                is_valid=False,
                reason="CONSENT_VERSION_MISMATCH",
            )

        # Check 2 — all required purposes must be present
        required = set(REQUIRED_PURPOSES.get(tier, []))
        provided = set(purposes_consented)
        missing = required - provided

        if missing:
            return ConsentValidationResult(
                is_valid=False,
                reason=(
                    f"Missing required purposes for Tier {tier.value}: "
                    f"{[p.value for p in missing]}"
                ),
            )

        return ConsentValidationResult(is_valid=True)

    def validate_token_allows_operation(
        self,
        token_status: ConsentStatus,
        required_tier: ConsentTier,
        token_version: str,
    ) -> ConsentValidationResult:
        """
        Check whether an existing consent token permits an operation.
        Used by ConsentMiddleware on every request.

        Checks:
          1. Token status must be ACTIVE
          2. Token document version must match current system version
        """
        if token_status != ConsentStatus.ACTIVE:
            reason_map = {
                ConsentStatus.WITHDRAWN: "CONSENT_WITHDRAWN",
                ConsentStatus.SUPERSEDED: "CONSENT_VERSION_MISMATCH",
                ConsentStatus.EXPIRED: "CONSENT_VERSION_MISMATCH",
                ConsentStatus.NOT_GRANTED: "CONSENT_REQUIRED",
            }
            return ConsentValidationResult(
                is_valid=False,
                reason=reason_map.get(token_status, "CONSENT_REQUIRED"),
            )

        if token_version != self._current_version:
            return ConsentValidationResult(
                is_valid=False,
                reason="CONSENT_VERSION_MISMATCH",
            )

        return ConsentValidationResult(is_valid=True)

    def validate_tier_dependency(
        self,
        requested_tier: ConsentTier,
        tier_1_status: ConsentStatus,
    ) -> ConsentValidationResult:
        """
        Tier 2, 3, 4 all require Tier 1 to be active.
        Call before processing any consent grant for Tier >= 2.
        """
        if requested_tier == ConsentTier.TIER_1:
            return ConsentValidationResult(is_valid=True)

        if tier_1_status != ConsentStatus.ACTIVE:
            return ConsentValidationResult(
                is_valid=False,
                reason="CONSENT_REQUIRED",
            )

        return ConsentValidationResult(is_valid=True)

    def validate_withdrawal_request(
        self,
        tiers_to_withdraw: list[ConsentTier],
        active_tiers: list[ConsentTier],
    ) -> ConsentValidationResult:
        """
        Validate a withdrawal request.

        Rules:
          - Can only withdraw tiers that are currently active
          - Withdrawing Tier 1 also implicitly withdraws all other tiers
        """
        if not tiers_to_withdraw:
            return ConsentValidationResult(
                is_valid=False,
                reason="No tiers specified for withdrawal",
            )

        # All requested tiers must be currently active
        inactive = [t for t in tiers_to_withdraw if t not in active_tiers]
        if inactive:
            return ConsentValidationResult(
                is_valid=False,
                reason=(
                    f"Cannot withdraw tiers that are not active: "
                    f"{[t.value for t in inactive]}"
                ),
            )

        return ConsentValidationResult(is_valid=True)

    @staticmethod
    def get_required_purposes(tier: ConsentTier) -> list[ConsentPurpose]:
        """Return required purposes for a given tier."""
        return REQUIRED_PURPOSES.get(tier, [])
