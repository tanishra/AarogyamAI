from dataclasses import dataclass, field

from packages.domain.enums import VitalsSeverity


# ── Value objects ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class VitalRange:
    """
    Reference range for a single vital sign.
    All thresholds from LLD v1.0 Section 4.5.2.
    """
    name: str
    unit: str
    normal_min: float
    normal_max: float
    critical_min: float
    critical_max: float


@dataclass(frozen=True)
class OutlierFlag:
    """
    Produced when a vital is outside normal range.
    Consumed by nurse UI and stored in DB.
    """
    field: str
    value: float
    threshold: str
    severity: VitalsSeverity

    def to_dict(self) -> dict:
        return {
            "field": self.field,
            "value": self.value,
            "threshold": self.threshold,
            "severity": self.severity.value,
        }


@dataclass(frozen=True)
class VitalsValidationResult:
    """
    Result of validating a full set of vitals.
    is_valid = all values within absolute bounds (not outlier check).
    outlier_flags = values outside normal range — may still be valid readings.
    is_emergency = any value in critical range.
    """
    is_valid: bool
    outlier_flags: list[OutlierFlag]
    is_emergency: bool
    errors: list[str] = field(default_factory=list)

    @property
    def has_outliers(self) -> bool:
        return len(self.outlier_flags) > 0


# ── Reference ranges — from LLD v1.0 Section 4.5.2 ───────────────────────────

VITAL_RANGES: dict[str, VitalRange] = {
    "temperature_celsius": VitalRange(
        name="temperature_celsius",
        unit="°C",
        normal_min=36.0,
        normal_max=37.5,
        critical_min=32.0,
        critical_max=40.0,
    ),
    "bp_systolic_mmhg": VitalRange(
        name="bp_systolic_mmhg",
        unit="mmHg",
        normal_min=90.0,
        normal_max=140.0,
        critical_min=70.0,
        critical_max=180.0,
    ),
    "bp_diastolic_mmhg": VitalRange(
        name="bp_diastolic_mmhg",
        unit="mmHg",
        normal_min=60.0,
        normal_max=90.0,
        critical_min=40.0,
        critical_max=120.0,
    ),
    "heart_rate_bpm": VitalRange(
        name="heart_rate_bpm",
        unit="bpm",
        normal_min=60.0,
        normal_max=100.0,
        critical_min=40.0,
        critical_max=150.0,
    ),
    "respiratory_rate_pm": VitalRange(
        name="respiratory_rate_pm",
        unit="/min",
        normal_min=12.0,
        normal_max=20.0,
        critical_min=8.0,
        critical_max=30.0,
    ),
    "spo2_percent": VitalRange(
        name="spo2_percent",
        unit="%",
        normal_min=95.0,
        normal_max=100.0,
        critical_min=88.0,
        critical_max=100.0,
    ),
    "weight_kg": VitalRange(
        name="weight_kg",
        unit="kg",
        normal_min=10.0,
        normal_max=300.0,
        critical_min=10.0,
        critical_max=300.0,
    ),
    "height_cm": VitalRange(
        name="height_cm",
        unit="cm",
        normal_min=50.0,
        normal_max=250.0,
        critical_min=50.0,
        critical_max=250.0,
    ),
}

# Absolute acceptance bounds — reject values outside these entirely
ABSOLUTE_BOUNDS: dict[str, tuple[float, float]] = {
    "temperature_celsius": (30.0, 45.0),
    "bp_systolic_mmhg": (60.0, 300.0),
    "bp_diastolic_mmhg": (30.0, 200.0),
    "heart_rate_bpm": (20.0, 250.0),
    "respiratory_rate_pm": (4.0, 60.0),
    "spo2_percent": (60.0, 100.0),
    "weight_kg": (10.0, 300.0),
    "height_cm": (50.0, 250.0),
}


# ── Validator ──────────────────────────────────────────────────────────────────

class VitalsValidator:
    """
    Deterministic vitals validation.

    Responsibilities:
      1. Reject values outside absolute bounds (is_valid=False)
      2. Flag values outside normal range (outlier_flags)
      3. Flag critical values (is_emergency=True)

    This class owns NO state — instantiate once and reuse.
    LLM never touches this logic.
    """

    def validate(self, vitals: dict[str, float]) -> VitalsValidationResult:
        """
        Validate a dict of vital field names to float values.

        Args:
            vitals: e.g. {"temperature_celsius": 37.2, "bp_systolic_mmhg": 138, ...}

        Returns:
            VitalsValidationResult
        """
        errors: list[str] = []
        outlier_flags: list[OutlierFlag] = []
        is_emergency = False

        for field_name, value in vitals.items():
            if field_name not in ABSOLUTE_BOUNDS:
                continue  # unknown field — skip silently

            abs_min, abs_max = ABSOLUTE_BOUNDS[field_name]

            # Step 1 — absolute bounds check
            if not (abs_min <= value <= abs_max):
                errors.append(
                    f"{field_name} value {value} is outside absolute "
                    f"acceptance bounds [{abs_min}, {abs_max}]"
                )
                continue  # no further checks for this field

            ref = VITAL_RANGES[field_name]

            # Step 2 — critical range check
            if not (ref.critical_min <= value <= ref.critical_max):
                is_emergency = True
                outlier_flags.append(OutlierFlag(
                    field=field_name,
                    value=value,
                    threshold=(
                        f"critical range: {ref.critical_min}–"
                        f"{ref.critical_max} {ref.unit}"
                    ),
                    severity=VitalsSeverity.CRITICAL,
                ))
                continue

            # Step 3 — normal range check
            if not (ref.normal_min <= value <= ref.normal_max):
                outlier_flags.append(OutlierFlag(
                    field=field_name,
                    value=value,
                    threshold=(
                        f"normal: {ref.normal_min}–"
                        f"{ref.normal_max} {ref.unit}"
                    ),
                    severity=VitalsSeverity.WARNING,
                ))

        return VitalsValidationResult(
            is_valid=len(errors) == 0,
            outlier_flags=outlier_flags,
            is_emergency=is_emergency,
            errors=errors,
        )

    def validate_single(
        self, field_name: str, value: float
    ) -> OutlierFlag | None:
        """
        Validate a single vital field.
        Returns OutlierFlag if outside normal range, None if normal.
        Raises ValueError if outside absolute bounds.
        """
        if field_name not in ABSOLUTE_BOUNDS:
            raise ValueError(f"Unknown vital field: {field_name}")

        abs_min, abs_max = ABSOLUTE_BOUNDS[field_name]
        if not (abs_min <= value <= abs_max):
            raise ValueError(
                f"{field_name}={value} outside absolute bounds "
                f"[{abs_min}, {abs_max}]"
            )

        ref = VITAL_RANGES[field_name]

        if not (ref.critical_min <= value <= ref.critical_max):
            return OutlierFlag(
                field=field_name,
                value=value,
                threshold=(
                    f"critical range: {ref.critical_min}–"
                    f"{ref.critical_max} {ref.unit}"
                ),
                severity=VitalsSeverity.CRITICAL,
            )

        if not (ref.normal_min <= value <= ref.normal_max):
            return OutlierFlag(
                field=field_name,
                value=value,
                threshold=(
                    f"normal: {ref.normal_min}–"
                    f"{ref.normal_max} {ref.unit}"
                ),
                severity=VitalsSeverity.WARNING,
            )

        return None

    @staticmethod
    def is_emergency(result: VitalsValidationResult) -> bool:
        """Convenience method — true if any critical vital detected."""
        return result.is_emergency