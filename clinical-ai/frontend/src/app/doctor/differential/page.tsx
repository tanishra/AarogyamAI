"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle,
  CirclePlus,
  Clock3,
  Moon,
  Pencil,
  RotateCcw,
  User,
  X,
} from "lucide-react";
import {
  addDoctorDifferential,
  getDoctorPatientContext,
  getDoctorQueue,
  submitDoctorDifferentialAction,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type QueueItem = Awaited<ReturnType<typeof getDoctorQueue>>["queue"][number];
type DoctorContext = Awaited<ReturnType<typeof getDoctorPatientContext>>;
type DoctorAction = "accepted" | "modified" | "rejected";

export default function DoctorDifferentialPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [context, setContext] = useState<DoctorContext | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [savingActionId, setSavingActionId] = useState<string | null>(null);
  const [modifyTarget, setModifyTarget] = useState<{
    id: string;
    title: string;
    reasoning: string;
  } | null>(null);
  const [modifyText, setModifyText] = useState("");
  const [modifySaving, setModifySaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addReasoning, setAddReasoning] = useState("");
  const [addUrgency, setAddUrgency] = useState<"routine" | "urgent" | "critical">("routine");
  const [addSaving, setAddSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || role !== "doctor") {
      router.replace("/login");
      return;
    }
    let active = true;
    const loadQueue = async () => {
      setLoadingQueue(true);
      setError("");
      try {
        const data = await getDoctorQueue(token);
        if (!active) return;
        setQueue(data.queue);
        const querySession = searchParams.get("session_id") ?? "";
        const resolved =
          data.queue.find((q) => q.session_id === querySession)?.session_id ??
          data.queue[0]?.session_id ??
          "";
        setSelectedSessionId(resolved);
      } catch (e) {
        if (!active) return;
        setError(`Failed to load doctor queue: ${String(e)}`);
      } finally {
        if (active) setLoadingQueue(false);
      }
    };
    void loadQueue();
    return () => {
      active = false;
    };
  }, [token, role, router, searchParams]);

  useEffect(() => {
    if (!token || !selectedSessionId) {
      setContext(null);
      return;
    }
    let active = true;
    const loadContext = async () => {
      setLoadingContext(true);
      setError("");
      try {
        const data = await getDoctorPatientContext(token, selectedSessionId);
        if (!active) return;
        setContext(data);
      } catch (e) {
        if (!active) return;
        setError(`Failed to load patient context: ${String(e)}`);
      } finally {
        if (active) setLoadingContext(false);
      }
    };
    void loadContext();
    return () => {
      active = false;
    };
  }, [token, selectedSessionId]);

  const selectedQueueItem = useMemo(
    () => queue.find((q) => q.session_id === selectedSessionId) ?? null,
    [queue, selectedSessionId]
  );

  const parsed = useMemo(
    () => parseIntakeSummary(context?.intake_summary_preview ?? null),
    [context?.intake_summary_preview]
  );

  const profile = {
    name: sanitizeName(
      context?.patient_name ||
        selectedQueueItem?.patient_name ||
        parsed.name ||
        "Patient"
    ),
    age:
      context?.patient_age ||
      selectedQueueItem?.patient_age ||
      parsed.age ||
      null,
    location:
      context?.patient_location ||
      selectedQueueItem?.patient_location ||
      parsed.location ||
      null,
  };

  const chiefComplaint =
    context?.structured_context?.chief_complaint ||
    selectedQueueItem?.chief_complaint ||
    parsed.mainConcern ||
    "Not available";
  const hpi =
    context?.structured_context?.history_of_present_illness ||
    parsed.details.slice(0, 2).join(" ") ||
    "Not available";
  const insights = [
    ...parsed.details.slice(0, 3),
    ...(context?.nurse_feedback ? [`Nurse note: ${context.nurse_feedback}`] : []),
  ].slice(0, 4);

  const aiScore = useMemo(() => {
    if (!context) return 0;
    let score = 40;
    if (context.structured_context?.chief_complaint) score += 15;
    if (context.vitals_summary) score += 20;
    if ((context.differentials?.length ?? 0) > 0) score += 20;
    if (context.synthesis_ready) score += 5;
    return Math.min(95, score);
  }, [context]);

  const handleAction = async (
    considerationId: string,
    action: DoctorAction
  ) => {
    if (!token || !context || considerationId.startsWith("provisional-")) return;
    if (action === "modified") return;
    setSavingActionId(considerationId);
    setError("");
    try {
      await submitDoctorDifferentialAction(token, considerationId, {
        session_id: context.session_id,
        action,
        modification_text: null,
      });
      setContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          differentials: prev.differentials.map((d) =>
                d.consideration_id === considerationId
                  ? {
                      ...d,
                      doctor_action: action,
                      doctor_modification: null,
                    }
                  : d
              ),
        };
      });
    } catch (e) {
      setError(`Failed to save action: ${String(e)}`);
    } finally {
      setSavingActionId(null);
    }
  };

  const openModify = (
    considerationId: string,
    title: string,
    currentReasoning: string
  ) => {
    setModifyTarget({
      id: considerationId,
      title,
      reasoning: currentReasoning,
    });
    setModifyText(currentReasoning);
  };

  const submitModify = async () => {
    if (!token || !context || !modifyTarget) return;
    const finalText = modifyText.trim();
    if (!finalText) {
      setError("Modification note cannot be empty.");
      return;
    }
    setModifySaving(true);
    setSavingActionId(modifyTarget.id);
    setError("");
    try {
      await submitDoctorDifferentialAction(token, modifyTarget.id, {
        session_id: context.session_id,
        action: "modified",
        modification_text: finalText,
      });
      setContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          differentials: prev.differentials.map((d) =>
            d.consideration_id === modifyTarget.id
              ? {
                  ...d,
                  doctor_action: "modified",
                  doctor_modification: finalText,
                }
              : d
          ),
        };
      });
      setModifyTarget(null);
      setModifyText("");
    } catch (e) {
      setError(`Failed to save action: ${String(e)}`);
    } finally {
      setModifySaving(false);
      setSavingActionId(null);
    }
  };

  const submitAddManual = async () => {
    if (!token || !context) return;
    const title = addTitle.trim();
    const reasoning = addReasoning.trim();
    if (!title || !reasoning) {
      setError("Title and reasoning are required.");
      return;
    }
    setAddSaving(true);
    setError("");
    try {
      const created = await addDoctorDifferential(token, {
        session_id: context.session_id,
        title,
        clinical_reasoning: reasoning,
        urgency_flag: addUrgency,
      });
      setContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          differentials: [
            ...prev.differentials,
            {
              consideration_id: created.consideration_id,
              title,
              supporting_features: [],
              clinical_reasoning: reasoning,
              urgency_flag: addUrgency,
              ai_generated: false,
              doctor_action: "added",
              doctor_modification: null,
              sort_order: prev.differentials.length,
            },
          ],
        };
      });
      setAddOpen(false);
      setAddTitle("");
      setAddReasoning("");
      setAddUrgency("routine");
    } catch (e) {
      setError(`Failed to add consideration: ${String(e)}`);
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F3F6FB", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "20px 22px 24px" }}>
        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "14px", overflow: "hidden" }}>
          <header style={{ height: "62px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 800, fontSize: "12px" }}>CZ</span>
                </div>
                <span style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.03em", color: "#0F172A" }}>
                  CLINICAL<span style={{ color: "#3B82F6" }}>ZEN</span>
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#64748B" }}>
                Patients <span style={{ color: "#CBD5E1", margin: "0 8px" }}>/</span>
                <span style={{ color: "#111827", fontWeight: 600 }}>AI Differential Analysis</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <Moon size={17} color="#64748B" />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>DR. SARAH JENKINS</div>
                <div style={{ fontSize: "11px", color: "#94A3B8" }}>Cardiology Specialist</div>
              </div>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#E0F2FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={16} color="#0284C7" />
              </div>
            </div>
          </header>

          <main style={{ padding: "16px 16px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ background: "#FEE2E2", color: "#DC2626", borderRadius: "6px", padding: "2px 8px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em" }}>
                    {selectedQueueItem?.urgency_flag === "critical" ? "HIGH URGENCY" : "ROUTINE"}
                  </span>
                  <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                    ID: {selectedSessionId ? selectedSessionId.slice(0, 12) : "N/A"}
                  </span>
                </div>
                <h1 style={{ fontSize: "34px", lineHeight: 1.05, fontWeight: 800, color: "#0F172A", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                  Differential Analysis: {profile.name}
                </h1>
                <p style={{ margin: 0, fontSize: "15px", color: "#64748B" }}>
                  AI synthesis based on session {selectedSessionId || "N/A"} and verified intake
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <button
                  onClick={() =>
                    selectedSessionId &&
                    router.push(`/doctor/command?session_id=${selectedSessionId}`)
                  }
                  style={ghostBtn()}
                >
                  <Clock3 size={14} />
                  Open Clinical Command
                </button>
                <button
                  onClick={() =>
                    selectedSessionId &&
                    router.push(`/doctor/treatment?session_id=${selectedSessionId}`)
                  }
                  style={primaryBtn()}
                >
                  Continue to Treatment
                </button>
              </div>
            </div>

            {queue.length > 0 && (
              <div
                style={{
                  marginBottom: "14px",
                  border: "1px solid #E5E7EB",
                  borderRadius: "12px",
                  background: "#FAFCFF",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      color: "#64748B",
                    }}
                  >
                    PATIENT SWITCHER
                  </p>
                  <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                    {queue.length} active patient{queue.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                    gap: "8px",
                  }}
                >
                  {queue.map((q) => {
                    const active = q.session_id === selectedSessionId;
                    return (
                      <button
                        key={q.session_id}
                        onClick={() => setSelectedSessionId(q.session_id)}
                        style={{
                          border: active
                            ? "1.5px solid #3B82F6"
                            : "1px solid #E2E8F0",
                          background: active ? "#EFF6FF" : "white",
                          borderRadius: "10px",
                          padding: "9px 10px",
                          textAlign: "left",
                          cursor: "pointer",
                          boxShadow: active
                            ? "0 4px 12px rgba(37,99,235,0.15)"
                            : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "4px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              color: "#0F172A",
                            }}
                          >
                            {truncate(sanitizeName(q.patient_name || "Patient"), 20)}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color:
                                q.urgency_flag === "critical"
                                  ? "#DC2626"
                                  : q.urgency_flag === "urgent"
                                  ? "#D97706"
                                  : "#64748B",
                            }}
                          >
                            {q.urgency_flag.toUpperCase()}
                          </span>
                        </div>
                        <p
                          style={{
                            margin: "0 0 3px",
                            fontSize: "11px",
                            color: "#64748B",
                          }}
                        >
                          {q.patient_age ? `${q.patient_age} yrs` : "Age N/A"}
                          {q.patient_location ? ` • ${q.patient_location}` : ""}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "12px",
                            color: "#334155",
                            lineHeight: 1.35,
                          }}
                        >
                          {truncate(q.chief_complaint || "No complaint", 56)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <div style={{ marginBottom: "10px", background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <section style={leftCard()}>
                  <h3 style={leftTitle()}>AI SYNTHESIS INPUTS</h3>
                  <Label text="PATIENT PROFILE" />
                  <p style={textP()}>
                    {profile.name}
                    {profile.age ? ` • ${profile.age} yrs` : ""}
                    {profile.location ? ` • ${profile.location}` : ""}
                  </p>

                  <Label text="PRIMARY COMPLAINT (SOURCED)" />
                  <p style={textP()}>{truncate(chiefComplaint, 150)}</p>

                  <Label text="HISTORY OF PRESENT ILLNESS" />
                  <p style={textP()}>{truncate(hpi, 180)}</p>

                  <Label text="VITALS SUMMARY" />
                  {context?.vitals_summary ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                      <VitalPill label="BP" value={`${context.vitals_summary.bp_systolic_mmhg}/${context.vitals_summary.bp_diastolic_mmhg} mmHg`} />
                      <VitalPill label="HR" value={`${context.vitals_summary.heart_rate_bpm} bpm`} />
                      <VitalPill label="Temp" value={`${context.vitals_summary.temperature_celsius.toFixed(1)} C`} />
                      <VitalPill label="SpO2" value={`${context.vitals_summary.spo2_percent}%`} />
                    </div>
                  ) : (
                    <p style={{ ...textP(), marginBottom: "10px" }}>Vitals not available</p>
                  )}

                  <Label text="QUESTIONNAIRE INSIGHTS" />
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {insights.length > 0 ? (
                      insights.map((item, i) => (
                        <p key={`${item}-${i}`} style={{ margin: 0, fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
                          • {truncate(item, 120)}
                        </p>
                      ))
                    ) : (
                      <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>No additional insights.</p>
                    )}
                  </div>
                </section>

                <section style={{ ...leftCard(), background: "#EEF4FF", borderColor: "#C7D7FE" }}>
                  <h3 style={{ ...leftTitle(), color: "#3B82F6" }}>AI CONFIDENCE SCORE</h3>
                  <p style={{ fontSize: "34px", fontWeight: 800, color: "#2563EB", margin: "0 0 8px" }}>{aiScore}%</p>
                  <div style={{ height: "6px", background: "#DBEAFE", borderRadius: "999px", overflow: "hidden", marginBottom: "10px" }}>
                    <div style={{ height: "100%", width: `${aiScore}%`, background: "#2563EB" }} />
                  </div>
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748B", lineHeight: 1.5 }}>
                    Confidence is derived from intake completeness, vitals availability, and differential readiness.
                  </p>
                </section>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <h2 style={{ margin: 0, fontSize: "26px", fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
                    DIFFERENTIAL_CONSIDERATIONS
                  </h2>
                  <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                    {(context?.differentials?.length ?? 0)} Hypotheses Generated
                  </span>
                </div>

                {loadingQueue || loadingContext ? (
                  <BoxState text="Loading live patient analysis..." />
                ) : !selectedSessionId ? (
                  <BoxState text="No patient ready for doctor." />
                ) : (context?.differentials?.length ?? 0) === 0 ? (
                  <BoxState text="Differentials are not available yet." />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {context?.differentials.map((diff, idx) => {
                      const status = diff.doctor_action ?? "pending";
                      const rank = idx === 0 ? "PRIMARY" : idx === 1 ? "SECONDARY" : "TERTIARY";
                      const tag = diff.ai_generated ? "AI GEN" : "DOC MODIFIED";
                      const tone =
                        rank === "PRIMARY"
                          ? { border: "#3B82F6", bg: "#F8FAFF", title: "#2563EB" }
                          : rank === "SECONDARY"
                          ? { border: "#E5E7EB", bg: "#FFFFFF", title: "#6B7280" }
                          : { border: "#E5E7EB", bg: "#FFFEFB", title: "#D97706" };
                      const disabled = savingActionId === diff.consideration_id || diff.consideration_id.startsWith("provisional-");
                      return (
                        <motion.div
                          key={diff.consideration_id}
                          layout
                          style={{
                            border: `1px solid ${tone.border}`,
                            background: tone.bg,
                            borderRadius: "12px",
                            padding: "12px 14px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "14px" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                <span style={{ fontSize: "12px", letterSpacing: "0.07em", fontWeight: 800, color: tone.title }}>
                                  {rank} CONSIDERATION
                                </span>
                                <span style={{ fontSize: "10px", fontWeight: 700, background: "#EFF6FF", color: "#2563EB", borderRadius: "4px", padding: "2px 6px" }}>
                                  {tag}
                                </span>
                              </div>
                              <h3 style={{ margin: "0 0 4px", fontSize: "20px", lineHeight: 1.15, color: "#0F172A", fontWeight: 800 }}>
                                {truncate(diff.title, 64)}
                              </h3>
                              <p style={{ margin: 0, fontSize: "14px", color: "#475569", lineHeight: 1.45 }}>
                                {truncate(
                                  diff.doctor_action === "modified" && diff.doctor_modification
                                  ? diff.doctor_modification
                                  : diff.clinical_reasoning,
                                  220
                                )}
                              </p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "124px" }}>
                              <button
                                onClick={() => handleAction(diff.consideration_id, "accepted")}
                                disabled={disabled}
                                style={status === "accepted" ? primaryBtn() : outlineBtn("#2563EB")}
                              >
                                <CheckCircle size={13} />
                                Accept
                              </button>
                              <button
                                onClick={() =>
                                  openModify(
                                    diff.consideration_id,
                                    diff.title,
                                    diff.doctor_action === "modified" &&
                                      diff.doctor_modification
                                      ? diff.doctor_modification
                                      : diff.clinical_reasoning
                                  )
                                }
                                disabled={disabled}
                                style={outlineBtn("#6B7280")}
                              >
                                <Pencil size={13} />
                                Modify
                              </button>
                              {status !== "pending" && (
                                <button
                                  onClick={() => handleAction(diff.consideration_id, "rejected")}
                                  disabled={disabled}
                                  style={outlineBtn("#9CA3AF")}
                                >
                                  <RotateCcw size={13} />
                                  Revert
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}

                    <button
                      onClick={() => setAddOpen(true)}
                      style={{
                        marginTop: "4px",
                        border: "1px dashed #CBD5E1",
                        borderRadius: "12px",
                        background: "white",
                        color: "#64748B",
                        fontWeight: 700,
                        fontSize: "14px",
                        padding: "12px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                      }}
                    >
                      <CirclePlus size={15} />
                      Add Manual Consideration
                    </button>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
      {addOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.38)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "760px",
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "16px",
              boxShadow: "0 20px 60px rgba(2,6,23,0.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid #E5E7EB",
                background: "#F8FAFF",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: "11px", color: "#2563EB", fontWeight: 800, letterSpacing: "0.07em" }}>
                  ADD MANUAL CONSIDERATION
                </p>
                <p style={{ margin: "3px 0 0", fontSize: "14px", color: "#0F172A", fontWeight: 700 }}>
                  Add a doctor-authored differential point
                </p>
              </div>
              <button
                onClick={() => {
                  if (addSaving) return;
                  setAddOpen(false);
                }}
                style={{
                  border: "1px solid #E5E7EB",
                  background: "white",
                  borderRadius: "8px",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#64748B",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "14px 16px", display: "grid", gap: "10px" }}>
              <input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Title (e.g., Viral Upper Respiratory Infection)"
                style={{
                  border: "1px solid #CBD5E1",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "14px",
                  color: "#334155",
                  outline: "none",
                }}
              />
              <select
                value={addUrgency}
                onChange={(e) =>
                  setAddUrgency(
                    e.target.value as "routine" | "urgent" | "critical"
                  )
                }
                style={{
                  border: "1px solid #CBD5E1",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "14px",
                  color: "#334155",
                  outline: "none",
                  background: "white",
                }}
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critical</option>
              </select>
              <textarea
                value={addReasoning}
                onChange={(e) => setAddReasoning(e.target.value)}
                placeholder="Clinical reasoning"
                style={{
                  width: "100%",
                  minHeight: "160px",
                  border: "1px solid #CBD5E1",
                  borderRadius: "10px",
                  padding: "12px",
                  fontFamily: "inherit",
                  fontSize: "14px",
                  color: "#334155",
                  lineHeight: 1.5,
                  resize: "vertical",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  onClick={() => {
                    if (addSaving) return;
                    setAddOpen(false);
                  }}
                  style={ghostBtn()}
                >
                  Cancel
                </button>
                <button
                  onClick={submitAddManual}
                  disabled={addSaving}
                  style={{
                    ...primaryBtn(),
                    opacity: addSaving ? 0.7 : 1,
                    cursor: addSaving ? "not-allowed" : "pointer",
                  }}
                >
                  {addSaving ? "Adding..." : "Add Consideration"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {modifyTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.38)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "760px",
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "16px",
              boxShadow: "0 20px 60px rgba(2,6,23,0.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid #E5E7EB",
                background: "#F8FAFF",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: "11px", color: "#2563EB", fontWeight: 800, letterSpacing: "0.07em" }}>
                  MODIFY DIFFERENTIAL
                </p>
                <p style={{ margin: "3px 0 0", fontSize: "14px", color: "#0F172A", fontWeight: 700 }}>
                  {truncate(modifyTarget.title, 80)}
                </p>
              </div>
              <button
                onClick={() => {
                  if (modifySaving) return;
                  setModifyTarget(null);
                  setModifyText("");
                }}
                style={{
                  border: "1px solid #E5E7EB",
                  background: "white",
                  borderRadius: "8px",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#64748B",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#64748B" }}>
                Refine the reasoning to improve clinical clarity before saving.
              </p>
              <textarea
                value={modifyText}
                onChange={(e) => setModifyText(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "180px",
                  border: "1px solid #CBD5E1",
                  borderRadius: "10px",
                  padding: "12px",
                  fontFamily: "inherit",
                  fontSize: "14px",
                  color: "#334155",
                  lineHeight: 1.5,
                  resize: "vertical",
                  outline: "none",
                }}
              />
              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  onClick={() => {
                    if (modifySaving) return;
                    setModifyTarget(null);
                    setModifyText("");
                  }}
                  style={ghostBtn()}
                >
                  Cancel
                </button>
                <button
                  onClick={submitModify}
                  disabled={modifySaving}
                  style={{
                    ...primaryBtn(),
                    opacity: modifySaving ? 0.7 : 1,
                    cursor: modifySaving ? "not-allowed" : "pointer",
                  }}
                >
                  {modifySaving ? "Saving..." : "Save Modification"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function leftCard(): React.CSSProperties {
  return {
    background: "white",
    border: "1px solid #E5E7EB",
    borderRadius: "12px",
    padding: "12px 14px",
  };
}

function leftTitle(): React.CSSProperties {
  return {
    margin: "0 0 10px",
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: "0.07em",
    color: "#94A3B8",
  };
}

function textP(): React.CSSProperties {
  return {
    margin: "0 0 10px",
    fontSize: "13px",
    color: "#475569",
    lineHeight: 1.5,
  };
}

function ghostBtn(): React.CSSProperties {
  return {
    border: "1px solid #D1D5DB",
    borderRadius: "10px",
    background: "white",
    color: "#374151",
    fontSize: "13px",
    fontWeight: 700,
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
  };
}

function primaryBtn(): React.CSSProperties {
  return {
    border: "none",
    borderRadius: "10px",
    background: "#2563EB",
    color: "white",
    fontSize: "13px",
    fontWeight: 700,
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(37,99,235,0.25)",
  };
}

function outlineBtn(color: string): React.CSSProperties {
  return {
    border: `1px solid ${color}33`,
    borderRadius: "10px",
    background: "white",
    color,
    fontSize: "13px",
    fontWeight: 700,
    padding: "8px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    cursor: "pointer",
  };
}

function VitalPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", background: "#F8FAFC", padding: "8px 9px" }}>
      <p style={{ margin: "0 0 2px", fontSize: "10px", color: "#94A3B8", fontWeight: 700 }}>{label}</p>
      <p style={{ margin: 0, fontSize: "12px", color: "#111827", fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <p style={{ margin: "0 0 4px", fontSize: "10px", color: "#94A3B8", fontWeight: 800, letterSpacing: "0.06em" }}>
      {text}
    </p>
  );
}

function BoxState({ text }: { text: string }) {
  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: "12px", background: "white", padding: "14px", color: "#64748B", fontSize: "13px" }}>
      {text}
    </div>
  );
}

function parseIntakeSummary(summary: string | null): {
  name: string | null;
  age: number | null;
  location: string | null;
  mainConcern: string | null;
  details: string[];
} {
  const result = {
    name: null as string | null,
    age: null as number | null,
    location: null as string | null,
    mainConcern: null as string | null,
    details: [] as string[],
  };
  if (!summary) return result;

  const parts = summary
    .replace(/\r/g, "\n")
    .split(/\n|•|\|/g)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (!part.includes(":")) continue;
    const [rawKey, ...rest] = part.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!value) continue;

    if (key === "name") result.name = value;
    else if (key === "age") {
      const m = value.match(/\d{1,3}/);
      if (m) result.age = Number(m[0]);
    } else if (key === "location" || key === "city") result.location = value;
    else if (key === "main concern") result.mainConcern = value;
    else if (key.startsWith("detail")) result.details.push(value);
  }

  return result;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function sanitizeName(value: string): string {
  const clean = value.split("|")[0].split(":").slice(-1)[0].trim();
  if (!clean) return "Patient";
  return clean.length > 40 ? truncate(clean, 40) : clean;
}
