"use client";

import { motion } from "framer-motion";
import {
  Activity, Heart, Pill, FileText, AlertTriangle,
  User, ChevronRight, Calendar, Download, Filter
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type EventType = "diagnosis" | "medication" | "lab" | "visit" | "alert";

interface TimelineEvent {
  id: number;
  date: string;
  type: EventType;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

const typeConfig: Record<EventType, { icon: LucideIcon; color: string; bg: string }> = {
  diagnosis: { icon: Activity, color: "#2563EB", bg: "#EFF6FF" },
  medication: { icon: Pill, color: "#7C3AED", bg: "#F5F3FF" },
  lab: { icon: FileText, color: "#059669", bg: "#ECFDF5" },
  visit: { icon: Heart, color: "#D97706", bg: "#FFFBEB" },
  alert: { icon: AlertTriangle, color: "#DC2626", bg: "#FEF2F2" },
};

const timeline: TimelineEvent[] = [
  { id: 1, date: "Oct 24, 2024", type: "visit", title: "Cardiology Consultation", description: "Annual wellness checkup. ECG and troponin ordered. Patient reports intermittent chest tightness for 3 weeks.", badge: "Recent", badgeColor: "#2563EB" },
  { id: 2, date: "Oct 18, 2024", type: "diagnosis", title: "Unstable Angina — Provisional Diagnosis", description: "Based on exertional chest pain pattern and elevated BP. Referred for cardiology consultation. Nitroglycerin prescribed PRN.", badge: "AI Assisted", badgeColor: "#7C3AED" },
  { id: 3, date: "Oct 10, 2024", type: "lab", title: "Lab Results: Lipid Panel", description: "LDL: 148 mg/dL (high), HDL: 38 mg/dL (low), Triglycerides: 210 mg/dL. Statin therapy compliance discussed.", badge: "Abnormal", badgeColor: "#DC2626" },
  { id: 4, date: "Sep 12, 2024", type: "medication", title: "Atorvastatin 40mg — Initiated", description: "Started statin therapy for hyperlipidaemia. Patient counselled on compliance and dietary modifications.", },
  { id: 5, date: "Jul 04, 2024", type: "visit", title: "Annual Physical Examination", description: "BP 138/84 mmHg. Mild hypertension noted. Lifestyle modifications recommended. Follow-up in 3 months." },
  { id: 6, date: "Apr 22, 2024", type: "alert", title: "Medication Compliance Flag", description: "Patient reported stopping Atorvastatin due to muscle discomfort. Alternative statin discussed. Bridging therapy considered.", badge: "Flag", badgeColor: "#DC2626" },
  { id: 7, date: "Jan 15, 2024", type: "lab", title: "Blood Work — Routine Panel", description: "CBC, CMP, HbA1c (5.9% — pre-diabetic range). Fasting glucose: 108 mg/dL. Diabetes risk counselling provided." },
  { id: 8, date: "Nov 08, 2023", type: "diagnosis", title: "Hypertension — Confirmed", description: "Stage 1 hypertension confirmed. BP averaged 138/86 over 3 readings. ACE inhibitor therapy initiated." },
];

export default function PatientHistoryTimeline() {
  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "white" }}>CZ</span>
            </div>
            <div style={{ fontSize: "13px", color: "#64748B" }}>
              Patient Records <span style={{ color: "#CBD5E1" }}>/</span> <span style={{ color: "#0F172A", fontWeight: 600 }}>Medical History</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "9px 16px", borderRadius: "10px",
              border: "1.5px solid #E5E7EB", background: "white",
              fontSize: "13px", fontWeight: 600, color: "#374151",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              <Filter size={13} /> Filter
            </button>
            <button style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "9px 16px", borderRadius: "10px",
              border: "none", background: "#2563EB",
              fontSize: "13px", fontWeight: 700, color: "white",
              cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
            }}>
              <Download size={13} /> Export Records
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "24px" }}>

          {/* Timeline */}
          <div>
            {/* Page title */}
            <div style={{ marginBottom: "24px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563EB", letterSpacing: "0.1em" }}>MEDICAL TIMELINE</span>
              <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0F172A", margin: "6px 0 4px" }}>Marcus Thorne</h1>
              <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>42 yrs • Male • ID: PT-8821 • 8 clinical events recorded</p>
            </div>

            {/* Events */}
            <div style={{ position: "relative" }}>
              {/* Vertical line */}
              <div style={{
                position: "absolute", left: "19px", top: "20px", bottom: "20px",
                width: "2px", background: "#E5E7EB",
              }} />

              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {timeline.map((event, i) => {
                  const config = typeConfig[event.type];
                  const Icon = config.icon;
                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      style={{ display: "flex", gap: "20px", paddingBottom: "16px" }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: "40px", height: "40px", borderRadius: "50%",
                        background: config.bg, border: `2px solid ${config.color}20`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, zIndex: 1, position: "relative",
                      }}>
                        <Icon size={18} color={config.color} />
                      </div>

                      {/* Card */}
                      <div style={{
                        flex: 1, background: "white", borderRadius: "14px",
                        border: "1px solid #E5E7EB", padding: "16px 18px",
                        marginBottom: "4px",
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: 0 }}>
                                {event.title}
                              </h3>
                              {event.badge && (
                                <span style={{
                                  fontSize: "9px", fontWeight: 700, padding: "2px 7px",
                                  borderRadius: "4px", color: event.badgeColor,
                                  background: event.badgeColor + "15",
                                  letterSpacing: "0.06em",
                                }}>{event.badge}</span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <Calendar size={12} color="#94A3B8" />
                              <span style={{ fontSize: "12px", color: "#94A3B8" }}>{event.date}</span>
                            </div>
                          </div>
                          <ChevronRight size={16} color="#CBD5E1" />
                        </div>
                        <p style={{ fontSize: "13px", color: "#64748B", lineHeight: 1.7, margin: 0 }}>
                          {event.description}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Patient card */}
            <div style={{ background: "#2563EB", borderRadius: "16px", padding: "20px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                <User size={24} color="white" />
              </div>
              <p style={{ fontSize: "16px", fontWeight: 800, color: "white", margin: "0 0 4px" }}>Marcus Thorne</p>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: "0 0 16px" }}>42 yrs • Male • Blood: O+</p>
              {[
                { label: "Allergies", value: "Penicillin (Severe)" },
                { label: "Primary Dr.", value: "Dr. S. Jenkins" },
                { label: "Last Visit", value: "Oct 24, 2024" },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", fontWeight: 700, margin: "0 0 2px", letterSpacing: "0.06em" }}>{item.label}</p>
                  <p style={{ fontSize: "13px", color: "white", fontWeight: 600, margin: 0 }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Chronic Conditions */}
            <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "16px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>Chronic Conditions</h3>
              {[
                { label: "Hypertension", status: "Active", color: "#2563EB" },
                { label: "Hyperlipidaemia", status: "Active", color: "#2563EB" },
                { label: "Pre-Diabetes", status: "Monitoring", color: "#F59E0B" },
              ].map(c => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>{c.label}</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: c.color }}>{c.status}</span>
                </div>
              ))}
            </div>

            {/* Current Meds */}
            <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "16px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>Current Medications</h3>
              {[
                "Nitroglycerin 0.4mg SL PRN",
                "Atorvastatin 40mg daily",
                "Ramipril 5mg daily",
              ].map((med, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: i < 2 ? "1px solid #F1F5F9" : "none" }}>
                  <Pill size={13} color="#7C3AED" />
                  <span style={{ fontSize: "12px", color: "#374151" }}>{med}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
