"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, Edit2, RotateCcw, Plus, Moon,
  Activity, AlertTriangle, Clock, User, Zap, ChevronRight
} from "lucide-react";

type DiffStatus = "pending" | "accepted" | "modified" | "rejected";

interface Differential {
  id: number;
  rank: "PRIMARY" | "SECONDARY" | "TERTIARY";
  rankColor: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  title: string;
  description: string;
  borderColor: string;
  status: DiffStatus;
  sources?: string;
}

const initialDiffs: Differential[] = [
  {
    id: 1, rank: "PRIMARY", rankColor: "#2563EB",
    tag: "AI GEN", tagColor: "#2563EB", tagBg: "#EFF6FF",
    title: "Unstable Angina Pectoris",
    description: "Pattern of increasing severity and frequency of chest pain at rest. High correlation with history of CAD and recent medication non-compliance. Requires immediate troponin assay and ECG monitoring.",
    borderColor: "#2563EB", status: "pending",
    sources: "Referenced in QUESTIONNAIRE_SESSION & VITALS_RECORD",
  },
  {
    id: 2, rank: "SECONDARY", rankColor: "#F59E0B",
    tag: "AI GEN", tagColor: "#F59E0B", tagBg: "#FFFBEB",
    title: "Gastroesophageal Reflux Disease (GERD)",
    description: "Potential masquerading symptom. Patient noted some \"acidity\" post-meal, though exertion-triggered pain is atypical for GERD. Low AI confidence for primary cause but relevant for exclusion.",
    borderColor: "#F59E0B", status: "pending",
  },
  {
    id: 3, rank: "TERTIARY", rankColor: "#94A3B8",
    tag: "DOC MODIFIED", tagColor: "#10B981", tagBg: "#ECFDF5",
    title: "Costochondritis",
    description: "\"Doctor's Note: Tenderness noted on palpation of the third left costosternal junction during physical exam. Adding to differentials for lower-priority investigation.\"",
    borderColor: "#94A3B8", status: "accepted",
  },
];

export default function DoctorDifferential() {
  const router = useRouter();
  const [diffs, setDiffs] = useState<Differential[]>(initialDiffs);
  const [committing, setCommitting] = useState(false);

  const updateStatus = (id: number, status: DiffStatus) => {
    setDiffs(prev => prev.map(d => d.id === id ? { ...d, status } : d));
  };

  const handleCommit = async () => {
    setCommitting(true);
    await new Promise(r => setTimeout(r, 1200));
    setCommitting(false);
    router.push("/doctor/smart-note");
  };

  const allResolved = diffs.every(d => d.status !== "pending");

  return (
    <div style={{
      minHeight: "100vh", background: "#F8FAFC",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>

      {/* Header */}
      <div style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 32px",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: "60px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: "13px", fontWeight: 800, color: "white" }}>CZ</span>
            </div>
            <nav style={{ display: "flex", gap: "4px" }}>
              <button style={{ fontSize: "13px", color: "#64748B", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
                Patients
              </button>
              <span style={{ color: "#CBD5E1", lineHeight: "30px" }}>/</span>
              <button style={{ fontSize: "13px", color: "#0F172A", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
                AI Differential Analysis
              </button>
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }}>
              <Moon size={18} />
            </button>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>DR. SARAH JENKINS</div>
              <div style={{ fontSize: "11px", color: "#94A3B8" }}>Cardiology Specialist</div>
            </div>
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User size={18} color="#2563EB" />
            </div>
          </div>
        </div>
      </div>

      {/* Page Header */}
      <div style={{ padding: "24px 32px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{
                background: "#FEE2E2", color: "#DC2626",
                fontSize: "11px", fontWeight: 700, padding: "3px 10px",
                borderRadius: "6px", letterSpacing: "0.06em",
              }}>HIGH URGENCY</span>
              <span style={{ fontSize: "13px", color: "#94A3B8", fontWeight: 500 }}>ID: PT-8821-44</span>
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>
              Differential Analysis: Marcus Thorne
            </h1>
            <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>
              AI Synthesis based on Patient Session #PS-902 & Clinical Questionnaire
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "10px 16px", borderRadius: "10px",
              border: "1.5px solid #E5E7EB", background: "white",
              fontSize: "13px", fontWeight: 600, color: "#374151",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              <Clock size={14} /> View Previous Sessions
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleCommit}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "10px 20px", borderRadius: "10px",
                border: "none", background: "#2563EB",
                fontSize: "13px", fontWeight: 700, color: "white",
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                opacity: committing ? 0.8 : 1,
              }}
            >
              {committing
                ? <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <><CheckCircle size={14} /> Commit to Record</>
              }
            </motion.button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", padding: "20px 32px" }}>

        {/* Left — AI Inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* AI Synthesis Inputs */}
          <div style={{
            background: "white", borderRadius: "16px",
            border: "1px solid #E5E7EB", padding: "18px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }}>
              <Zap size={14} color="#94A3B8" />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em" }}>AI SYNTHESIS INPUTS</span>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em", margin: "0 0 6px" }}>
                PRIMARY COMPLAINT (SOURCED)
              </p>
              <p style={{ fontSize: "13px", color: "#374151", lineHeight: 1.6, margin: 0 }}>
                "Episodes of sharp substernal chest pain radiating to the left shoulder, aggravated by physical exertion and relieved by rest."
              </p>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em", margin: "0 0 8px" }}>
                VITALS SUMMARY
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  { label: "BP", value: "142/88 mmHg" },
                  { label: "HR", value: "94 bpm" },
                ].map(v => (
                  <div key={v.label} style={{
                    background: "#F8FAFC", borderRadius: "10px",
                    padding: "10px 12px", border: "1px solid #F1F5F9",
                  }}>
                    <p style={{ fontSize: "10px", color: "#94A3B8", fontWeight: 700, margin: "0 0 2px" }}>{v.label}</p>
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: 0 }}>{v.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em", margin: "0 0 8px" }}>
                QUESTIONNAIRE INSIGHTS
              </p>
              {[
                { icon: CheckCircle, color: "#10B981", text: "Positive for family history of CAD." },
                { icon: AlertTriangle, color: "#F59E0B", text: "Recent cessation of statin medication." },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "6px" }}>
                    <Icon size={13} color={item.color} style={{ marginTop: "2px", flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: "#374151" }}>{item.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Confidence */}
          <div style={{
            background: "white", borderRadius: "16px",
            border: "1px solid #E5E7EB", padding: "18px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
              <Zap size={14} color="#2563EB" />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#374151", letterSpacing: "0.06em" }}>AI CONFIDENCE SCORE</span>
            </div>
            <div style={{ fontSize: "36px", fontWeight: 800, color: "#2563EB", margin: "0 0 8px" }}>88%</div>
            <div style={{ height: "6px", background: "#F1F5F9", borderRadius: "99px", overflow: "hidden", marginBottom: "8px" }}>
              <div style={{ height: "100%", width: "88%", background: "linear-gradient(90deg, #2563EB, #6366F1)", borderRadius: "99px" }} />
            </div>
            <p style={{ fontSize: "11px", color: "#94A3B8", margin: 0, lineHeight: 1.5 }}>
              Synthesis based on 14 data points from clinical history and real-time vital streams.
            </p>
          </div>
        </div>

        {/* Right — Differentials */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.1em", margin: 0 }}>
              DIFFERENTIAL_CONSIDERATIONS
            </h2>
            <span style={{ fontSize: "12px", color: "#94A3B8" }}>3 Hypotheses Generated</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {diffs.map((diff) => (
              <motion.div
                key={diff.id}
                layout
                style={{
                  background: "white", borderRadius: "14px",
                  border: "1px solid #E5E7EB",
                  borderLeft: `4px solid ${diff.status === "accepted" ? "#10B981" : diff.borderColor}`,
                  padding: "18px 20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: diff.rankColor, letterSpacing: "0.08em" }}>
                        {diff.rank} CONSIDERATION
                      </span>
                      <span style={{
                        fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                        color: diff.tagColor, background: diff.tagBg, letterSpacing: "0.06em",
                      }}>{diff.tag}</span>
                    </div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 8px" }}>
                      {diff.title}
                    </h3>
                    <p style={{ fontSize: "13px", color: "#64748B", lineHeight: 1.7, margin: 0 }}>
                      {diff.description}
                    </p>
                    {diff.sources && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                        <div style={{
                          display: "flex", gap: "4px",
                        }}>
                          {["1", "2"].map(n => (
                            <span key={n} style={{
                              width: "20px", height: "20px", borderRadius: "50%",
                              background: "#F1F5F9", display: "flex", alignItems: "center",
                              justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "#64748B",
                            }}>{n}</span>
                          ))}
                        </div>
                        <span style={{ fontSize: "11px", color: "#94A3B8" }}>{diff.sources}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                    {diff.status === "accepted" ? (
                      <>
                        <div style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "8px 14px", borderRadius: "8px",
                          background: "#ECFDF5", color: "#10B981",
                          fontSize: "12px", fontWeight: 700,
                        }}>
                          <CheckCircle size={13} /> Accepted
                        </div>
                        <button
                          onClick={() => updateStatus(diff.id, "pending")}
                          style={{
                            display: "flex", alignItems: "center", gap: "6px",
                            padding: "8px 14px", borderRadius: "8px",
                            border: "1px solid #E5E7EB", background: "white",
                            fontSize: "12px", fontWeight: 600, color: "#64748B",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          <RotateCcw size={12} /> Revert
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => updateStatus(diff.id, "accepted")}
                          style={{
                            display: "flex", alignItems: "center", gap: "6px",
                            padding: "8px 16px", borderRadius: "8px",
                            border: "none", background: "#2563EB",
                            fontSize: "12px", fontWeight: 700, color: "white",
                            cursor: "pointer", fontFamily: "inherit",
                            boxShadow: "0 4px 10px rgba(37,99,235,0.25)",
                          }}
                        >
                          <CheckCircle size={13} /> Accept
                        </button>
                        <button
                          onClick={() => updateStatus(diff.id, "modified")}
                          style={{
                            display: "flex", alignItems: "center", gap: "6px",
                            padding: "8px 16px", borderRadius: "8px",
                            border: "1px solid #E5E7EB", background: "white",
                            fontSize: "12px", fontWeight: 600, color: "#374151",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          <Edit2 size={12} /> Modify
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Add Manual */}
            <button style={{
              width: "100%", padding: "16px",
              borderRadius: "14px", border: "1.5px dashed #E5E7EB",
              background: "transparent", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "6px",
              fontSize: "13px", fontWeight: 600, color: "#94A3B8",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              <Plus size={15} /> Add Manual Consideration
            </button>
          </div>

          {/* Footer status */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: "20px", padding: "12px 0", borderTop: "1px solid #F1F5F9",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Activity size={12} color="#10B981" />
                <span style={{ fontSize: "11px", color: "#64748B" }}>AGENT_INVOCATION_LOG: ACTIVE</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle size={12} color="#94A3B8" />
                <span style={{ fontSize: "11px", color: "#64748B" }}>AUDIT_LOG_ENTRY: PENDING_COMMIT</span>
              </div>
            </div>
            <span style={{ fontSize: "11px", color: "#2563EB", fontWeight: 600 }}>
              Schema v2.4.1 • MEDICAL_RECORD Link Established
            </span>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}