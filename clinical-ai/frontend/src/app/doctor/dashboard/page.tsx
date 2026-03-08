"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Clock3,
  Heart,
  HeartPulse,
  History,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Thermometer,
  User,
} from "lucide-react";
import { getDoctorPatientContext, getDoctorQueue } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type QueueItem = Awaited<ReturnType<typeof getDoctorQueue>>["queue"][number];
type DoctorContext = Awaited<ReturnType<typeof getDoctorPatientContext>>;

export default function DoctorDashboardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [context, setContext] = useState<DoctorContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState("");

  const refreshQueue = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await getDoctorQueue(token, { includeCompleted: true });
      setQueue(res.queue);
      const requested = params.get("session_id") ?? "";
      const activeFirst =
        res.queue.find((q) => q.session_status !== "record_committed")
          ?.session_id ?? "";
      const first = activeFirst || res.queue[0]?.session_id || "";
      const resolved =
        res.queue.find((q) => q.session_id === requested)?.session_id ?? first;
      setSelectedSessionId((prev) => prev || resolved);
    } catch (e) {
      setError(`Failed to load doctor queue: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    if (!token || role !== "doctor") {
      router.replace("/login");
      return;
    }
    void refreshQueue();
  }, [token, role, router, refreshQueue]);

  useEffect(() => {
    if (!token || !selectedSessionId) {
      setContext(null);
      return;
    }
    let active = true;
    const run = async () => {
      setLoadingContext(true);
      try {
        const ctx = await getDoctorPatientContext(token, selectedSessionId);
        if (!active) return;
        setContext(ctx);
      } catch {
        if (!active) return;
        setContext(null);
      } finally {
        if (active) setLoadingContext(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [token, selectedSessionId]);

  const selected = useMemo(
    () => queue.find((q) => q.session_id === selectedSessionId) ?? null,
    [queue, selectedSessionId]
  );

  const activeSessions = useMemo(
    () => queue.filter((q) => q.session_status !== "record_committed"),
    [queue]
  );
  const completedSessions = useMemo(
    () => queue.filter((q) => q.session_status === "record_committed"),
    [queue]
  );

  return (
    <div className="page">
      <div className="container">
        <header className="topbar">
          <div className="brand">
            <div className="logoBox">
              <Stethoscope size={18} />
            </div>
            <div>
              <p className="tag">CLINICAL ZEN</p>
              <h1>Doctor Dashboard</h1>
            </div>
          </div>

          <div className="topActions">
            <button
              onClick={() =>
                router.push(
                  selectedSessionId
                    ? `/doctor/history?session_id=${selectedSessionId}`
                    : "/doctor/history"
                )
              }
              className="historyBtn"
            >
              <History size={14} />
              Patient History
            </button>
            <button onClick={() => void refreshQueue()} className="refreshBtn">
              <RefreshCw size={14} />
              Refresh
            </button>
            <div className="avatar">
              <User size={14} />
            </div>
          </div>
        </header>

        {error && <div className="errorBox">{error}</div>}

        <div className="layout">
          <aside className="queueCard">
            <div className="sectionHead">
              <h2>Doctor Queue</h2>
              <span>{queue.length} sessions</span>
            </div>

            {loading ? (
              <p className="muted">Loading patients...</p>
            ) : queue.length === 0 ? (
              <p className="muted">No sessions ready.</p>
            ) : (
              <div className="queueList">
                {activeSessions.map((q) => {
                  const active = q.session_id === selectedSessionId;
                  return (
                    <button
                      key={q.session_id}
                      onClick={() => setSelectedSessionId(q.session_id)}
                      className={`queueItem ${active ? "active" : ""}`}
                    >
                      <div className="itemRow">
                        <p className="patientName">{q.patient_name || "Patient"}</p>
                        <span className={`urgency ${q.urgency_flag}`}>{q.urgency_flag}</span>
                      </div>
                      <p className="patientMeta">
                        {q.patient_age ? `${q.patient_age} yrs` : "Age N/A"}
                        {q.patient_location ? ` • ${q.patient_location}` : ""}
                      </p>
                      <p className="complaint">{q.chief_complaint || "No complaint"}</p>
                    </button>
                  );
                })}

                {completedSessions.length > 0 && (
                  <div className="completedBlock">
                    <p className="completedTitle">Completed Sessions</p>
                    <div className="completedList">
                      {completedSessions.map((q) => {
                        const active = q.session_id === selectedSessionId;
                        return (
                          <button
                            key={q.session_id}
                            onClick={() => setSelectedSessionId(q.session_id)}
                            className={`queueItem ${active ? "active" : ""}`}
                          >
                            <div className="itemRow">
                              <p className="patientName">{q.patient_name || "Patient"}</p>
                              <span className="urgency completed">completed</span>
                            </div>
                            <p className="patientMeta">
                              {q.patient_age ? `${q.patient_age} yrs` : "Age N/A"}
                              {q.patient_location ? ` • ${q.patient_location}` : ""}
                            </p>
                            <p className="complaint">{q.chief_complaint || "No complaint"}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>

          <section className="detailCard">
            {!selected ? (
              <p className="muted">Select a patient from queue.</p>
            ) : (
              <>
                <div className="hero">
                  <p className="heroTag">NEXT APPOINTMENT</p>
                  <h3>{selected.patient_name || "Patient"}</h3>
                  <p className="heroMeta">
                    Session {selected.session_id.slice(0, 12)} • {selected.patient_age || "N/A"} yrs
                    {selected.patient_location ? ` • ${selected.patient_location}` : ""}
                  </p>

                  <div className="heroActions">
                    <button
                      onClick={() => router.push(`/doctor/command?session_id=${selected.session_id}`)}
                      className="primaryBtn"
                    >
                      Start Clinical Command
                      <ArrowRight size={14} />
                    </button>
                    <button
                      onClick={() =>
                        router.push(`/doctor/differential?session_id=${selected.session_id}`)
                      }
                      className="secondaryBtn"
                    >
                      Open Differential
                    </button>
                  </div>
                </div>

                <div className="statusGrid">
                  <StatusCell
                    icon={<Sparkles size={12} />}
                    label="Synthesis"
                    value={selected.synthesis_ready ? "Ready" : "Pending"}
                  />
                  <StatusCell
                    icon={<Clock3 size={12} />}
                    label="Queue Timing"
                    value={new Date(selected.ready_since).toLocaleString()}
                  />
                  <StatusCell
                    icon={<Clock3 size={12} />}
                    label="Urgency"
                    value={selected.urgency_flag.toUpperCase()}
                  />
                </div>

                <div className="snapshot">
                  <p className="snapshotTitle">Nurse Intake &amp; Vitals Snapshot</p>

                  {loadingContext ? (
                    <p className="muted">Loading context...</p>
                  ) : (
                    <>
                      <p className="summaryText">
                        {context?.intake_summary_preview || "No intake summary available."}
                      </p>
                      <div className="vitalsGrid">
                        <VitalCell
                          icon={<HeartPulse size={14} />}
                          label="BP"
                          value={
                            context?.vitals_summary
                              ? `${context.vitals_summary.bp_systolic_mmhg}/${context.vitals_summary.bp_diastolic_mmhg}`
                              : "--/--"
                          }
                        />
                        <VitalCell
                          icon={<Heart size={14} />}
                          label="Heart Rate"
                          value={
                            context?.vitals_summary
                              ? `${context.vitals_summary.heart_rate_bpm} bpm`
                              : "-- bpm"
                          }
                        />
                        <VitalCell
                          icon={<Thermometer size={14} />}
                          label="Temp"
                          value={
                            context?.vitals_summary
                              ? `${context.vitals_summary.temperature_celsius.toFixed(1)} °C`
                              : "-- °C"
                          }
                        />
                        <VitalCell
                          icon={<Activity size={14} />}
                          label="SpO2"
                          value={
                            context?.vitals_summary
                              ? `${context.vitals_summary.spo2_percent}%`
                              : "--%"
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: linear-gradient(160deg, #eef4fb, #f4f7fb 55%, #edf2f8);
          padding: 20px;
          font-family: "Plus Jakarta Sans", sans-serif;
          color: #1f2937;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          gap: 14px;
        }
        .topbar {
          background: #ffffff;
          border: 1px solid #dde6f2;
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logoBox {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #2563eb;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tag {
          margin: 0;
          font-size: 10px;
          letter-spacing: 0.12em;
          font-weight: 800;
          color: #2563eb;
        }
        h1 {
          margin: 2px 0 0;
          font-size: 26px;
          line-height: 1;
          letter-spacing: -0.02em;
          color: #0f172a;
        }
        .topActions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .refreshBtn {
          border: 1px solid #dbe4f0;
          background: #fff;
          color: #334155;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .historyBtn {
          border: 1px solid #dbe4f0;
          background: #fff;
          color: #334155;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .avatar {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .errorBox {
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #b91c1c;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 600;
        }
        .layout {
          display: grid;
          grid-template-columns: 340px minmax(0, 1fr);
          gap: 14px;
        }
        .queueCard,
        .detailCard {
          background: #fff;
          border: 1px solid #dde6f2;
          border-radius: 14px;
          padding: 14px;
        }
        .sectionHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .sectionHead h2 {
          margin: 0;
          font-size: 18px;
          color: #0f172a;
        }
        .sectionHead span {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }
        .queueList {
          display: grid;
          gap: 8px;
          max-height: 66vh;
          overflow: auto;
          padding-right: 2px;
        }
        .completedBlock {
          margin-top: 8px;
          border-top: 1px solid #e2e8f0;
          padding-top: 10px;
        }
        .completedTitle {
          margin: 0 0 8px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
          font-weight: 700;
        }
        .completedList {
          display: grid;
          gap: 8px;
        }
        .queueItem {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
          text-align: left;
          background: #fff;
          cursor: pointer;
        }
        .queueItem.active {
          border-color: #3b82f6;
          background: #eff6ff;
        }
        .itemRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .patientName {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .urgency {
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 700;
          border-radius: 999px;
          padding: 2px 8px;
        }
        .urgency.routine {
          background: #e2e8f0;
          color: #475569;
        }
        .urgency.urgent {
          background: #ffedd5;
          color: #b45309;
        }
        .urgency.critical {
          background: #fee2e2;
          color: #b91c1c;
        }
        .urgency.completed {
          background: #dcfce7;
          color: #166534;
        }
        .patientMeta {
          margin: 5px 0 0;
          font-size: 12px;
          color: #64748b;
        }
        .complaint {
          margin: 5px 0 0;
          font-size: 12px;
          color: #334155;
          line-height: 1.35;
        }
        .hero {
          border-radius: 12px;
          background: linear-gradient(90deg, #1d4ed8, #3b82f6);
          color: #fff;
          padding: 16px;
        }
        .heroTag {
          margin: 0;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #dbeafe;
        }
        .hero h3 {
          margin: 6px 0 3px;
          font-size: 34px;
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .heroMeta {
          margin: 0;
          color: #dbeafe;
          font-size: 13px;
        }
        .heroActions {
          margin-top: 12px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .primaryBtn,
        .secondaryBtn {
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .primaryBtn {
          border: none;
          background: #fff;
          color: #1d4ed8;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .secondaryBtn {
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(30, 64, 175, 0.35);
          color: #fff;
        }
        .statusGrid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
        }
        .snapshot {
          margin-top: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #f8fafc;
          padding: 12px;
        }
        .snapshotTitle {
          margin: 0 0 8px;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .summaryText {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: #334155;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px;
          white-space: pre-wrap;
        }
        .vitalsGrid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .muted {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        @media (max-width: 1024px) {
          .layout {
            grid-template-columns: 1fr;
          }
          .queueList {
            max-height: 320px;
          }
        }
        @media (max-width: 768px) {
          .page {
            padding: 12px;
          }
          h1 {
            font-size: 22px;
          }
          .hero h3 {
            font-size: 30px;
          }
          .statusGrid,
          .vitalsGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function StatusCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div style={{ padding: "10px", borderRight: "1px solid #E2E8F0" }}>
      <p
        style={{
          margin: "0 0 4px",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#64748B",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        {icon}
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "13px", color: "#0F172A", fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function VitalCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #E2E8F0",
        borderRadius: "8px",
        background: "white",
        padding: "10px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: "#2563EB",
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <p
        style={{
          margin: "0 0 2px",
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#64748B",
        }}
      >
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "13px", color: "#0F172A", fontWeight: 700 }}>{value}</p>
    </div>
  );
}
