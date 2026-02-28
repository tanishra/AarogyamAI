"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Zap, CheckCircle, Edit2, RefreshCw, Save,
  ChevronRight, Clock, User, FileText, Copy, Send
} from "lucide-react";

const sections = [
  {
    key: "S",
    label: "Subjective",
    color: "#2563EB",
    bg: "#EFF6FF",
    content: "Patient Marcus Thorne, 42-year-old male, presents with episodic chest tightness and shortness of breath occurring primarily during moderate physical exertion. Patient reports the chest tightness radiates to the left shoulder and occasionally the jaw. Symptoms have been present for approximately 3 weeks, with increasing frequency over the past 5 days. Patient rates current pain intensity at 4/10 (down from 7/10 last week). Patient reports partial relief with prescribed sublingual nitroglycerin.",
  },
  {
    key: "O",
    label: "Objective",
    color: "#7C3AED",
    bg: "#F5F3FF",
    content: "Vitals: BP 142/88 mmHg (elevated), HR 94 bpm (upper normal range), Temp 98.6°F (normal), SpO2 97% (adequate). General: Patient appears mildly anxious but in no acute distress. Cardiovascular: Regular rate and rhythm, no murmurs or gallops noted. S1 and S2 within normal limits. Lungs: Clear to auscultation bilaterally. No wheezing or crackles. ECG: Non-specific ST-segment changes in leads V4–V6. Troponin: Pending.",
  },
  {
    key: "A",
    label: "Assessment",
    color: "#D97706",
    bg: "#FFFBEB",
    content: "Primary Consideration: Unstable Angina Pectoris — Given the clinical presentation, history of CAD risk factors (family history, hypertension, recent statin non-compliance), and the characteristic exertional chest pain with radiation pattern, unstable angina remains the primary diagnosis. Secondary Consideration: GERD — Cannot be fully excluded given patient's dietary history. AI Confidence Score: 88%.",
  },
  {
    key: "P",
    label: "Plan",
    color: "#059669",
    bg: "#ECFDF5",
    content: "1. Admit for continuous cardiac monitoring and serial troponin testing (q6h x3). 2. Continue sublingual nitroglycerin PRN for acute episodes. 3. Initiate dual antiplatelet therapy pending troponin results. 4. Restart atorvastatin 40mg daily — address compliance barriers with patient. 5. Cardiology consult for possible stress testing or catheterization evaluation. 6. Patient education on activity restrictions and warning signs requiring immediate ER visit.",
  },
];

export default function SmartNoteEditor() {
  const router = useRouter();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, string>>(
    Object.fromEntries(sections.map(s => [s.key, s.content]))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => router.push("/doctor/treatment"), 1200);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F8FAFC",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>

      {/* Header */}
      <div style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 32px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: "60px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "30px", height: "30px", borderRadius: "8px",
              background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "white" }}>CZ</span>
            </div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "13px" }}>
              <span style={{ color: "#64748B" }}>Doctor</span>
              <span style={{ color: "#CBD5E1" }}>/</span>
              <span style={{ color: "#0F172A", fontWeight: 600 }}>Smart Note Editor</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#94A3B8" }}>
              <Clock size={13} />
              Auto-saved 2m ago
            </div>
            <button style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "9px 16px", borderRadius: "10px",
              border: "1.5px solid #E5E7EB", background: "white",
              fontSize: "13px", fontWeight: 600, color: "#374151",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              <Copy size={13} /> Copy SOAP
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "9px 20px", borderRadius: "10px",
                border: "none", background: saved ? "#10B981" : "#2563EB",
                fontSize: "13px", fontWeight: 700, color: "white",
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
                transition: "background 0.3s",
              }}
            >
              {saving ? (
                <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              ) : saved ? (
                <><CheckCircle size={14} /> Committed</>
              ) : (
                <><Save size={14} /> Commit to Record</>
              )}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px" }}>

        {/* Page title */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Zap size={14} color="#2563EB" />
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563EB", letterSpacing: "0.1em" }}>
              AI-GENERATED SOAP NOTE
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>
                Clinical Documentation — Marcus Thorne
              </h1>
              <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>
                Session PS-902 • Generated from live session transcript + AI synthesis
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "9px 14px", borderRadius: "10px",
                border: "1.5px solid #E5E7EB", background: "white",
                fontSize: "12px", fontWeight: 600, color: "#374151",
                cursor: "pointer", fontFamily: "inherit",
              }}>
                <RefreshCw size={13} /> Regenerate
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "20px" }}>

          {/* SOAP Sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {sections.map((section) => {
              const isEditing = editingKey === section.key;
              return (
                <motion.div
                  key={section.key}
                  layout
                  style={{
                    background: "white", borderRadius: "14px",
                    border: "1px solid #E5E7EB",
                    borderLeft: `4px solid ${section.color}`,
                    overflow: "hidden",
                  }}
                >
                  {/* Section header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px",
                    background: section.bg, borderBottom: "1px solid #E5E7EB",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{
                        width: "28px", height: "28px", borderRadius: "8px",
                        background: section.color, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: "13px", fontWeight: 800, color: "white",
                      }}>{section.key}</span>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>
                        {section.label}
                      </span>
                      <span style={{
                        fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                        background: "rgba(37,99,235,0.1)", color: "#2563EB", letterSpacing: "0.06em",
                      }}>AI DRAFTED</span>
                    </div>
                    <button
                      onClick={() => setEditingKey(isEditing ? null : section.key)}
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        fontSize: "12px", fontWeight: 600,
                        color: isEditing ? "#10B981" : "#2563EB",
                        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {isEditing ? <><CheckCircle size={13} /> Done</> : <><Edit2 size={13} /> Edit</>}
                    </button>
                  </div>

                  {/* Content */}
                  <div style={{ padding: "16px 18px" }}>
                    {isEditing ? (
                      <textarea
                        value={contents[section.key]}
                        onChange={e => setContents(prev => ({ ...prev, [section.key]: e.target.value }))}
                        style={{
                          width: "100%", minHeight: "120px", padding: "12px",
                          borderRadius: "10px", border: "1.5px solid #2563EB",
                          background: "#F8FAFC", fontSize: "13px", color: "#374151",
                          outline: "none", fontFamily: "inherit", resize: "vertical",
                          lineHeight: 1.7,
                        }}
                      />
                    ) : (
                      <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.8, margin: 0 }}>
                        {contents[section.key]}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Right Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Patient context */}
            <div style={{
              background: "white", borderRadius: "14px",
              border: "1px solid #E5E7EB", padding: "18px",
            }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>
                Patient Context
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <div style={{
                  width: "38px", height: "38px", borderRadius: "50%",
                  background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <User size={18} color="#64748B" />
                </div>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: 0 }}>Marcus Thorne</p>
                  <p style={{ fontSize: "11px", color: "#94A3B8", margin: "1px 0 0" }}>42 yrs • Male • ID: PT-8821</p>
                </div>
              </div>
              {[
                { label: "Primary Dx", value: "Unstable Angina" },
                { label: "Session", value: "PS-902" },
                { label: "Physician", value: "Dr. S. Jenkins" },
                { label: "AI Score", value: "88% Confidence" },
              ].map(item => (
                <div key={item.label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "8px 0", borderBottom: "1px solid #F1F5F9",
                }}>
                  <span style={{ fontSize: "12px", color: "#94A3B8" }}>{item.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* AI Suggestions */}
            <div style={{
              background: "white", borderRadius: "14px",
              border: "1px solid #E5E7EB", padding: "18px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
                <Zap size={13} color="#2563EB" />
                <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: 0 }}>
                  AI Suggestions
                </h3>
              </div>
              {[
                "Consider adding HbA1c to the plan — patient has borderline glucose levels.",
                "Plan section could reference ACC/AHA guidelines for NSTEMI management.",
                "Recommend documenting informed consent for antiplatelet therapy initiation.",
              ].map((s, i) => (
                <div key={i} style={{
                  padding: "10px 12px", borderRadius: "10px",
                  background: "#F8FAFC", border: "1px solid #F1F5F9",
                  marginBottom: i < 2 ? "8px" : 0,
                }}>
                  <p style={{ fontSize: "12px", color: "#374151", lineHeight: 1.6, margin: "0 0 6px" }}>{s}</p>
                  <button style={{
                    fontSize: "11px", color: "#2563EB", fontWeight: 600,
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "inherit", padding: 0,
                    display: "flex", alignItems: "center", gap: "4px",
                  }}>
                    Apply suggestion <ChevronRight size={11} />
                  </button>
                </div>
              ))}
            </div>

            {/* Next step */}
            <button
              onClick={() => router.push("/doctor/treatment")}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                padding: "12px", borderRadius: "12px",
                border: "none", background: "#F0F4F8",
                fontSize: "13px", fontWeight: 700, color: "#374151",
                cursor: "pointer", fontFamily: "inherit",
              }}>
              <Send size={14} /> Proceed to Treatment Plan <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}