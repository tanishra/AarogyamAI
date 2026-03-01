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
