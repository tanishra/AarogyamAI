"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Loader2,
  Send,
  Shield,
} from "lucide-react";

import {
  getNursePatientSummary,
  getNurseQueue,
  markNurseReady,
  verifyNurseIntake,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type QueueItem = {
  session_id: string;
  arrival_order: number;
  questionnaire_complete: boolean;
  waiting_since: string;
  emergency_flagged: boolean;
};

export default function NurseIntakePage() {
  const token = useAuthStore((s) => s.token);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [summary, setSummary] = useState<{
    session_id: string;
    chief_complaint: string;
    emergency_flagged: boolean;
    intake_summary_preview?: string;
    intake_verified?: boolean;
    active_mode?: string;
    fallback_history?: Array<{ from_mode: string; to_mode: string; reason: string; at: string }>;
  } | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const q = await getNurseQueue(token);
        const items = q.queue as QueueItem[];
        setQueue(items);
        if (items.length > 0) setSelectedSession(items[0].session_id);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token]);

  useEffect(() => {
    const run = async () => {
      if (!token || !selectedSession) return;
      const s = await getNursePatientSummary(token, selectedSession);
      setSummary(s);
    };
    run();
  }, [selectedSession, token]);

  const onVerify = async (approved: boolean) => {
    if (!token || !selectedSession) return;
    setSaving(true);
    setStatusText("");
    try {
      await verifyNurseIntake(token, selectedSession, approved, note);
      const s = await getNursePatientSummary(token, selectedSession);
      setSummary(s);
      setStatusText(approved ? "Intake verified." : "Intake rejected for correction.");
    } catch (e) {
      setStatusText(`Verification failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const onMarkReady = async () => {
    if (!token || !selectedSession) return;
    setSaving(true);
    setStatusText("");
    try {
      await markNurseReady(token, selectedSession);
      setStatusText("Synthesis queued successfully.");
    } catch (e) {
      setStatusText(`Cannot mark ready: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F0F4F8",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: "22px",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: "16px",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            border: "1px solid #E5E7EB",
            padding: "14px",
            height: "fit-content",
          }}
        >
          <p style={{ fontSize: "12px", fontWeight: 800, color: "#4F46E5", margin: "0 0 10px" }}>
            NURSE INTAKE QUEUE
          </p>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#64748B" }}>
              <Loader2 size={14} className="animate-spin" />
              Loading queue...
            </div>
          ) : queue.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#94A3B8", margin: 0 }}>No waiting sessions.</p>
          ) : (
            queue.map((item) => (
              <button
                key={item.session_id}
                onClick={() => setSelectedSession(item.session_id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  marginBottom: "8px",
                  borderRadius: "12px",
                  padding: "11px 12px",
                  border:
                    selectedSession === item.session_id
                      ? "1.5px solid #4F46E5"
                      : "1.5px solid #E5E7EB",
                  background:
                    selectedSession === item.session_id ? "#EEF2FF" : "#F8FAFC",
                  cursor: "pointer",
                }}
              >
                <p style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", margin: 0 }}>
                  Session {item.session_id.slice(0, 8)}
                </p>
                <p style={{ fontSize: "11px", color: "#64748B", margin: "3px 0 0" }}>
                  {item.questionnaire_complete ? "Questionnaire complete" : "In progress"}
                </p>
              </button>
            ))
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "white",
            borderRadius: "16px",
            border: "1px solid #E5E7EB",
            padding: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: "11px", color: "#64748B", fontWeight: 700, margin: 0 }}>
                PATIENT HANDOFF
              </p>
              <h2 style={{ fontSize: "20px", color: "#0F172A", margin: "4px 0 0", fontWeight: 800 }}>
                Intake Verification
              </h2>
            </div>
            {summary?.emergency_flagged ? (
              <span
                style={{
                  borderRadius: "999px",
                  padding: "5px 10px",
                  background: "#FEE2E2",
                  color: "#B91C1C",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                Emergency Flag
              </span>
            ) : null}
          </div>

          {!selectedSession || !summary ? (
            <p style={{ marginTop: "14px", color: "#94A3B8" }}>Select a session to review intake.</p>
          ) : (
            <>
              <div
                style={{
                  marginTop: "14px",
                  borderRadius: "12px",
                  border: "1px solid #E5E7EB",
                  background: "#F8FAFC",
                  padding: "12px",
                }}
              >
                <p style={{ fontSize: "12px", fontWeight: 700, color: "#334155", margin: "0 0 6px" }}>
                  Chief Complaint
                </p>
                <p style={{ fontSize: "14px", color: "#0F172A", margin: 0 }}>
                  {summary.chief_complaint || "Not provided"}
                </p>
              </div>

              <div
                style={{
                  marginTop: "10px",
                  borderRadius: "12px",
                  border: "1px solid #E5E7EB",
                  background: "white",
                  padding: "12px",
                }}
              >
                <p style={{ fontSize: "12px", fontWeight: 700, color: "#334155", margin: "0 0 6px" }}>
                  Intake Summary
                </p>
                <p style={{ fontSize: "13px", color: "#334155", margin: 0, lineHeight: 1.5 }}>
                  {summary.intake_summary_preview || "No summary available yet."}
                </p>
              </div>

              <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    borderRadius: "999px",
                    padding: "5px 10px",
                    background: "#EFF6FF",
                    color: "#1D4ED8",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  Mode: {summary.active_mode || "unknown"}
                </span>
                <span
                  style={{
                    borderRadius: "999px",
                    padding: "5px 10px",
                    background:
                      summary.intake_verified === true
                        ? "#DCFCE7"
                        : summary.intake_verified === false
                        ? "#FEE2E2"
                        : "#F1F5F9",
                    color:
                      summary.intake_verified === true
                        ? "#166534"
                        : summary.intake_verified === false
                        ? "#B91C1C"
                        : "#475569",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  Verified:{" "}
                  {summary.intake_verified === true
                    ? "Yes"
                    : summary.intake_verified === false
                    ? "No"
                    : "Pending"}
                </span>
              </div>

              {summary.fallback_history && summary.fallback_history.length > 0 ? (
                <div style={{ marginTop: "10px" }}>
                  <p style={{ fontSize: "11px", color: "#94A3B8", fontWeight: 700, margin: "0 0 6px" }}>
                    Fallback Trail
                  </p>
                  {summary.fallback_history.slice(0, 3).map((f, idx) => (
                    <div
                      key={`${f.at}-${idx}`}
                      style={{
                        fontSize: "11px",
                        color: "#9A3412",
                        background: "#FFF7ED",
                        border: "1px solid #FED7AA",
                        borderRadius: "8px",
                        padding: "6px 8px",
                        marginBottom: "6px",
                      }}
                    >
                      {f.from_mode} → {f.to_mode} ({f.reason})
                    </div>
                  ))}
                </div>
              ) : null}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nurse verification note..."
                style={{
                  marginTop: "12px",
                  width: "100%",
                  minHeight: "84px",
                  borderRadius: "10px",
                  border: "1.5px solid #E5E7EB",
                  background: "#F8FAFC",
                  padding: "10px",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  outline: "none",
                  resize: "vertical",
                }}
              />

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button
                  onClick={() => onVerify(true)}
                  disabled={saving}
                  style={{
                    flex: 1,
                    border: "none",
                    borderRadius: "11px",
                    padding: "11px 12px",
                    background: "#10B981",
                    color: "white",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <CheckCircle size={14} /> Verify Intake
                  </span>
                </button>
                <button
                  onClick={() => onVerify(false)}
                  disabled={saving}
                  style={{
                    border: "1.5px solid #FECACA",
                    borderRadius: "11px",
                    padding: "11px 12px",
                    background: "#FEF2F2",
                    color: "#B91C1C",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <AlertTriangle size={14} /> Reject
                  </span>
                </button>
              </div>

              <button
                onClick={onMarkReady}
                disabled={saving}
                style={{
                  width: "100%",
                  marginTop: "10px",
                  border: "none",
                  borderRadius: "11px",
                  padding: "12px",
                  background: "#4F46E5",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
                  <Send size={14} /> Mark Ready for Synthesis <ChevronRight size={14} />
                </span>
              </button>

              <div
                style={{
                  marginTop: "10px",
                  borderRadius: "9px",
                  background: "#F0FDF4",
                  border: "1px solid #BBF7D0",
                  color: "#166534",
                  fontSize: "11px",
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Shield size={12} />
                Nurse verification is mandatory before AI handoff.
              </div>
            </>
          )}

          {statusText ? (
            <p style={{ marginTop: "10px", fontSize: "12px", color: "#475569" }}>{statusText}</p>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
