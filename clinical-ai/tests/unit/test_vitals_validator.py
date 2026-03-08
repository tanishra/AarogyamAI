import pytest
from packages.domain.enums import VitalsSeverity
from packages.validators.vitals_validator import VitalsValidator, VITAL_RANGES


@pytest.fixture
def validator() -> VitalsValidator:
    return VitalsValidator()


@pytest.fixture
def normal_vitals() -> dict:
    return {
        "temperature_celsius": 37.0,
        "bp_systolic_mmhg": 120.0,
        "bp_diastolic_mmhg": 80.0,
        "heart_rate_bpm": 75.0,
        "respiratory_rate_pm": 16.0,
        "spo2_percent": 98.0,
        "weight_kg": 70.0,
        "height_cm": 170.0,
    }


class TestNormalVitals:
    def test_all_normal_returns_valid(self, validator, normal_vitals):
        result = validator.validate(normal_vitals)
        assert result.is_valid is True
        assert result.has_outliers is False
        assert result.is_emergency is False
        assert result.errors == []

    def test_exactly_at_normal_min_is_not_outlier(self, validator, normal_vitals):
        normal_vitals["heart_rate_bpm"] = 60.0   # exactly at normal_min
        result = validator.validate(normal_vitals)
        assert result.is_valid is True
        assert result.has_outliers is False

    def test_exactly_at_normal_max_is_not_outlier(self, validator, normal_vitals):
        normal_vitals["heart_rate_bpm"] = 100.0  # exactly at normal_max
        result = validator.validate(normal_vitals)
        assert result.is_valid is True
        assert result.has_outliers is False


class TestOutlierDetection:
    def test_high_bp_produces_warning_flag(self, validator, normal_vitals):
        normal_vitals["bp_systolic_mmhg"] = 150.0
        result = validator.validate(normal_vitals)
        assert result.is_valid is True
        assert result.has_outliers is True
        assert result.is_emergency is False
        flag = result.outlier_flags[0]
        assert flag.field == "bp_systolic_mmhg"
        assert flag.severity == VitalsSeverity.WARNING

    def test_low_spo2_produces_warning_flag(self, validator, normal_vitals):
        normal_vitals["spo2_percent"] = 93.0
        result = validator.validate(normal_vitals)
        assert result.has_outliers is True
        assert result.outlier_flags[0].severity == VitalsSeverity.WARNING

    def test_multiple_outliers_all_flagged(self, validator, normal_vitals):
        normal_vitals["bp_systolic_mmhg"] = 150.0
        normal_vitals["heart_rate_bpm"] = 110.0
        result = validator.validate(normal_vitals)
        assert len(result.outlier_flags) == 2


class TestCriticalDetection:
    def test_critical_bp_sets_emergency_true(self, validator, normal_vitals):
        normal_vitals["bp_systolic_mmhg"] = 185.0
        result = validator.validate(normal_vitals)
        assert result.is_emergency is True
        assert result.outlier_flags[0].severity == VitalsSeverity.CRITICAL

    def test_critical_spo2_sets_emergency_true(self, validator, normal_vitals):
        normal_vitals["spo2_percent"] = 85.0
        result = validator.validate(normal_vitals)
        assert result.is_emergency is True

    def test_is_emergency_static_method(self, validator, normal_vitals):
        normal_vitals["heart_rate_bpm"] = 155.0
        result = validator.validate(normal_vitals)
        assert VitalsValidator.is_emergency(result) is True


class TestAbsoluteBounds:
    def test_value_below_absolute_min_is_invalid(self, validator, normal_vitals):
        normal_vitals["temperature_celsius"] = 28.0   # below 30.0
        result = validator.validate(normal_vitals)
        assert result.is_valid is False
        assert len(result.errors) == 1

    def test_value_above_absolute_max_is_invalid(self, validator, normal_vitals):
        normal_vitals["heart_rate_bpm"] = 300.0       # above 250
        result = validator.validate(normal_vitals)
        assert result.is_valid is False

    def test_invalid_field_skipped_silently(self, validator, normal_vitals):
        normal_vitals["unknown_field"] = 999.0
        result = validator.validate(normal_vitals)
        assert result.is_valid is True


class TestValidateSingle:
    def test_normal_value_returns_none(self, validator):
        assert validator.validate_single("heart_rate_bpm", 75.0) is None

    def test_outlier_value_returns_flag(self, validator):
        flag = validator.validate_single("bp_systolic_mmhg", 150.0)
        assert flag is not None
        assert flag.severity == VitalsSeverity.WARNING

    def test_critical_value_returns_critical_flag(self, validator):
        flag = validator.validate_single("spo2_percent", 85.0)
        assert flag is not None
        assert flag.severity == VitalsSeverity.CRITICAL

    def test_outside_absolute_bounds_raises(self, validator):
        with pytest.raises(ValueError):
            validator.validate_single("temperature_celsius", 28.0)

    def test_unknown_field_raises(self, validator):
        with pytest.raises(ValueError):
            validator.validate_single("unknown_field", 1.0)