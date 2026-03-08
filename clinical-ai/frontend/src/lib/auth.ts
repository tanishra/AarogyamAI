export type UserRole = "patient" | "nurse" | "doctor" | "admin";

function base64UrlEncode(input: string): string {
  if (typeof window !== "undefined") {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function createDevBearerToken(role: UserRole, subject?: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: subject ?? (role === "patient" ? "patient-demo-001" : "staff-001"),
    "custom:role": role,
    "custom:clinic_id": "clinic-demo-001",
    partial: false,
  };
  const token = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}.devsig`;
  return `Bearer ${token}`;
}

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8080";
}

export function getWsBaseUrl(): string {
  const ws = process.env.NEXT_PUBLIC_WS_BASE_URL?.trim();
  if (ws) return ws;
  const api = getApiBaseUrl();
  if (api.startsWith("https://")) return api.replace("https://", "wss://");
  if (api.startsWith("http://")) return api.replace("http://", "ws://");
  return "ws://localhost:8080";
}

function normalizeCognitoDomain(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function encodeState(payload: Record<string, string>): string {
  const text = JSON.stringify(payload);
  if (typeof window !== "undefined") {
    return btoa(text);
  }
  return Buffer.from(text, "utf-8").toString("base64");
}

export function decodeState(encoded: string): Record<string, string> | null {
  try {
    const text =
      typeof window !== "undefined"
        ? atob(encoded)
        : Buffer.from(encoded, "base64").toString("utf-8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : null;
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const text =
      typeof window !== "undefined"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf-8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function buildCognitoAuthorizeUrl(role: "patient" | "nurse" | "doctor"): string {
  const isPatient = role === "patient";
  const rawDomain = isPatient
    ? process.env.NEXT_PUBLIC_COGNITO_PATIENT_DOMAIN?.trim() ?? ""
    : process.env.NEXT_PUBLIC_COGNITO_STAFF_DOMAIN?.trim() ?? "";
  const clientId = isPatient
    ? process.env.NEXT_PUBLIC_COGNITO_PATIENT_CLIENT_ID?.trim() ?? ""
    : process.env.NEXT_PUBLIC_COGNITO_STAFF_CLIENT_ID?.trim() ?? "";
  const domain = normalizeCognitoDomain(rawDomain);
  if (!domain || !clientId) {
    throw new Error(
      "Missing Cognito frontend config. Set NEXT_PUBLIC_COGNITO_* env vars."
    );
  }

  const redirectUri =
    process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI?.trim() ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/cognito-callback`
      : "http://localhost:3000/cognito-callback");

  const scope = isPatient ? "openid phone email" : "openid email profile";
  const state = encodeState({ role });
  const qs = new URLSearchParams({
    client_id: clientId,
    response_type: "id_token",
    scope,
    redirect_uri: redirectUri,
    state,
  });

  return `${domain}/oauth2/authorize?${qs.toString()}`;
}
