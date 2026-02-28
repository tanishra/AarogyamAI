"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle, Circle, User, Activity, Thermometer,
  Heart, Wind, AlertTriangle, ChevronRight, ClipboardList, Send
} from "lucide-react";

const questions = [
  { id: 1, q: "What is the nature of your primary complaint?", answer: "Sharp chest pain radiating to the left shoulder, worsening with physical activity." },
  { id: 2, q: "How long have you been experiencing this?", answer: "Approximately 3 weeks, with increased frequency over the last 5 days." },
  { id: 3, q: "Have you experienced this before?", answer: "Yes, mild episodes 6 months ago, resolved without treatment." },
  { id: 4, q: "On a scale of 1–10, current pain intensity?", answer: "Currently 4/10, was 7/10 earlier this week." },
  { id: 5, q: "Any associated symptoms?", answer: "Mild shortness of breath during exertion, occasional jaw tightness." },
  { id: 6, q: "Are you currently taking any medications?", answer: "Atorvastatin 40mg — stopped 2 months ago. Nitroglycerin SL — prescribed last week." },
  { id: 7, q: "Any known allergies?", answer: "Penicillin — severe reaction. Latex — mild reaction." },
];

const vitals = [
  { label: "Temperature", value: "101.4", unit: "°F", status: "elevated", icon: Thermometer },
  { label: "Heart Rate", value: "94", unit: "BPM", status: "normal", icon: Activity },
  { label: "SpO2", value: "96", unit: "%", status: "normal", icon: Wind },
  { label: "Blood Pressure", value: "142/88", unit: "mmHg", status: "elevated", icon: Heart },
];

const statusStyle = (s: string) => ({
  color: s === "elevated" ? "#D97706" : "#10B981",
  text: s === "elevated" ? "Elevated" : "Normal",
  dot: s === "elevated" ? "#F59E0B" : "#10B981",
});

export default function IntakeSplitView() {
  const router = useRouter();
  const [activeQ, setActiveQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => router.push("/doctor/differential"), 1500);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F8", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "#4F46E5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ClipboardList size={15} color="white" />
            </div>
            <div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>Nurse Intake</span>
              <span style={{ fontSize: "11px", color: "#94A3B8", marginLeft: "8px" }}>Split View — Patient + Vitals</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={14} color="#4F46E5" />
              </div>
              <div>
                <p style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", margin: 0 }}>Sarah Weaver, RN</p>
                <p style={{ fontSize: "10px", color: "#94A3B8", margin: 0 }}>Lead Nurse</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Split Body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", height: "calc(100vh - 60px)" }}>

        {/* LEFT — Patient Questionnaire */}
        <div style={{ borderRight: "1px solid #E5E7EB", background: "white", display: "flex", flexDirection: "column" }}>
          {/* Panel header */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4F46E5" }} />
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#4F46E5", letterSpacing: "0.1em" }}>PATIENT RESPONSES</span>
              </div>
              <span style={{ marginLeft: "auto", fontSize: "11px", color: "#94A3B8" }}>
                {questions.length}/{questions.length} completed
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={16} color="#4F46E5" />
              </div>
              <div>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: 0 }}>James Sterling</p>
                <p style={{ fontSize: "11px", color: "#94A3B8", margin: 0 }}>ID: 882-99-231 • Age 42</p>
              </div>
            </div>
          </div>

          {/* Questions */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
            {questions.map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setActiveQ(i)}
                style={{
                  marginBottom: "14px", cursor: "pointer",
                  padding: "14px", borderRadius: "12px",
                  border: activeQ === i ? "1.5px solid #4F46E5" : "1.5px solid #E5E7EB",
                  background: activeQ === i ? "#EEF2FF" : "#F8FAFC",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <CheckCircle size={16} color="#10B981" style={{ marginTop: "2px", flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748B", margin: "0 0 4px" }}>Q{q.id}. {q.q}</p>
                    <p style={{ fontSize: "13px", color: "#0F172A", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                      "{q.answer}"
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* RIGHT — Nurse Vitals Panel */}
        <div style={{ background: "#F8FAFC", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #E5E7EB", background: "white" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F59E0B" }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#D97706", letterSpacing: "0.1em" }}>NURSE VITALS PANEL</span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

            {/* Vitals Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              {vitals.map((v) => {
                const Icon = v.icon;
                const s = statusStyle(v.status);
                return (
                  <div key={v.label} style={{
                    background: "white", borderRadius: "14px",
                    border: "1px solid #E5E7EB", padding: "16px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em" }}>
                        {v.label.toUpperCase()}
                      </span>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.dot }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "28px", fontWeight: 800, color: v.status === "elevated" ? "#D97706" : "#0F172A" }}>
                        {v.value}
                      </span>
                      <span style={{ fontSize: "12px", color: "#94A3B8" }}>{v.unit}</span>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: s.color }}>
                      {v.status === "elevated" ? "↑ " : "✓ "}{s.text}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Allergy Alert */}
            <div style={{ background: "#FFFBEB", borderRadius: "12px", border: "1.5px solid #FDE68A", padding: "14px 16px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <AlertTriangle size={14} color="#D97706" />
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#D97706" }}>Allergy Alert</span>
              </div>
              <p style={{ fontSize: "12px", color: "#92400E", margin: 0 }}>
                Penicillin — Severe • Latex — Mild
              </p>
            </div>

            {/* Nurse Notes */}
            <div style={{ background: "white", borderRadius: "14px", border: "1px solid #E5E7EB", padding: "16px", marginBottom: "16px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em" }}>NURSE NOTES</span>
              <textarea
                placeholder="Patient appears anxious. Observe for additional distress..."
                defaultValue="Patient appears anxious but cooperative. Skin warm and dry. No visible diaphoresis. Gait steady on entry. Complains of mild jaw discomfort."
                style={{
                  width: "100%", minHeight: "80px", marginTop: "10px",
                  padding: "10px 12px", borderRadius: "10px",
                  border: "1.5px solid #E5E7EB", background: "#F8FAFC",
                  fontSize: "13px", color: "#374151", outline: "none",
                  fontFamily: "inherit", resize: "none", lineHeight: 1.6,
                }}
              />
            </div>

            {/* Submit */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={submitting || submitted}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "center", gap: "8px",
                background: submitted ? "#10B981" : "#4F46E5",
                color: "white", fontWeight: 700, fontSize: "15px",
                padding: "14px", borderRadius: "12px", border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(79,70,229,0.3)",
                fontFamily: "inherit", transition: "all 0.3s",
              }}
            >
              {submitting ? (
                <div style={{ width: "18px", height: "18px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              ) : submitted ? (
                <><CheckCircle size={16} /> Submitted — AI Synthesis Queued</>
              ) : (
                <><Send size={15} /> Submit to AI Synthesis <ChevronRight size={15} /></>
              )}
            </motion.button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}