"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileText,
  Save,
  Sparkles,
  Stethoscope,
  User,
} from "lucide-react";
import { getDoctorPatientContext, getDoctorQueue } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type QueueItem = Awaited<ReturnType<typeof getDoctorQueue>>["queue"][number];
type DoctorContext = Awaited<ReturnType<typeof getDoctorPatientContext>>;
type SoapKey = "S" | "O" | "A" | "P";

export default function SmartNotePage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  const [sessionId, setSessionId] = useState("");
  const [queueItem, setQueueItem] = useState<QueueItem | null>(null);
  const [context, setContext] = useState<DoctorContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<SoapKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [sections, setSections] = useState<Record<SoapKey, string>>({
    S: "",
    O: "",
    A: "",
    P: "",
  });

  useEffect(() => {
    if (!token || role !== "doctor") {
      router.replace("/login");
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const queue = await getDoctorQueue(token);
        const requested = params.get("session_id") ?? "";
        const resolved =
          queue.queue.find((q) => q.session_id === requested)?.session_id ??
          queue.queue[0]?.session_id ??
          "";
        if (!resolved) {
          if (active) {
            setSessionId("");
            setQueueItem(null);
            setContext(null);
            setSections({
              S: "No patient ready for doctor.",
              O: "No vitals available.",
              A: "No differential analysis available.",
              P: "No plan available.",
            });
          }
          return;
        }
        const selectedQueue =
          queue.queue.find((q) => q.session_id === resolved) ?? null;
        const ctx = await getDoctorPatientContext(token, resolved);
        if (!active) return;
        setSessionId(resolved);
        setQueueItem(selectedQueue);
        setContext(ctx);

        const parsed = parseIntakeSummary(ctx.intake_summary_preview ?? null);
        setSections(buildSoapSections(ctx, selectedQueue, parsed));
      } catch (e) {
        if (!active) return;
        setError(`Failed to load smart note context: ${String(e)}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [token, role, router, params]);

  const parsedSummary = useMemo(
    () => parseIntakeSummary(context?.intake_summary_preview ?? null),
    [context?.intake_summary_preview]
  );

  const profile = {
    name:
      context?.patient_name ||
      queueItem?.patient_name ||
      parsedSummary.name ||
      "Patient",
    age: context?.patient_age || queueItem?.patient_age || parsedSummary.age || null,
    location:
      context?.patient_location ||
      queueItem?.patient_location ||
      parsedSummary.location ||
      null,
  };

  const sectionMeta: Array<{
    key: SoapKey;
    label: string;
    dot: string;
  }> = [
    { key: "S", label: "SUBJECTIVE", dot: "#3B82F6" },
    { key: "O", label: "OBJECTIVE", dot: "#8B5CF6" },
    { key: "A", label: "ASSESSMENT", dot: "#D97706" },
    { key: "P", label: "PLAN", dot: "#059669" },
  ];

  const highlights = useMemo(() => {
    const list: string[] = [];
    if (queueItem?.chief_complaint) list.push(queueItem.chief_complaint);
    if (context?.nurse_feedback) list.push(`Nurse: ${context.nurse_feedback}`);
    if (parsedSummary.details.length > 0) list.push(...parsedSummary.details.slice(0, 2));
    return list.slice(0, 3);
  }, [queueItem?.chief_complaint, context?.nurse_feedback, parsedSummary.details]);

  return (
    <div style={{ minHeight: "100vh", background: "#F2F4F8", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: "28px 24px 36px" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div style={{ background: "#F8FAFC", border: "1px solid #E9EEF5", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
          <header style={{ minHeight: "72px", borderBottom: "1px solid #E9EEF5", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#FFFFFF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "#E0E7FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Stethoscope size={15} color="#3B82F6" />
              </div>
              <span style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.02em", color: "#111827" }}>Clinical Zen</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>Dr. Sarah Smith</div>
                <div style={{ fontSize: "10px", color: "#94A3B8", fontWeight: 700 }}>ATTENDING PHYSICIAN</div>
              </div>
              <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={15} color="#1D4ED8" />
              </div>
            </div>
          </header>

          <main style={{ padding: "22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#94A3B8", fontWeight: 800, letterSpacing: "0.08em" }}>
                  CLINICAL WORKFLOW › DOCUMENTATION › STAGE 5: SMART NOTE
                </p>
                <h1 style={{ margin: 0, fontSize: "52px", lineHeight: 1.04, fontWeight: 800, color: "#111827" }}>
                  Final Documentation Review
                </h1>
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: "10px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 330px", gap: "18px", alignItems: "start" }}>
              <section style={{ background: "white", border: "1px solid #ECF0F5", borderRadius: "16px", padding: "22px 22px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
                  <div>
                    <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                      <span style={badge("#DCFCE7", "#15803D")}>AI STRUCTURED</span>
                      <span style={badge("#DBEAFE", "#1D4ED8")}>SOAP FORMAT</span>
                    </div>
                    <h2 style={{ margin: "0 0 8px", fontSize: "50px", lineHeight: 1.04, fontWeight: 800, color: "#111827" }}>
                      Patient Encounter Note
                    </h2>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "12px", color: "#64748B", flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <User size={12} />
                        {profile.name}
                        {profile.age ? ` (${profile.age}Y)` : ""}
                        {profile.location ? ` • ${profile.location}` : ""}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Calendar size={12} />
                        {new Date().toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSaved(true);
                      if (sessionId) router.push(`/doctor/treatment?session_id=${sessionId}`);
                    }}
                    disabled={!sessionId}
                    style={{
                      border: "none",
                      borderRadius: "10px",
                      background: saved ? "#16A34A" : "#2563EB",
                      color: "white",
                      fontSize: "13px",
                      fontWeight: 700,
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: sessionId ? "pointer" : "not-allowed",
                      opacity: sessionId ? 1 : 0.6,
                    }}
                  >
                    {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                    Save & Continue
                  </button>
                </div>

                {loading ? (
                  <p style={{ margin: "10px 0 0", fontSize: "13px", color: "#64748B" }}>
                    Loading live patient context...
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "38px", marginTop: "20px" }}>
                    {sectionMeta.map((s) => {
                      const isEditing = editingKey === s.key;
                      return (
                        <div key={s.key} style={{ background: "transparent", paddingBottom: "2px" }}>
                          <div style={{ padding: "0 0 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.dot }} />
                              <span style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", color: "#64748B" }}>{s.label}</span>
                            </div>
                            <button
                              onClick={() => setEditingKey(isEditing ? null : s.key)}
                              style={{ border: "none", background: "none", color: "#2563EB", fontSize: "11px", fontWeight: 700, cursor: "pointer", padding: 0 }}
                            >
                              {isEditing ? "Done" : "Edit"}
                            </button>
                          </div>
                          <div style={{ padding: isEditing ? "0" : "2px 0 0 18px", borderLeft: isEditing ? "none" : "2px solid #EEF2F7" }}>
                            {isEditing ? (
                              <textarea
                                value={sections[s.key]}
                                onChange={(e) =>
                                  setSections((prev) => ({ ...prev, [s.key]: e.target.value }))
                                }
                                style={{
                                  width: "100%",
                                  minHeight: "126px",
                                  border: "1px solid #D5DEEA",
                                  borderRadius: "10px",
                                  padding: "12px",
                                  fontFamily: "inherit",
                                  fontSize: "14px",
                                  lineHeight: 1.6,
                                  outline: "none",
                                  resize: "vertical",
                                  background: "#FFFFFF",
                                }}
                              />
                            ) : s.key === "O" && context?.vitals_summary ? (
                              <>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginBottom: "18px", paddingRight: "6px" }}>
                                  <VitalsBox label="BLOOD PRESSURE" value={`${context.vitals_summary.bp_systolic_mmhg}/${context.vitals_summary.bp_diastolic_mmhg}`} unit="mmHg" />
                                  <VitalsBox label="HEART RATE" value={`${context.vitals_summary.heart_rate_bpm}`} unit="bpm" />
                                  <VitalsBox label="SpO2" value={`${context.vitals_summary.spo2_percent}`} unit="%" />
                                  <VitalsBox label="TEMP" value={`${context.vitals_summary.temperature_celsius.toFixed(1)}`} unit="C" />
                                </div>
                                <p style={sectionText()}>{sections[s.key]}</p>
                              </>
                            ) : (
                              <p style={sectionText()}>{sections[s.key]}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <aside style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <section style={{ background: "white", border: "1px solid #ECF0F5", borderRadius: "14px", padding: "22px 18px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "18px" }}>
                    <h3 style={{ margin: 0, fontSize: "30px", lineHeight: 1.08, fontWeight: 800, color: "#111827" }}>Session Highlights</h3>
                    <span style={{ fontSize: "10px", color: "#94A3B8", fontWeight: 700 }}>REFERENCE ONLY</span>
                  </div>
                  <div style={{ display: "grid", gap: "14px" }}>
                    {highlights.length > 0 ? (
                      highlights.map((h, i) => (
                        <div key={`${h}-${i}`} style={{ border: "1px solid #EEF2F7", background: "#F8FAFC", borderRadius: "14px", padding: "15px 14px" }}>
                          <p style={{ margin: 0, fontSize: "12px", color: "#334155", lineHeight: 1.65 }}>{truncate(h, 190)}</p>
                        </div>
                      ))
                    ) : (
                      <p style={{ margin: 0, fontSize: "12px", color: "#64748B" }}>No highlights captured.</p>
                    )}
                  </div>
                </section>

                <section style={{ background: "white", border: "1px solid #ECF0F5", borderRadius: "14px", padding: "14px" }}>
                  <p style={{ margin: "0 0 11px", fontSize: "11px", fontWeight: 800, color: "#94A3B8", letterSpacing: "0.07em" }}>
                    LINKED EVIDENCE
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <EvidencePill icon={<FileText size={13} />} text="Intake Summary" />
                    <EvidencePill icon={<ClipboardList size={13} />} text="Nurse Vitals" />
                  </div>
                </section>

                <section style={{ background: "linear-gradient(160deg,#0F172A,#1E293B)", borderRadius: "14px", padding: "16px", color: "white" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "1px solid rgba(148,163,184,0.35)", borderRadius: "999px", padding: "4px 8px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "10px" }}>
                    <Sparkles size={11} />
                    GUIDELINE ALERT
                  </div>
                  <h4 style={{ margin: "0 0 8px", fontSize: "30px", lineHeight: 1.06, fontWeight: 800 }}>
                    Review Differential Alignment
                  </h4>
                  <p style={{ margin: 0, fontSize: "12px", color: "#CBD5E1", lineHeight: 1.6 }}>
                    Ensure selected differentials are reflected in assessment and final treatment recommendations.
                  </p>
                  <button
                    onClick={() =>
                      sessionId && router.push(`/doctor/treatment?session_id=${sessionId}`)
                    }
                    style={{ marginTop: "12px", width: "100%", border: "none", borderRadius: "999px", background: "white", color: "#0F172A", fontSize: "12px", fontWeight: 800, padding: "9px", cursor: "pointer" }}
                  >
                    Proceed to Treatment Plan
                  </button>
                </section>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function badge(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.04em",
    background: bg,
    color,
    borderRadius: "999px",
    padding: "3px 8px",
  };
}

function sectionText(): React.CSSProperties {
  return {
    margin: 0,
    fontSize: "15px",
    color: "#334155",
    lineHeight: 1.82,
    whiteSpace: "pre-wrap",
  };
}

function VitalsBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div style={{ border: "1px solid #EEF2F7", background: "#F8FAFC", borderRadius: "14px", padding: "10px 11px" }}>
      <p style={{ margin: "0 0 3px", fontSize: "9px", color: "#94A3B8", fontWeight: 800, letterSpacing: "0.05em" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "20px", lineHeight: 1.1, color: "#0F172A", fontWeight: 800 }}>
        {value} <span style={{ fontSize: "11px", color: "#94A3B8", fontWeight: 700 }}>{unit}</span>
      </p>
    </div>
  );
}

function EvidencePill({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div style={{ border: "1px solid #EEF2F7", borderRadius: "12px", background: "#F8FAFC", padding: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "12px", color: "#334155", fontWeight: 700 }}>
      {icon}
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
    else if (key.startsWith("detail") || key === "additional details")
      result.details.push(value);
  }
  return result;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function buildSoapSections(
  ctx: DoctorContext,
  queueItem: QueueItem | null,
  parsed: {
    name: string | null;
    age: number | null;
    location: string | null;
    mainConcern: string | null;
    details: string[];
  }
): Record<SoapKey, string> {
  const chief =
    cleanSentence(
      ctx.structured_context?.chief_complaint ||
        queueItem?.chief_complaint ||
        parsed.mainConcern ||
        "Patient reports current health concern."
    ) || "Patient reports current health concern.";

  const hpiSource =
    cleanSentence(
      ctx.structured_context?.history_of_present_illness ||
        parsed.details.slice(0, 2).join(". ")
    ) || "History details are limited in the current intake.";

  const profileBits = [
    parsed.name || ctx.patient_name || "Patient",
    (parsed.age || ctx.patient_age) ? `${parsed.age || ctx.patient_age} years old` : null,
    parsed.location || ctx.patient_location || null,
  ].filter(Boolean);

  const subjective = [
    `${profileBits.join(", ")} presented with ${chief.toLowerCase()}.`,
    hpiSource,
    parsed.details.length > 0
      ? `Additional reported details: ${parsed.details
          .slice(0, 3)
          .map((d) => d.replace(/\.$/, ""))
          .join("; ")}.`
      : "Additional symptom progression details were not explicitly documented in the intake.",
  ]
    .filter(Boolean)
    .join(" ");

  const vitals = ctx.vitals_summary;
  const objectiveLines: string[] = [];
  if (vitals) {
    objectiveLines.push(
      `Vitals on review: BP ${vitals.bp_systolic_mmhg}/${vitals.bp_diastolic_mmhg} mmHg, HR ${vitals.heart_rate_bpm} bpm, Temp ${vitals.temperature_celsius.toFixed(
        1
      )} C, RR ${vitals.respiratory_rate_pm}/min, SpO2 ${vitals.spo2_percent}%, Weight ${vitals.weight_kg} kg, Height ${vitals.height_cm} cm.`
    );
    const flags: string[] = [];
    if (vitals.temperature_celsius >= 37.6) flags.push("mild fever pattern");
    if (vitals.heart_rate_bpm >= 100) flags.push("tachycardic trend");
    if (vitals.spo2_percent < 95) flags.push("reduced oxygen saturation");
    if (vitals.bp_systolic_mmhg >= 140 || vitals.bp_diastolic_mmhg >= 90)
      flags.push("elevated blood pressure");
    if (flags.length > 0) {
      objectiveLines.push(`Clinical observation from vitals: ${flags.join(", ")}.`);
    }
  } else {
    objectiveLines.push("Nurse vitals were not available at the time of this note.");
  }
  if (ctx.nurse_feedback) {
    objectiveLines.push(`Nurse observation: ${cleanSentence(ctx.nurse_feedback)}.`);
  }

  const accepted = ctx.differentials.filter((d) =>
    ["accepted", "modified", "added"].includes(d.doctor_action ?? "")
  );
  const differentialBase = accepted.length > 0 ? accepted : ctx.differentials;
  const topDiffs = differentialBase.slice(0, 3);

  const assessment = topDiffs.length
    ? topDiffs
        .map((d, i) => {
          const reasoning =
            cleanSentence(
              d.doctor_action === "modified" && d.doctor_modification
                ? d.doctor_modification
                : d.clinical_reasoning
            ) || "Requires further clinical correlation.";
          return `${i + 1}. ${d.title}: ${truncate(reasoning, 220)}`;
        })
        .join("\n")
    : "1. Differential analysis pending completion due to limited synthesized context.";

  const topTitle = topDiffs[0]?.title || "primary diagnosis";
  const plan = [
    `1. Correlate current findings with the leading differential (${topTitle}) and complete focused physical examination.`,
    "2. Continue supportive and symptomatic management while monitoring vitals trend and red-flag progression.",
    "3. Reassess within a short interval or earlier if symptoms worsen, new concerning signs appear, or emergency criteria are met.",
    "4. Communicate final assessment, safety instructions, and follow-up timeline clearly in the committed medical record.",
  ].join("\n");

  return {
    S: subjective,
    O: objectiveLines.join(" "),
    A: assessment,
    P: plan,
  };
}

function cleanSentence(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}
