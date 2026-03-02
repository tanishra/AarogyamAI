import { getApiBaseUrl } from "@/lib/auth";

type Dict = Record<string, unknown>;

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = init;
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...(headers || {}),
    },
  });
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    throw new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail ?? {})
    );
  }
  return (await response.json()) as T;
}

export async function grantTier1Consent(token: string): Promise<void> {
  await request("/api/v1/consent/grant", {
    method: "POST",
    token,
    body: JSON.stringify({
      consent_tier: 1,
      consent_document_version: "1.1",
      purposes_consented: [
        "symptom_collection",
        "ai_processing",
        "clinical_record",
        "nurse_access",
      ],
      device_fingerprint: "web-client",
    }),
  });
}

export async function sendPatientOTP(phone: string): Promise<{
  otp_sent: boolean;
  expires_in_seconds: number;
  masked_phone: string;
  dev_otp?: string | null;
}> {
  return request("/api/v1/auth/patient/send-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyPatientOTP(payload: {
  phone: string;
  otp: string;
  clinic_id: string;
}): Promise<{
  access_token: string;
  patient_id: string;
  age_gate_passed: boolean;
  is_new_patient: boolean;
  consent_status: {
    tier_1: string;
    tier_2: string;
    tier_3: string;
    tier_4: string;
  };
}> {
  return request("/api/v1/auth/patient/verify-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendNurseOTP(payload: {
  email: string;
  clinic_id: string;
}): Promise<{
  otp_sent: boolean;
  expires_in_seconds: number;
  masked_email: string;
  dev_otp?: string | null;
}> {
  return request("/api/v1/auth/nurse/send-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyNurseOTP(payload: {
  email: string;
  clinic_id: string;
  otp: string;
}): Promise<{
  access_token: string;
  user_id: string;
  role: string;
  clinic_id: string;
  display_name: string;
  expires_in: number;
}> {
  return request("/api/v1/auth/nurse/verify-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type StartSessionResponse = {
  session_id: string;
  expires_at: string;
  use_static_form: boolean;
  first_question: {
    question_id: string;
    question_text: string;
    topic_tag: string;
    is_emergency_check: boolean;
  };
};

export async function startPatientSession(
  token: string,
  clinicId: string
): Promise<StartSessionResponse> {
  return request("/api/v1/patient/session/start", {
    method: "POST",
    token,
    body: JSON.stringify({ clinic_id: clinicId }),
  });
}

export type InitIntakeResponse = {
  session_id: string;
  active_mode: string;
  fallback_chain: string[];
  ws_url: string;
  voice_token: string | null;
  expires_at: string;
};

export async function initIntakeSession(
  token: string,
  payload: {
    session_id: string;
    preferred_mode?: string;
    locale?: string;
    device_info?: Dict;
  }
): Promise<InitIntakeResponse> {
  return request("/api/v1/intake/session/init", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export type IntakeStateResponse = {
  session_id: string;
  active_mode: string;
  questionnaire_done: boolean;
  questions_remaining: number;
  emergency_flagged: boolean;
  nurse_verification_required: boolean;
  fallback_history: Array<{
    from_mode: string;
    to_mode: string;
    reason: string;
    at: string;
  }>;
};

export async function getIntakeState(
  token: string,
  sessionId: string
): Promise<IntakeStateResponse> {
  return request(`/api/v1/intake/session/${sessionId}/state`, {
    method: "GET",
    token,
  });
}

export async function switchIntakeMode(
  token: string,
  sessionId: string,
  targetMode: string,
  reason: string
): Promise<{
  session_id: string;
  active_mode: string;
  previous_mode: string;
  fallback_reason: string;
}> {
  return request(`/api/v1/intake/session/mode-switch`, {
    method: "POST",
    token,
    body: JSON.stringify({
      session_id: sessionId,
      target_mode: targetMode,
      reason,
    }),
  });
}

export async function finalizeIntake(
  token: string,
  sessionId: string
): Promise<{
  session_id: string;
  questionnaire_complete: boolean;
  intake_summary_preview: string;
  nurse_verification_required: boolean;
}> {
  return request(`/api/v1/intake/session/${sessionId}/finalize`, {
    method: "POST",
    token,
  });
}

export async function getNurseQueue(token: string): Promise<{
  queue: Array<{
    session_id: string;
    arrival_order: number;
    questionnaire_complete: boolean;
    vitals_submitted: boolean;
    waiting_since: string;
    emergency_flagged: boolean;
  }>;
  total_waiting: number;
}> {
  return request("/api/v1/nurse/queue", { method: "GET", token });
}

export async function getNursePatientSummary(
  token: string,
  sessionId: string
): Promise<{
  session_id: string;
  chief_complaint: string;
  emergency_flagged: boolean;
  vitals_submitted: boolean;
  latest_vitals?: {
    temperature_celsius: number;
    bp_systolic_mmhg: number;
    bp_diastolic_mmhg: number;
    heart_rate_bpm: number;
    respiratory_rate_pm: number;
    spo2_percent: number;
    weight_kg: number;
    height_cm: number;
    nurse_observation?: string | null;
  };
  intake_summary_preview?: string;
  intake_verified?: boolean;
  active_mode?: string;
  fallback_history?: Array<{
    from_mode: string;
    to_mode: string;
    reason: string;
    at: string;
  }>;
}> {
  return request(`/api/v1/nurse/patient/${sessionId}/summary`, {
    method: "GET",
    token,
  });
}

export async function verifyNurseIntake(
  token: string,
  sessionId: string,
  approved = true,
  nurseNote?: string
): Promise<{
  session_id: string;
  nurse_verified: boolean;
  verified_at: string;
  verified_by: string;
}> {
  return request("/api/v1/nurse/intake/verify", {
    method: "POST",
    token,
    body: JSON.stringify({
      session_id: sessionId,
      approved,
      nurse_note: nurseNote ?? null,
    }),
  });
}

export async function markNurseReady(
  token: string,
  sessionId: string
): Promise<{ synthesis_queued: boolean; estimated_ready_seconds: number }> {
  return request("/api/v1/nurse/session/mark-ready", {
    method: "POST",
    token,
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function submitNurseVitals(
  token: string,
  payload: {
    session_id: string;
    temperature_celsius: number;
    bp_systolic_mmhg: number;
    bp_diastolic_mmhg: number;
    heart_rate_bpm: number;
    respiratory_rate_pm: number;
    spo2_percent: number;
    weight_kg: number;
    height_cm: number;
    nurse_observation?: string | null;
    outlier_confirmations?: Array<{ field: string; confirmed: boolean }>;
  }
): Promise<{
  vitals_id: string;
  outlier_flags: Array<Record<string, unknown>>;
  saved_at: string;
}> {
  return request("/api/v1/nurse/vitals/submit", {
    method: "POST",
    token,
    body: JSON.stringify({
      ...payload,
      nurse_observation: payload.nurse_observation ?? null,
      outlier_confirmations: payload.outlier_confirmations ?? [],
    }),
  });
}

export async function removeNurseQueuePatient(
  token: string,
  sessionId: string,
  reason?: string
): Promise<{ session_id: string; removed: boolean; status: string }> {
  return request("/api/v1/nurse/queue/remove", {
    method: "POST",
    token,
    body: JSON.stringify({
      session_id: sessionId,
      reason: reason ?? null,
    }),
  });
}

export async function updateNursePatientStatus(
  token: string,
  payload: { session_id: string; status: string; reason?: string }
): Promise<{ session_id: string; updated: boolean; status: string }> {
  return request("/api/v1/nurse/session/update-status", {
    method: "POST",
    token,
    body: JSON.stringify({
      session_id: payload.session_id,
      status: payload.status,
      reason: payload.reason ?? null,
    }),
  });
}

export async function getDoctorQueue(token: string): Promise<{
  queue: Array<{
    session_id: string;
    arrival_order: number;
    synthesis_ready: boolean;
    fallback_active: boolean;
    urgency_flag: "routine" | "urgent" | "critical";
    chief_complaint: string;
    ready_since: string;
    patient_name?: string | null;
    patient_age?: number | null;
    patient_location?: string | null;
    short_summary?: string | null;
    nurse_feedback?: string | null;
    intake_verified?: boolean | null;
  }>;
  total_waiting: number;
}> {
  return request("/api/v1/doctor/queue", { method: "GET", token });
}

export async function getDoctorPatientContext(
  token: string,
  sessionId: string
): Promise<{
  session_id: string;
  synthesis_ready: boolean;
  fallback_active: boolean;
  fallback_reason?: string | null;
  structured_context?: {
    chief_complaint: string;
    history_of_present_illness: string;
    past_medical_history: string[];
    current_medications: string[];
    allergies: string[];
    social_history?: string | null;
  } | null;
  vitals_summary?: {
    temperature_celsius: number;
    bp_systolic_mmhg: number;
    bp_diastolic_mmhg: number;
    heart_rate_bpm: number;
    respiratory_rate_pm: number;
    spo2_percent: number;
    weight_kg: number;
    height_cm: number;
  } | null;
  outlier_flags: Array<Record<string, unknown>>;
  emergency_flagged: boolean;
  intake_summary_preview?: string | null;
  nurse_feedback?: string | null;
  patient_name?: string | null;
  patient_age?: number | null;
  patient_location?: string | null;
  differentials: Array<{
    consideration_id: string;
    title: string;
    supporting_features: string[];
    clinical_reasoning: string;
    urgency_flag: "routine" | "urgent" | "critical";
    ai_generated: boolean;
    doctor_action?: "accepted" | "modified" | "rejected" | "added" | null;
    doctor_modification?: string | null;
    sort_order: number;
  }>;
  synthesis_timestamp?: string | null;
}> {
  return request(`/api/v1/doctor/patient/${sessionId}/context`, {
    method: "GET",
    token,
  });
}

export async function submitDoctorDifferentialAction(
  token: string,
  considerationId: string,
  payload: {
    session_id: string;
    action: "accepted" | "modified" | "rejected";
    modification_text?: string | null;
  }
): Promise<{ updated_at: string }> {
  return request(`/api/v1/doctor/differential/${considerationId}/action`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      session_id: payload.session_id,
      action: payload.action,
      modification_text: payload.modification_text ?? null,
    }),
  });
}

export async function addDoctorDifferential(
  token: string,
  payload: {
    session_id: string;
    title: string;
    clinical_reasoning: string;
    urgency_flag: "routine" | "urgent" | "critical";
  }
): Promise<{ consideration_id: string; created_at: string }> {
  return request("/api/v1/doctor/differential/add", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
