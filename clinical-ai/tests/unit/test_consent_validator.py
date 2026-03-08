import pytest
from packages.domain.enums import ConsentPurpose, ConsentStatus, ConsentTier
from packages.validators.consent_validator import ConsentValidator


CURRENT_VERSION = "1.1"


@pytest.fixture
def validator() -> ConsentValidator:
    return ConsentValidator(current_consent_version=CURRENT_VERSION)


class TestGrantRequest:
    def test_valid_tier1_grant(self, validator):
        result = validator.validate_grant_request(
            tier=ConsentTier.TIER_1,
            purposes_consented=[
                ConsentPurpose.IDENTITY_COLLECTION,
                ConsentPurpose.SYMPTOM_COLLECTION,
                ConsentPurpose.VITALS_COLLECTION,
                ConsentPurpose.CLINICAL_RECORD_CREATION,
            ],
            document_version=CURRENT_VERSION,
        )
        assert result.is_valid is True
        assert result.reason is None

    def test_wrong_version_fails(self, validator):
        result = validator.validate_grant_request(
            tier=ConsentTier.TIER_1,
            purposes_consented=[
                ConsentPurpose.IDENTITY_COLLECTION,
                ConsentPurpose.SYMPTOM_COLLECTION,
                ConsentPurpose.VITALS_COLLECTION,
                ConsentPurpose.CLINICAL_RECORD_CREATION,
            ],
            document_version="1.0",
        )
        assert result.is_valid is False
        assert result.reason == "CONSENT_VERSION_MISMATCH"

    def test_missing_purpose_fails(self, validator):
        result = validator.validate_grant_request(
            tier=ConsentTier.TIER_1,
            purposes_consented=[
                ConsentPurpose.IDENTITY_COLLECTION,
                # missing SYMPTOM_COLLECTION, VITALS_COLLECTION, CLINICAL_RECORD_CREATION
            ],
            document_version=CURRENT_VERSION,
        )
        assert result.is_valid is False
        assert result.reason is not None

    def test_valid_tier2_grant(self, validator):
        result = validator.validate_grant_request(
            tier=ConsentTier.TIER_2,
            purposes_consented=[
                ConsentPurpose.AI_ADAPTIVE_QUESTIONING,
                ConsentPurpose.AI_CONTEXT_STRUCTURING,
            ],
            document_version=CURRENT_VERSION,
        )
        assert result.is_valid is True


class TestTokenAllowsOperation:
    def test_active_token_correct_version_passes(self, validator):
        result = validator.validate_token_allows_operation(
            token_status=ConsentStatus.ACTIVE,
            required_tier=ConsentTier.TIER_1,
            token_version=CURRENT_VERSION,
        )
        assert result.is_valid is True

    def test_withdrawn_token_fails(self, validator):
        result = validator.validate_token_allows_operation(
            token_status=ConsentStatus.WITHDRAWN,
            required_tier=ConsentTier.TIER_1,
            token_version=CURRENT_VERSION,
        )
        assert result.is_valid is False
        assert result.reason == "CONSENT_WITHDRAWN"

    def test_old_version_token_fails(self, validator):
        result = validator.validate_token_allows_operation(
            token_status=ConsentStatus.ACTIVE,
            required_tier=ConsentTier.TIER_1,
            token_version="1.0",
        )
        assert result.is_valid is False
        assert result.reason == "CONSENT_VERSION_MISMATCH"

    def test_not_granted_returns_consent_required(self, validator):
        result = validator.validate_token_allows_operation(
            token_status=ConsentStatus.NOT_GRANTED,
            required_tier=ConsentTier.TIER_2,
            token_version=CURRENT_VERSION,
        )
        assert result.is_valid is False
        assert result.reason == "CONSENT_REQUIRED"


class TestTierDependency:
    def test_tier1_has_no_dependency(self, validator):
        result = validator.validate_tier_dependency(
            requested_tier=ConsentTier.TIER_1,
            tier_1_status=ConsentStatus.NOT_GRANTED,
        )
        assert result.is_valid is True

    def test_tier2_requires_active_tier1(self, validator):
        result = validator.validate_tier_dependency(
            requested_tier=ConsentTier.TIER_2,
            tier_1_status=ConsentStatus.NOT_GRANTED,
        )
        assert result.is_valid is False
        assert result.reason == "CONSENT_REQUIRED"

    def test_tier2_passes_when_tier1_active(self, validator):
        result = validator.validate_tier_dependency(
            requested_tier=ConsentTier.TIER_2,
            tier_1_status=ConsentStatus.ACTIVE,
        )
        assert result.is_valid is True


class TestWithdrawalRequest:
    def test_valid_withdrawal(self, validator):
        result = validator.validate_withdrawal_request(
            tiers_to_withdraw=[ConsentTier.TIER_2],
            active_tiers=[ConsentTier.TIER_1, ConsentTier.TIER_2],
        )
        assert result.is_valid is True

    def test_cannot_withdraw_inactive_tier(self, validator):
        result = validator.validate_withdrawal_request(
            tiers_to_withdraw=[ConsentTier.TIER_4],
            active_tiers=[ConsentTier.TIER_1],
        )
        assert result.is_valid is False

    def test_empty_list_fails(self, validator):
        result = validator.validate_withdrawal_request(
            tiers_to_withdraw=[],
            active_tiers=[ConsentTier.TIER_1],
        )
        assert result.is_valid is False