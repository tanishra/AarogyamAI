"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle, ClipboardList, User } from "lucide-react";

const questions = [
  {
    id: 1,
    question: "What brings you in today?",
    sub: "Select the primary reason for your clinical visit today.",
    type: "single",
    options: [
      { id: "routine", label: "Routine Check-up", icon: "🩺" },
      { id: "new", label: "New Symptom or Pain", icon: "⚕️" },
      { id: "followup", label: "Follow-up Visit", icon: "📅" },
      { id: "refill", label: "Medication Refill", icon: "💊" },
    ],
  },
  {
    id: 2,
    question: "Describe your symptoms",
    sub: "Select the primary reason for your clinical visit today.",
    type: "single",
    options: [
      { id: "routine", label: "Routine Check-up", icon: "🩺" },
      { id: "new", label: "New Symptom or Pain", icon: "⚕️" },
      { id: "followup", label: "Follow-up Visit", icon: "📅" },
      { id: "refill", label: "Medication Refill", icon: "💊" },
    ],
  },
  {
    id: 3,
    question: "How long have you had this symptom?",
    sub: "Select the duration that best describes your condition.",
    type: "single",
    options: [
      { id: "today", label: "Started today", icon: "⏰" },
      { id: "days", label: "2–7 days", icon: "📆" },
      { id: "weeks", label: "1–4 weeks", icon: "🗓️" },
      { id: "months", label: "More than a month", icon: "📊" },
    ],
  },
  {
    id: 4,
    question: "Rate your pain level",
    sub: "On a scale from 1 (mild) to 10 (severe).",
    type: "scale",
    options: Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      label: String(i + 1),
      icon: "",
    })),
  },
  {
    id: 5,
    question: "Do you have any known allergies?",
    sub: "Select all that apply.",
    type: "multi",
    options: [
      { id: "none", label: "No known allergies", icon: "✅" },
      { id: "penicillin", label: "Penicillin", icon: "💉" },
      { id: "latex", label: "Latex", icon: "🧤" },
      { id: "nsaids", label: "NSAIDs / Aspirin", icon: "💊" },
    ],
  },
];

const TOTAL = 12;

export default function PatientQuestionnaire() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [direction, setDirection] = useState(1);

  const q = questions[Math.min(current, questions.length - 1)];
  const selected = answers[q.id] || [];
  const progress = ((current) / TOTAL) * 100;

  const toggle = (optId: string) => {
    if (q.type === "multi") {
      setAnswers(prev => {
        const cur = prev[q.id] || [];
        return { ...prev, [q.id]: cur.includes(optId) ? cur.filter(x => x !== optId) : [...cur, optId] };
      });
    } else {
      setAnswers(prev => ({ ...prev, [q.id]: [optId] }));
    }
  };

  const next = () => {
    if (current < TOTAL - 1) { setDirection(1); setCurrent(c => c + 1); }
    else router.push("/patient/portal");
  };

  const back = () => {
    if (current > 0) { setDirection(-1); setCurrent(c => c - 1); }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F0F4F8",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      display: "flex", flexDirection: "column",
    }}>

      {/* Header */}
      <div style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "8px",
            background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ClipboardList size={14} color="white" />
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>Clinical Zen</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8" }}>STAGE 2</div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A" }}>Data Entry Layer</div>
        </div>
        <div style={{
          width: "32px", height: "32px", borderRadius: "50%",
          background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <User size={16} color="#64748B" />
        </div>
      </div>

      {/* Main */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}>
        <div style={{
          width: "100%", maxWidth: "520px",
          background: "white", borderRadius: "20px",
          border: "1px solid #E5E7EB",
          boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
          padding: "32px",
        }}>
          {/* Progress */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563EB", letterSpacing: "0.08em" }}>PROGRESS</span>
              <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 500 }}>{current + 1} of {TOTAL} questions</span>
            </div>
            <div style={{ height: "4px", background: "#F1F5F9", borderRadius: "99px", overflow: "hidden" }}>
              <motion.div
                animate={{ width: `${progress}%` }}
                style={{ height: "100%", background: "#2563EB", borderRadius: "99px" }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>

          {/* Question */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: direction * 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -30 }}
              transition={{ duration: 0.25 }}
            >
              <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: "0 0 6px", lineHeight: 1.2 }}>
                {q.question}
              </h2>
              <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 24px", lineHeight: 1.5 }}>
                {q.sub}
              </p>

              {/* Options */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {q.options.map(opt => {
                  const isSelected = selected.includes(opt.id);
                  return (
                    <motion.button
                      key={opt.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggle(opt.id)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 16px", borderRadius: "12px",
                        border: isSelected ? "2px solid #2563EB" : "2px solid #E5E7EB",
                        background: isSelected ? "#EFF6FF" : "white",
                        cursor: "pointer", transition: "all 0.15s",
                        fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {opt.icon && (
                          <div style={{
                            width: "36px", height: "36px", borderRadius: "10px",
                            background: isSelected ? "#2563EB" : "#F1F5F9",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "16px", transition: "all 0.15s",
                          }}>
                            {isSelected ? <CheckCircle size={16} color="white" /> : opt.icon}
                          </div>
                        )}
                        <span style={{
                          fontSize: "14px", fontWeight: isSelected ? 700 : 500,
                          color: isSelected ? "#1D4ED8" : "#374151",
                        }}>
                          {opt.label}
                        </span>
                      </div>
                      <ArrowRight size={16} color={isSelected ? "#2563EB" : "#CBD5E1"} />
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "28px" }}>
            <button
              onClick={back}
              disabled={current === 0}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                fontSize: "13px", fontWeight: 600, color: current === 0 ? "#CBD5E1" : "#64748B",
                background: "none", border: "none", cursor: current === 0 ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              <ArrowLeft size={15} /> Back
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={next}
              disabled={selected.length === 0}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "12px 24px", borderRadius: "12px",
                background: selected.length === 0 ? "#E5E7EB" : "#2563EB",
                color: selected.length === 0 ? "#94A3B8" : "white",
                fontSize: "14px", fontWeight: 700, border: "none",
                cursor: selected.length === 0 ? "not-allowed" : "pointer",
                boxShadow: selected.length > 0 ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
                fontFamily: "inherit", transition: "all 0.2s",
              }}
            >
              {current === TOTAL - 1 ? "Complete" : "Continue"}
              <ArrowRight size={15} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderTop: "1px solid #E5E7EB", background: "white",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#94A3B8" }}>
          <CheckCircle size={12} color="#10B981" />
          Secure Clinical Intake Encrypted via HIPAA
        </div>
        <span style={{ fontSize: "11px", color: "#CBD5E1" }}>© 2024 Clinical Zen. All data shared securely with your medical provider.</span>
      </div>
    </div>
  );
}