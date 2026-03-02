"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardCopy, Send, Stethoscope } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

export default function DoctorRecordSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const [shareState, setShareState] = useState<"idle" | "sent" | "copied">("idle");
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    if (!token || role !== "doctor") {
      router.replace("/login");
    }
  }, [token, role, router]);

  const sessionId = params.get("session_id") ?? "";
  const recordId = params.get("record_id") ?? "";
  const committedAt = params.get("committed_at") ?? "";
  const receiptSent = params.get("receipt_sent") === "true";

  const commitTimeLabel = useMemo(() => {
    if (!committedAt) return "N/A";
    const dt = new Date(committedAt);
    if (Number.isNaN(dt.getTime())) return committedAt;
    return dt.toLocaleString();
  }, [committedAt]);

  const receiptText = useMemo(
    () =>
      `AarogyamAI Clinical Receipt\nRecord ID: ${recordId || "N/A"}\nSession ID: ${
        sessionId || "N/A"
      }\nCommitted At: ${commitTimeLabel}`,
    [recordId, sessionId, commitTimeLabel]
  );

  const shareReceipt = async () => {
    setShareError("");
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Clinical Record Receipt",
          text: receiptText,
        });
        setShareState("sent");
        return;
      }

      await navigator.clipboard.writeText(receiptText);
      setShareState("copied");
    } catch (e) {
      setShareError(`Unable to share receipt: ${String(e)}`);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(150deg,#EDF3FB,#F7FAFD)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <div
          style={{
            background: "white",
            border: "1px solid #DDE6F2",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
          }}
        >
          <header
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid #E5ECF5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "10px",
                  background: "#2563EB",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Stethoscope size={16} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "10px", letterSpacing: "0.1em", fontWeight: 800, color: "#2563EB" }}>
                  CLINICAL ZEN
                </p>
                <h1 style={{ margin: "2px 0 0", fontSize: "22px", color: "#0F172A", fontWeight: 800 }}>
                  Record Committed
                </h1>
              </div>
            </div>
            <CheckCircle2 size={22} color="#16A34A" />
          </header>

          <main style={{ padding: "20px" }}>
            <div
              style={{
                border: "1px solid #DCFCE7",
                background: "#F0FDF4",
                borderRadius: "12px",
                padding: "12px",
                marginBottom: "14px",
              }}
            >
              <p style={{ margin: 0, color: "#166534", fontWeight: 700, fontSize: "14px" }}>
                Tier-3 consent confirmed and final medical record committed successfully.
              </p>
            </div>

            <div
              style={{
                border: "1px solid #E2E8F0",
                borderRadius: "12px",
                background: "#F8FAFC",
                padding: "14px",
                display: "grid",
                gap: "8px",
                marginBottom: "14px",
              }}
            >
              <InfoRow label="Record ID" value={recordId || "N/A"} />
              <InfoRow label="Session ID" value={sessionId || "N/A"} />
              <InfoRow label="Committed At" value={commitTimeLabel} />
              <InfoRow label="Receipt Sent (backend)" value={receiptSent ? "Yes" : "No"} />
            </div>

            {shareError && (
              <div
                style={{
                  marginBottom: "10px",
                  border: "1px solid #FECACA",
                  background: "#FEF2F2",
                  color: "#B91C1C",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {shareError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={() => void shareReceipt()}
                style={{
                  border: "none",
                  borderRadius: "10px",
                  background: "#2563EB",
                  color: "white",
                  padding: "10px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                {shareState === "idle" && <Send size={14} />}
                {shareState === "sent" && <CheckCircle2 size={14} />}
                {shareState === "copied" && <ClipboardCopy size={14} />}
                {shareState === "idle"
                  ? "Send / Share Receipt"
                  : shareState === "sent"
                  ? "Receipt Shared"
                  : "Receipt Copied"}
              </button>

              <button
                onClick={() => router.push("/doctor/dashboard")}
                style={{
                  border: "1px solid #CBD5E1",
                  borderRadius: "10px",
                  background: "white",
                  color: "#334155",
                  padding: "10px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Return to Doctor Queue
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "170px minmax(0,1fr)",
        gap: "8px",
        alignItems: "start",
      }}
    >
      <p style={{ margin: 0, fontSize: "12px", color: "#64748B", fontWeight: 700 }}>{label}</p>
      <p
        style={{
          margin: 0,
          fontSize: "13px",
          color: "#0F172A",
          fontWeight: 700,
          wordBreak: "break-word",
        }}
      >
        {value}
      </p>
    </div>
  );
}
