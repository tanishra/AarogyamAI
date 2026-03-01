"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity, Thermometer, Heart, Wind,
  CheckCircle, ClipboardList,
  ChevronRight, User
} from "lucide-react";
import { getNursePatientSummary, markNurseReady, submitNurseVitals, verifyNurseIntake } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type VitalStatus = "normal" | "elevated" | "critical";

interface Vitals {
  temp: string;
  hr: string;
  spo2: string;
  bp: string;
}

const getStatus = (field: keyof Vitals, value: string): VitalStatus => {
  const v = parseFloat(value);
  if (field === "temp") return v > 100.4 ? "critical" : v > 99 ? "elevated" : "normal";
  if (field === "hr") return v > 100 ? "elevated" : v < 60 ? "elevated" : "normal";
  if (field === "spo2") return v < 94 ? "critical" : v < 96 ? "elevated" : "normal";
  if (field === "bp") {
    const sys = parseInt(value.split("/")[0]);
    return sys > 140 ? "critical" : sys > 130 ? "elevated" : "normal";
  }
  return "normal";
};

const statusColor = (s: VitalStatus) =>
  s === "critical" ? "#EF4444" : s === "elevated" ? "#F59E0B" : "#10B981";

const statusLabel = (s: VitalStatus) =>
  s === "critical" ? "Febrile Range" : s === "elevated" ? "Slightly Elevated" : "Normal • Resting";

type NurseSummary = {
  session_id: string;
  chief_complaint: string;
  emergency_flagged: boolean;
  vitals_submitted: boolean;
  intake_summary_preview?: string;
};

function parseSummary(summary?: string): Record<string, string> {
  if (!summary) return {};
  const parts = summary.split("|").map((p) => p.trim()).filter(Boolean);
  const map: Record<string, string> = {};
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    map[key] = value;
  }
  return map;
}

function parseApiErrorDetail(err: unknown): Record<string, unknown> | null {
  const raw = String(err ?? "");
  const start = raw.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(raw.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function PatientVitals() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const token = useAuthStore((s) => s.token);
  const [vitals, setVitals] = useState<Vitals>({ temp: "98.6", hr: "88", spo2: "98", bp: "118/74" });
  const [respRate, setRespRate] = useState("18");
  const [weightKg, setWeightKg] = useState("65");
  const [heightCm, setHeightCm] = useState("170");
  const [summary, setSummary] = useState<NurseSummary | null>(null);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      if (!token || !sessionId) return;
      try {
        const s = await getNursePatientSummary(token, sessionId);
        setSummary(s as NurseSummary);
      } catch {
        setSummary(null);
      }
    };
    void run();
  }, [token, sessionId]);

  const parsedSummary = useMemo(
    () => parseSummary(summary?.intake_summary_preview),
    [summary?.intake_summary_preview]
  );
  const patientName = parsedSummary.name || `Patient ${sessionId.slice(0, 8)}`;
  const patientAge = parsedSummary.age || "--";
  const chiefComplaint =
    parsedSummary["main concern"] ||
    summary?.chief_complaint ||
    "No chief complaint captured yet.";
  const additionalNotes = (parsedSummary["additional details"] || "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

  const handleSubmit = async () => {
    if (!token || !sessionId) {
      setError("Missing session context. Please open vitals from dashboard queue.");
      return;
    }
    const [sysRaw, diaRaw] = vitals.bp.split("/");
    const tempF = Number(vitals.temp);
    const tempC = (tempF - 32) * (5 / 9);
    const basePayload = {
      session_id: sessionId,
      temperature_celsius: Number(tempC.toFixed(2)),
      bp_systolic_mmhg: Number(sysRaw),
      bp_diastolic_mmhg: Number(diaRaw),
      heart_rate_bpm: Number(vitals.hr),
      respiratory_rate_pm: Number(respRate),
      spo2_percent: Number(vitals.spo2),
      weight_kg: Number(weightKg),
      height_cm: Number(heightCm),
      nurse_observation: notes || null,
    };
    setLoading(true);
    setError("");
    try {
      await submitNurseVitals(token, basePayload);
      await verifyNurseIntake(token, sessionId, true, "Vitals captured and intake validated.");
      await markNurseReady(token, sessionId);
      setSubmitted(true);
      setTimeout(() => router.push("/nurse/dashboard"), 1000);
    } catch (e) {
      const detail = parseApiErrorDetail(e);
      if (
        detail?.error === "VITALS_OUTLIER_CONFIRMATION_REQUIRED" &&
        Array.isArray(detail.outlier_flags)
      ) {
        try {
          const confirmations = detail.outlier_flags
            .map((flag) => {
              const f = flag as Record<string, unknown>;
              return { field: String(f.field ?? ""), confirmed: true };
            })
            .filter((x) => x.field);
          await submitNurseVitals(token, {
            ...basePayload,
            outlier_confirmations: confirmations,
          });
          await verifyNurseIntake(token, sessionId, true, "Vitals captured with nurse-confirmed outlier flags.");
          await markNurseReady(token, sessionId);
          setSubmitted(true);
          setTimeout(() => router.push("/nurse/dashboard"), 1000);
        } catch (retryErr) {
          setError(`Failed to submit vitals: ${String(retryErr)}`);
        }
      } else {
        setError(`Failed to submit vitals: ${String(e)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const vitalFields = [
    { key: "temp" as keyof Vitals, label: "TEMPERATURE", unit: "°F", icon: Thermometer, placeholder: "98.6" },
    { key: "hr" as keyof Vitals, label: "HEART RATE", unit: "BPM", icon: Activity, placeholder: "72" },
    { key: "spo2" as keyof Vitals, label: "O2 SATURATION", unit: "%", icon: Wind, placeholder: "98" },
    { key: "bp" as keyof Vitals, label: "BLOOD PRESSURE", unit: "mmHg", icon: Heart, placeholder: "120/80" },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: "#F0F4F8",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>

      {/* Header */}
      <div style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 32px",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: "64px",
        }}>
          {/* Left */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "#4F46E5", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ClipboardList size={16} color="white" />
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>Clinical Zen</div>
              <div style={{ fontSize: "10px", color: "#94A3B8", fontWeight: 500 }}>PROTOCOL FLOW</div>
            </div>
          </div>

          {/* Center indicator */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  border: "2px solid #4F46E5",
                  background: "#4F46E5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Activity size={14} color="white" />
              </div>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#4F46E5",
                  letterSpacing: "0.06em",
                }}
              >
                VITALS
              </span>
            </div>
          </div>

          {/* Doctor info */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>Dr. Marcus Thorne</div>
              <div style={{ fontSize: "11px", color: "#94A3B8" }}>Internal Medicine</div>
            </div>
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User size={18} color="#4F46E5" />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: "1100px", margin: "0 auto", padding: "32px 24px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px",
      }}>

        {/* Left — Patient Info */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "white", borderRadius: "16px",
            border: "1px solid #E5E7EB", padding: "28px",
          }}
        >
          <div style={{ marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em" }}>STAGE 01</span>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0F172A", margin: "0 0 20px" }}>
            Patient Intake
          </h1>

          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", marginBottom: "8px" }}>
              CHIEF COMPLAINT
            </div>
            <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.7, margin: 0 }}>
              {chiefComplaint}
            </p>
          </div>

          {/* Patient card */}
          <div style={{
            background: "#F8FAFC", borderRadius: "12px",
            border: "1px solid #E5E7EB", padding: "14px",
            display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User size={20} color="#4F46E5" />
            </div>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: 0 }}>{patientName}</p>
              <p style={{ fontSize: "12px", color: "#94A3B8", margin: "2px 0 6px" }}>
                {patientAge} yrs • ID: {sessionId ? sessionId.slice(0, 12) : "--"}
              </p>
              <div style={{ display: "flex", gap: "6px" }}>
                {[parsedSummary.location ? `Location: ${parsedSummary.location}` : "Location: --"].map(tag => (
                  <span key={tag} style={{
                    background: "#F1F5F9", color: "#64748B",
                    fontSize: "10px", fontWeight: 600,
                    padding: "3px 8px", borderRadius: "6px",
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Live Session Notes */}
          <div style={{ marginBottom: "6px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", marginBottom: "10px" }}>
              LIVE SESSION NOTES
            </div>
            {(additionalNotes.length > 0 ? additionalNotes : ["No additional notes captured from intake summary yet."]).map((note, i) => (
              <div key={i} style={{
                borderLeft: `3px solid ${i === 0 ? "#4F46E5" : "#E5E7EB"}`,
                paddingLeft: "12px", marginBottom: "10px",
              }}>
                <p style={{ fontSize: "13px", color: i === 0 ? "#374151" : "#6B7280", lineHeight: 1.6, margin: 0 }}>
                  {note}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right — Vitals */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div style={{
            background: "white", borderRadius: "16px",
            border: "1px solid #E5E7EB", padding: "28px", marginBottom: "16px",
          }}>
            <div style={{ marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em" }}>OBJECTIVE DATA</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: 0 }}>Vitals & Biometrics</h2>
              <button style={{
                display: "flex", alignItems: "center", gap: "4px",
                fontSize: "12px", color: "#4F46E5", fontWeight: 600,
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              }}>
                <Activity size={13} /> View Trends
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              {vitalFields.map(field => {
                const status = getStatus(field.key, vitals[field.key]);
                return (
                  <div key={field.key} style={{
                    background: "#F8FAFC", borderRadius: "14px",
                    border: "1px solid #F1F5F9", padding: "16px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em" }}>
                        {field.label}
                      </span>
                      <div style={{
                        width: "8px", height: "8px", borderRadius: "50%",
                        background: statusColor(status),
                      }} />
                    </div>
                    <input
                      value={vitals[field.key]}
                      onChange={e => setVitals(prev => ({ ...prev, [field.key]: e.target.value }))}
                      style={{
                        width: "100%", border: "none", background: "transparent",
                        fontSize: "28px", fontWeight: 800, color: status === "critical" ? "#EF4444" : "#0F172A",
                        outline: "none", fontFamily: "inherit", marginBottom: "4px",
                      }}
                    />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#94A3B8" }}>{field.unit}</span>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: statusColor(status) }}>
                        {status === "critical" ? "↑ " : status === "elevated" ? "~ " : "✓ "}
                        {statusLabel(status)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              {[
                {
                  label: "Respiratory Rate (/min)",
                  hint: "Used for respiratory distress scoring",
                  value: respRate,
                  setter: setRespRate,
                },
                {
                  label: "Weight (kg)",
                  hint: "Used for dose and fluid calculations",
                  value: weightKg,
                  setter: setWeightKg,
                },
                {
                  label: "Height (cm)",
                  hint: "Used for BMI and risk profiling",
                  value: heightCm,
                  setter: setHeightCm,
                },
              ].map((field) => (
                <div key={field.label}>
                  <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "#64748B" }}>
                    {field.label}
                  </p>
                  <input
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #E5E7EB",
                      background: "#F8FAFC",
                      fontSize: "12px",
                    }}
                  />
                  <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#94A3B8" }}>{field.hint}</p>
                </div>
              ))}
            </div>

            {/* Begin AI Analysis */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={loading || submitted}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "center", gap: "8px",
                background: submitted ? "#10B981" : "#4F46E5",
                color: "white", fontWeight: 700, fontSize: "15px",
                padding: "14px", borderRadius: "12px", border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(79,70,229,0.3)",
                fontFamily: "inherit", transition: "all 0.3s",
              }}
            >
              {loading ? (
                <div style={{ width: "18px", height: "18px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              ) : submitted ? (
                <><CheckCircle size={16} /><span>Submitted Successfully</span></>
              ) : (
                <><span>Save Vitals & Ready for Doctor</span><ChevronRight size={16} /></>
              )}
            </motion.button>
            {error ? (
              <p style={{ marginTop: "10px", fontSize: "12px", color: "#B91C1C", fontWeight: 600 }}>
                {error}
              </p>
            ) : null}
          </div>

          {/* Nursing notes */}
          <div style={{
            background: "white", borderRadius: "16px",
            border: "1px solid #E5E7EB", padding: "20px",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", marginBottom: "10px" }}>
              NURSE NOTES
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observable physical distress, gait stability, additional observations..."
              style={{
                width: "100%", minHeight: "80px", padding: "12px",
                borderRadius: "10px", border: "1.5px solid #E5E7EB",
                background: "#F8FAFC", fontSize: "13px", color: "#374151",
                outline: "none", fontFamily: "inherit", resize: "none",
                lineHeight: 1.6,
              }}
            />
          </div>
        </motion.div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
