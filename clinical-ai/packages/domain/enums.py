from enum import Enum


class AppEnv(str, Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class Role(str, Enum):
    PATIENT = "patient"
    NURSE = "nurse"
    DOCTOR = "doctor"
    ADMIN = "admin"
    DPO = "dpo"
    SYSTEM = "system"


class ConsentTier(int, Enum):
    TIER_1 = 1  # identity + symptoms + vitals + record
    TIER_2 = 2  # AI adaptive questioning + structuring
    TIER_3 = 3  # doctor creates permanent record
    TIER_4 = 4  # anonymised research use


class ConsentStatus(str, Enum):
    ACTIVE = "active"
    WITHDRAWN = "withdrawn"
    SUPERSEDED = "superseded"
    EXPIRED = "expired"
    NOT_GRANTED = "not_granted"


class ConsentPurpose(str, Enum):
    IDENTITY_COLLECTION = "identity_collection"
    SYMPTOM_COLLECTION = "symptom_collection"
    VITALS_COLLECTION = "vitals_collection"
    CLINICAL_RECORD_CREATION = "clinical_record_creation"
    AI_ADAPTIVE_QUESTIONING = "ai_adaptive_questioning"
    AI_CONTEXT_STRUCTURING = "ai_context_structuring"
    DOCTOR_RECORD_COMMIT = "doctor_record_commit"
    ANONYMISED_RESEARCH = "anonymised_research"


class ConsentEventType(str, Enum):
    GRANTED = "granted"
    WITHDRAWN = "withdrawn"
    SUPERSEDED = "superseded"
    VERSION_CHECKED = "version_checked"
    VERSION_MISMATCH = "version_mismatch"


class SessionStatus(str, Enum):
    QUESTIONNAIRE_IN_PROGRESS = "questionnaire_in_progress"
    QUESTIONNAIRE_COMPLETE = "questionnaire_complete"
    NURSE_MARKED_READY = "nurse_marked_ready"
    SYNTHESIS_IN_PROGRESS = "synthesis_in_progress"
    SYNTHESIS_COMPLETE = "synthesis_complete"
    SYNTHESIS_FALLBACK = "synthesis_fallback"
    RECORD_COMMITTED = "record_committed"


class QuestionType(str, Enum):
    TEXT = "text"
    SINGLE_CHOICE = "single_choice"
    MULTI_CHOICE = "multi_choice"
    SCALE = "scale"


class UrgencyFlag(str, Enum):
    ROUTINE = "routine"
    URGENT = "urgent"
    CRITICAL = "critical"


class VitalsSeverity(str, Enum):
    WARNING = "warning"
    CRITICAL = "critical"


class DoctorAction(str, Enum):
    ACCEPTED = "accepted"
    MODIFIED = "modified"
    REJECTED = "rejected"
    ADDED = "added"


class SkillName(str, Enum):
    ADAPTIVE_QUESTIONING = "AdaptiveQuestioning"
    CONTEXT_AGGREGATION = "ContextAggregation"
    DIFFERENTIAL_FRAMING = "DifferentialFraming"
    REASONING_TRACE = "ReasoningTrace"


class LLMProvider(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    BEDROCK = "bedrock"


class FallbackReason(str, Enum):
    LLM_TIMEOUT = "llm_timeout"
    LLM_ERROR = "llm_error"
    PII_STRIP_FAILED = "pii_strip_failed"
    OUTPUT_FILTER_BLOCKED = "output_filter_blocked"
    CONSENT_INSUFFICIENT = "consent_insufficient"
    CIRCUIT_BREAKER_OPEN = "circuit_breaker_open"
    TIER_2_DECLINED = "tier_2_declined"


class AuditEventType(str, Enum):
    # Auth
    AUTH_OTP_SENT = "auth_otp_sent"
    AUTH_OTP_VERIFIED = "auth_otp_verified"
    AUTH_STAFF_LOGIN = "auth_staff_login"
    AUTH_MFA_VERIFIED = "auth_mfa_verified"
    AUTH_FAILED = "auth_failed"
    # Consent
    CONSENT_GRANTED = "consent_granted"
    CONSENT_WITHDRAWN = "consent_withdrawn"
    CONSENT_VERSION_CHECKED = "consent_version_checked"
    CONSENT_VERSION_MISMATCH = "consent_version_mismatch"
    CONSENT_CHECK_PASSED = "consent_check_passed"
    CONSENT_CHECK_FAILED = "consent_check_failed"
    # Patient
    PATIENT_REGISTERED = "patient_registered"
    AGE_GATE_BLOCKED = "age_gate_blocked"
    SESSION_STARTED = "session_started"
    ANSWER_SUBMITTED = "answer_submitted"
    EMERGENCY_FLAGGED = "emergency_flagged"
    QUESTIONNAIRE_COMPLETE = "questionnaire_complete"
    # Nurse
    VITALS_SUBMITTED = "vitals_submitted"
    VITALS_OUTLIER_DETECTED = "vitals_outlier_detected"
    SESSION_MARKED_READY = "session_marked_ready"
    # AI
    AI_SKILL_INVOKED = "ai_skill_invoked"
    AI_SKILL_COMPLETE = "ai_skill_complete"
    AI_FALLBACK_USED = "ai_fallback_used"
    AI_PII_STRIPPED = "ai_pii_stripped"
    AI_PII_STRIP_FAILED = "ai_pii_strip_failed"
    AI_OUTPUT_BLOCKED = "ai_output_blocked"
    # Doctor
    PATIENT_CONTEXT_VIEWED = "patient_context_viewed"
    DIFFERENTIAL_ACTION_TAKEN = "differential_action_taken"
    DIFFERENTIAL_ADDED = "differential_added"
    REASONING_DRAFT_SAVED = "reasoning_draft_saved"
    RECORD_COMMITTED = "record_committed"
    # Security
    RBAC_DENIED = "rbac_denied"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    # Rights
    RIGHTS_DATA_VIEWED = "rights_data_viewed"
    RIGHTS_ERASURE_REQUESTED = "rights_erasure_requested"
    RIGHTS_CORRECTION_REQUESTED = "rights_correction_requested"
    RIGHTS_GRIEVANCE_SUBMITTED = "rights_grievance_submitted"


class RetentionCategory(str, Enum):
    R5YR = "r5yr"
    R7YR = "r7yr"
    R10YR = "r10yr"
    PERMANENT = "permanent"


class ActorRole(str, Enum):
    PATIENT = "patient"
    NURSE = "nurse"
    DOCTOR = "doctor"
    ADMIN = "admin"
    DPO = "dpo"
    SYSTEM = "system"
    LAMBDA = "lambda"


class OutcomeStatus(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    BLOCKED = "blocked"
    FALLBACK = "fallback"