"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  Moon,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle,
  Circle,
  Activity,
  Thermometer,
  Heart,
  Wind,
  User,
  Plus,
} from "lucide-react";

import {
  getNursePatientSummary,
  getNurseQueue,
  removeNurseQueuePatient,
  updateNursePatientStatus,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type QueueItem = {
  session_id: string;
  arrival_order: number;
  status: string;
  questionnaire_complete: boolean;
  vitals_submitted: boolean;
  waiting_since: string;
  emergency_flagged: boolean;
};

type SummaryResponse = {
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
};

type DashboardPatient = {
  id: string;
  sessionId: string;
  name: string;
  patientId: string;
  age: number | null;
  complaint: string;
  rawStatus: string;
  waitTime: string;
  queueText: string;
  urgency: "urgent" | "routine";
  color: string;
  vitals: {
    bp: string;
    hr: string | number;
    temp: string | number;
    spo2: string | number;
    rr: string | number;
    weight: string | number;
    height: string | number;
  };
  bpStatus: string;
  hrStatus: string;
  tempStatus: string;
  spo2Status: string;
  rrStatus: string;
  weightStatus: string;
  heightStatus: string;
  consent: string;
  questionnaire: string;
  intake: string;
  nurse: string;
  doctor: string;
  allergies: string[];
  observation: string;
};

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Users, label: "Patients", active: false },
  { icon: FileText, label: "Records", active: false },
  { icon: Settings, label: "Settings", active: false },
];

const statusColor = (status: string) => {
  if (status === "normal") return "#10B981";
  if (status === "elevated") return "#F59E0B";
  if (status === "critical") return "#EF4444";
  return "#10B981";
};

const statusLabel = (status: string) => {
  if (status === "elevated") return "ELEVATED";
  if (status === "critical") return "CRITICAL";
  return "NORMAL RANGE";
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

function waitText(waitingSince: string): string {
  const then = new Date(waitingSince).getTime();
  const now = Date.now();
  const mins = Math.max(0, Math.floor((now - then) / 60000));
  return `${mins}m`;
}

function initialsFromName(name: string): string {
  const words = name.split(" ").filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "PT";
}

function mapPatient(queue: QueueItem, summary: SummaryResponse): DashboardPatient {
  const parsed = parseSummary(summary.intake_summary_preview);
  const name = parsed.name || `Patient ${queue.session_id.slice(0, 8)}`;
  const age = parsed.age ? Number(parsed.age) : null;
  const complaint = parsed["main concern"] || summary.chief_complaint || "Not provided";
  const additional = parsed["additional details"] || "No additional details recorded.";
  const isReadyForDoctor =
    queue.status === "nurse_marked_ready" ||
    queue.status === "synthesis_in_progress" ||
    queue.status === "synthesis_complete" ||
    queue.status === "record_committed";

  const intakeState = isReadyForDoctor
    ? "COMPLETED"
    : queue.vitals_submitted
      ? "IN REVIEW"
      : queue.questionnaire_complete
        ? "PENDING"
        : "NOT STARTED";
  const queueText =
    queue.status === "record_committed"
      ? "Record committed"
      : queue.status === "synthesis_complete"
        ? "Synthesis complete"
        : queue.status === "synthesis_in_progress"
          ? "Doctor handoff in progress"
          : queue.status === "nurse_marked_ready"
            ? "Ready for doctor"
            : queue.vitals_submitted
              ? "Vitals submitted"
              : `Waiting for ${waitText(queue.waiting_since)}`;
  const latestVitals = summary.latest_vitals;
  const tempF = latestVitals
    ? Number((((latestVitals.temperature_celsius * 9) / 5) + 32).toFixed(1))
    : null;
  const bp = latestVitals
    ? `${Math.round(latestVitals.bp_systolic_mmhg)}/${Math.round(latestVitals.bp_diastolic_mmhg)}`
    : "--/--";
  const hr = latestVitals ? Math.round(latestVitals.heart_rate_bpm) : "--";
  const spo2 = latestVitals ? Math.round(latestVitals.spo2_percent) : "--";
  const rr = latestVitals ? Math.round(latestVitals.respiratory_rate_pm) : "--";
  const weight = latestVitals ? Number(latestVitals.weight_kg.toFixed(1)) : "--";
  const height = latestVitals ? Math.round(latestVitals.height_cm) : "--";

  return {
    id: initialsFromName(name),
    sessionId: queue.session_id,
    name,
    patientId: queue.session_id.slice(0, 12),
    age: Number.isFinite(age) ? age : null,
    complaint,
    rawStatus: queue.status,
    waitTime: waitText(queue.waiting_since),
    queueText,
    urgency: queue.emergency_flagged ? "urgent" : "routine",
    color: queue.emergency_flagged ? "#4F46E5" : "#64748B",
    vitals: { bp, hr, temp: tempF ?? "--", spo2, rr, weight, height },
    bpStatus: latestVitals && latestVitals.bp_systolic_mmhg >= 140 ? "elevated" : "normal",
    hrStatus: latestVitals && (latestVitals.heart_rate_bpm > 100 || latestVitals.heart_rate_bpm < 60) ? "elevated" : "normal",
    tempStatus: latestVitals && latestVitals.temperature_celsius > 37.5 ? "elevated" : "normal",
    spo2Status: latestVitals && latestVitals.spo2_percent < 95 ? "elevated" : "normal",
    rrStatus: latestVitals && (latestVitals.respiratory_rate_pm > 20 || latestVitals.respiratory_rate_pm < 12) ? "elevated" : "normal",
    weightStatus: "normal",
    heightStatus: "normal",
    consent: "TIER 1 SIGNED",
    questionnaire: queue.questionnaire_complete ? "COMPLETED" : "IN PROGRESS",
    intake: intakeState,
    nurse: "Assigned Nurse",
    doctor: "Assigned Doctor",
    allergies: ["None known"],
    observation: latestVitals?.nurse_observation || `${summary.chief_complaint || "No complaint"}. ${additional}`,
  };
}

export default function NurseDashboard() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [patients, setPatients] = useState<DashboardPatient[]>([]);
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState("questionnaire_in_progress");
  const [error, setError] = useState("");

  const refreshDashboard = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const queueRes = await getNurseQueue(token);
      const queue = queueRes.queue as QueueItem[];
      const summaries = await Promise.all(
        queue.map(async (q) => {
          try {
            const s = await getNursePatientSummary(token, q.session_id);
            return s as SummaryResponse;
          } catch {
            return {
              session_id: q.session_id,
              chief_complaint: "Not provided",
              emergency_flagged: q.emergency_flagged,
              vitals_submitted: false,
              intake_summary_preview: "",
              intake_verified: undefined,
            } as SummaryResponse;
          }
        })
      );
      const mapped = queue.map((q, i) => mapPatient(q, summaries[i]));
      setPatients(mapped);
      setSelected(0);
    } catch (e) {
      setError(`Failed to load dashboard: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const handleRemoveFromQueue = async () => {
    if (!token || !selectedPatient || removing) return;
    setRemoving(true);
    setError("");
    try {
      await removeNurseQueuePatient(token, selectedPatient.sessionId, "removed_by_nurse_dashboard");
      await refreshDashboard();
    } catch (e) {
      setError(`Failed to remove patient: ${String(e)}`);
    } finally {
      setRemoving(false);
    }
  };

  const filtered = useMemo(
    () => patients.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [patients, search]
  );

  const selectedPatient = filtered[selected] ?? filtered[0] ?? patients[0];

  useEffect(() => {
    if (!selectedPatient) return;
    setStatusDraft(selectedPatient.rawStatus);
  }, [selectedPatient]);

  const handleUpdateStatus = async () => {
    if (!token || !selectedPatient || !statusDraft || updatingStatus) return;
    setUpdatingStatus(true);
    setError("");
    try {
      await updateNursePatientStatus(token, {
        session_id: selectedPatient.sessionId,
        status: statusDraft,
        reason: "updated_from_nurse_dashboard",
      });
      await refreshDashboard();
    } catch (e) {
      setError(`Failed to update status: ${String(e)}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 8% 10%, rgba(30,64,175,0.14), transparent 28%), radial-gradient(circle at 92% 0%, rgba(14,165,233,0.18), transparent 30%), #EEF3F9",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: "70px",
          background: "linear-gradient(180deg, #0F172A, #1E3A8A)",
          borderRight: "1px solid rgba(255,255,255,0.12)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "20px 0",
          gap: "8px",
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 50,
          boxShadow: "0 16px 38px rgba(15,23,42,0.35)",
        }}
      >
        <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: "linear-gradient(135deg, #2563EB, #38BDF8)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px", boxShadow: "0 8px 18px rgba(37,99,235,0.45)" }}>
          <Plus size={18} color="white" />
        </div>
        {navItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <button key={i} style={{ width: "44px", height: "44px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: item.active ? "rgba(255,255,255,0.2)" : "transparent", border: "none", cursor: "pointer", color: item.active ? "#FFFFFF" : "rgba(203,213,225,0.9)", transition: "all 0.2s" }}>
              <Icon size={20} />
            </button>
          );
        })}
        <button onClick={() => setDark(!dark)} style={{ marginTop: "auto", width: "44px", height: "44px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "rgba(203,213,225,0.9)" }}>
          <Moon size={20} />
        </button>
      </div>

      <div style={{ marginLeft: "70px", display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ width: "320px", background: "rgba(255,255,255,0.88)", borderRight: "1px solid #DDE6F0", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, backdropFilter: "blur(4px)" }}>
          <div style={{ padding: "22px 20px 14px", borderBottom: "1px solid #E8EEF5", background: "linear-gradient(180deg, rgba(248,250,252,0.95), rgba(255,255,255,0.9))" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", margin: 0 }}>Patient Queue</h2>
              <span style={{ background: "#E0F2FE", color: "#0369A1", fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px", border: "1px solid #BAE6FD" }}>{patients.length} Active</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748B", margin: "0 0 12px" }}>Clinical Zen nurse monitoring queue</p>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
              <input placeholder="Find patient..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: "10px", border: "1.5px solid #D6DFEB", background: "white", fontSize: "13px", color: "#0F172A", outline: "none", fontFamily: "inherit", boxShadow: "0 3px 10px rgba(15,23,42,0.04)" }} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
            {loading ? <p style={{ fontSize: "12px", color: "#94A3B8" }}>Loading patients...</p> : null}
            {!loading && filtered.length === 0 ? <p style={{ fontSize: "12px", color: "#94A3B8" }}>No patient records available.</p> : null}
            {filtered.map((p, i) => (
              <motion.div key={p.sessionId} whileTap={{ scale: 0.98 }} onClick={() => setSelected(i)} style={{ padding: "14px", borderRadius: "14px", marginBottom: "10px", cursor: "pointer", transition: "all 0.2s", background: selected === i ? "linear-gradient(135deg, #1D4ED8, #2563EB)" : "rgba(255,255,255,0.95)", border: selected === i ? "none" : "1.5px solid #E3EAF3", position: "relative", boxShadow: selected === i ? "0 12px 24px rgba(37,99,235,0.32)" : "0 6px 14px rgba(15,23,42,0.06)" }}>
                {p.urgency === "urgent" && selected !== i ? <span style={{ position: "absolute", top: "10px", right: "10px", background: "#FEE2E2", color: "#DC2626", fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.05em" }}>URGENT</span> : null}
                {p.urgency === "routine" && selected !== i ? <span style={{ position: "absolute", top: "10px", right: "10px", background: "#F1F5F9", color: "#64748B", fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.05em" }}>ROUTINE</span> : null}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: selected === i ? "rgba(255,255,255,0.2)" : "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: selected === i ? "white" : "#4F46E5", flexShrink: 0 }}>{p.id}</div>
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 700, margin: 0, color: selected === i ? "white" : "#0F172A" }}>{p.name}</p>
                    <p style={{ fontSize: "11px", margin: "2px 0 0", color: selected === i ? "rgba(255,255,255,0.7)" : "#94A3B8" }}>ID: {p.patientId}{p.age ? ` • Age ${p.age}` : ""}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "8px" }}>
                  <Clock size={11} color={selected === i ? "rgba(255,255,255,0.6)" : "#94A3B8"} />
                  <span style={{ fontSize: "11px", color: selected === i ? "rgba(255,255,255,0.6)" : "#94A3B8" }}>{p.queueText}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
          {error ? <p style={{ color: "#B91C1C", fontSize: "13px" }}>{error}</p> : null}
          {!selectedPatient ? (
            <p style={{ color: "#64748B", fontSize: "14px" }}>No patient selected.</p>
          ) : (
            <motion.div key={selectedPatient.sessionId} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
              <div style={{ background: "linear-gradient(180deg, #FFFFFF, #F8FAFC)", borderRadius: "18px", border: "1px solid #E2E8F0", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", boxShadow: "0 12px 24px rgba(15,23,42,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#E0E7FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <User size={24} color="#3730A3" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: 0 }}>{selectedPatient.name}</h1>
                    <p style={{ fontSize: "13px", color: "#475569", margin: "3px 0 0" }}>Chief Complaint: {selectedPatient.complaint}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderRadius: "10px", border: "1px solid #CBD5E1", background: "white", fontSize: "13px", fontWeight: 600, color: "#334155", cursor: "pointer", fontFamily: "inherit" }}>
                    <Clock size={14} /> View History
                  </button>
                  <button onClick={() => router.push(`/nurse/vitals?session_id=${selectedPatient.sessionId}`)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 20px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, #0EA5E9, #1D4ED8)", fontSize: "13px", fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 16px rgba(14,165,233,0.32)" }}>
                    <CheckCircle size={14} /> Take Vitals
                  </button>
                  <button onClick={handleRemoveFromQueue} disabled={removing} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderRadius: "10px", border: "1px solid #FECACA", background: "#FEF2F2", fontSize: "13px", fontWeight: 700, color: "#B91C1C", cursor: removing ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: removing ? 0.7 : 1 }}>
                    <AlertTriangle size={14} /> {removing ? "Removing..." : "Remove"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", background: "rgba(255,255,255,0.9)", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "12px 14px", boxShadow: "0 6px 14px rgba(15,23,42,0.06)" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#1E3A8A" }}>Current Status</span>
                <select
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  style={{
                    border: "1px solid #BFDBFE",
                    borderRadius: "10px",
                    padding: "8px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#0F172A",
                    background: "#F8FBFF",
                  }}
                >
                  <option value="questionnaire_in_progress">Questionnaire In Progress</option>
                  <option value="questionnaire_complete">Questionnaire Complete</option>
                  <option value="nurse_marked_ready">Nurse Marked Ready</option>
                  <option value="synthesis_in_progress">Synthesis In Progress</option>
                  <option value="synthesis_complete">Synthesis Complete</option>
                  <option value="synthesis_fallback">Synthesis Fallback</option>
                  <option value="record_committed">Record Committed</option>
                  <option value="queue_removed">Queue Removed</option>
                </select>
                <button
                  onClick={handleUpdateStatus}
                  disabled={updatingStatus}
                  style={{
                    border: "none",
                    borderRadius: "10px",
                    padding: "9px 12px",
                    background: "linear-gradient(135deg, #1D4ED8, #2563EB)",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: updatingStatus ? "not-allowed" : "pointer",
                    opacity: updatingStatus ? 0.7 : 1,
                    boxShadow: "0 8px 16px rgba(37,99,235,0.28)",
                  }}
                >
                  {updatingStatus ? "Updating..." : "Update Status"}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "20px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                      <Activity size={16} color="#4F46E5" />
                      <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: 0 }}>Vitals Record</h3>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      {[
                        { label: "BLOOD PRESSURE", value: selectedPatient.vitals.bp, unit: "mmHg", status: selectedPatient.bpStatus, icon: Heart },
                        { label: "HEART RATE", value: selectedPatient.vitals.hr, unit: "BPM", status: selectedPatient.hrStatus, icon: Activity },
                        { label: "BODY TEMP", value: selectedPatient.vitals.temp, unit: "°F", status: selectedPatient.tempStatus, icon: Thermometer },
                        { label: "SPO2", value: selectedPatient.vitals.spo2, unit: "%", status: selectedPatient.spo2Status, icon: Wind },
                        { label: "RESP RATE", value: selectedPatient.vitals.rr, unit: "/min", status: selectedPatient.rrStatus, icon: Activity },
                        { label: "WEIGHT", value: selectedPatient.vitals.weight, unit: "kg", status: selectedPatient.weightStatus, icon: User },
                        { label: "HEIGHT", value: selectedPatient.vitals.height, unit: "cm", status: selectedPatient.heightStatus, icon: User },
                      ].map((vital, i) => (
                        <div key={i} style={{ background: "#F8FAFC", borderRadius: "12px", padding: "16px", border: "1px solid #F1F5F9" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em" }}>{vital.label}</span>
                            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor(vital.status) }} />
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                            <span style={{ fontSize: "28px", fontWeight: 800, color: "#0F172A", lineHeight: 1 }}>{vital.value}</span>
                            <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 500 }}>{vital.unit}</span>
                          </div>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: statusColor(vital.status), marginTop: "4px", display: "block" }}>{vital.status === "elevated" ? "↑ " : "✓ "}{statusLabel(vital.status)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                      <FileText size={16} color="#4F46E5" />
                      <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: 0 }}>Nursing Observation</h3>
                    </div>
                    <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.7, margin: 0 }}>{selectedPatient.observation}</p>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "18px" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 14px" }}>Session Status</h3>
                    {[
                      { label: "Consent Forms", value: selectedPatient.consent, done: selectedPatient.consent.includes("SIGNED") },
                      { label: "Questionnaire", value: selectedPatient.questionnaire, done: selectedPatient.questionnaire === "COMPLETED" },
                      {
                        label: "Intake Vitals",
                        value: selectedPatient.intake,
                        done: selectedPatient.intake === "COMPLETED",
                        active: selectedPatient.intake === "IN REVIEW",
                      },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", marginBottom: "6px", border: item.active ? "1.5px solid #4F46E5" : "1.5px solid transparent", background: item.active ? "#EEF2FF" : "#F8FAFC" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {item.done ? <CheckCircle size={15} color="#10B981" /> : item.active ? <Circle size={15} color="#4F46E5" fill="#4F46E5" /> : <Circle size={15} color="#CBD5E1" />}
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>{item.label}</span>
                        </div>
                        <span style={{ fontSize: "9px", fontWeight: 700, color: item.done ? "#10B981" : item.active ? "#4F46E5" : "#94A3B8", letterSpacing: "0.06em" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "18px" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>Assigned Clinic Team</h3>
                    {[
                      { initials: "RN", name: selectedPatient.nurse, role: "Lead Nurse (You)", color: "#4F46E5" },
                      { initials: "MD", name: selectedPatient.doctor, role: "On-call Physician", color: "#2563EB" },
                    ].map((member, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: i === 0 ? "10px" : 0 }}>
                        <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: member.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: member.color, flexShrink: 0 }}>{member.initials}</div>
                        <div>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", margin: 0 }}>{member.name}</p>
                          <p style={{ fontSize: "11px", color: "#94A3B8", margin: "1px 0 0" }}>{member.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedPatient.allergies[0] !== "None known" ? (
                    <div style={{ background: "#FFFBEB", borderRadius: "16px", border: "1.5px solid #FDE68A", padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                        <AlertTriangle size={14} color="#D97706" />
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#D97706" }}>Active Allergy Alerts</span>
                      </div>
                      {selectedPatient.allergies.map((a, i) => (
                        <p key={i} style={{ fontSize: "12px", color: "#92400E", margin: "2px 0", fontWeight: 500 }}>• {a}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
