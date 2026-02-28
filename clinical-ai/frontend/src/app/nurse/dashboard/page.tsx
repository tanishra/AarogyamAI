"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Users, FileText, Settings, Moon,
  Search, Clock, AlertTriangle, CheckCircle, Circle,
  ChevronRight, Activity, Thermometer, Heart, Wind,
  User, Bell, Plus
} from "lucide-react";

const patients = [
  {
    id: "JS",
    name: "James Sterling",
    patientId: "882-99-231",
    age: 42,
    complaint: "Chest Tightness, Shortness of Breath",
    waitTime: "14m",
    urgency: "urgent",
    color: "#4F46E5",
    vitals: { bp: "142/88", hr: 94, temp: 98.6, spo2: 97 },
    bpStatus: "elevated",
    hrStatus: "normal",
    tempStatus: "normal",
    spo2Status: "normal",
    consent: "TIER 1 SIGNED",
    questionnaire: "COMPLETED",
    intake: "IN PROGRESS",
    nurse: "Sarah Weaver, RN",
    doctor: "Dr. Bryan Kim",
    allergies: ["Penicillin (Severe)", "Latex (Mild)"],
    observation: "Patient reports intermittent chest tightness for the past 2 hours. Appears anxious. Rates pain at 4/10. No previous cardiac history noted in primary records.",
  },
  {
    id: "EM",
    name: "Elena Martinez",
    patientId: "104-12-892",
    age: 29,
    complaint: "Fever, Headache",
    waitTime: "22m",
    urgency: "routine",
    color: "#64748B",
    vitals: { bp: "118/76", hr: 82, temp: 101.2, spo2: 98 },
    bpStatus: "normal",
    hrStatus: "normal",
    tempStatus: "elevated",
    spo2Status: "normal",
    consent: "TIER 1 SIGNED",
    questionnaire: "COMPLETED",
    intake: "PENDING",
    nurse: "Sarah Weaver, RN",
    doctor: "Dr. Bryan Kim",
    allergies: ["None known"],
    observation: "Patient presents with 2-day fever and persistent headache. No stiff neck or photophobia reported.",
  },
  {
    id: "AR",
    name: "Arthur Reed",
    patientId: "554-32-110",
    age: 68,
    complaint: "Knee Pain, Swelling",
    waitTime: "31m",
    urgency: "routine",
    color: "#64748B",
    vitals: { bp: "128/82", hr: 76, temp: 98.2, spo2: 96 },
    bpStatus: "normal",
    hrStatus: "normal",
    tempStatus: "normal",
    spo2Status: "normal",
    consent: "PENDING",
    questionnaire: "PENDING",
    intake: "PENDING",
    nurse: "Sarah Weaver, RN",
    doctor: "Dr. Bryan Kim",
    allergies: ["Aspirin (Mild)"],
    observation: "Elderly patient with chronic knee pain. Reports increased swelling over last 3 days.",
  },
];

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

export default function NurseDashboard() {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(false);

  const patient = patients[selected];
  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      background: "#F0F4F8", fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>

      {/* Sidebar */}
      <div style={{
        width: "64px", background: "white",
        borderRight: "1px solid #E5E7EB",
        display: "flex", flexDirection: "column",
        alignItems: "center", padding: "20px 0",
        gap: "8px", position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px",
          background: "#4F46E5", display: "flex", alignItems: "center",
          justifyContent: "center", marginBottom: "16px",
        }}>
          <Plus size={18} color="white" />
        </div>

        {navItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <button key={i} style={{
              width: "44px", height: "44px", borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: item.active ? "#EEF2FF" : "transparent",
              border: "none", cursor: "pointer",
              color: item.active ? "#4F46E5" : "#94A3B8",
              transition: "all 0.2s",
            }}>
              <Icon size={20} />
            </button>
          );
        })}

        {/* Dark mode at bottom */}
        <button
          onClick={() => setDark(!dark)}
          style={{
            marginTop: "auto", width: "44px", height: "44px",
            borderRadius: "12px", display: "flex", alignItems: "center",
            justifyContent: "center", background: "transparent",
            border: "none", cursor: "pointer", color: "#94A3B8",
          }}>
          <Moon size={20} />
        </button>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: "64px", display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Patient Queue */}
        <div style={{
          width: "300px", background: "white",
          borderRight: "1px solid #E5E7EB",
          display: "flex", flexDirection: "column",
          height: "100vh", position: "sticky", top: 0,
        }}>
          {/* Queue Header */}
          <div style={{ padding: "20px 20px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: 0 }}>
                Waiting Patients
              </h2>
              <span style={{
                background: "#FEF3C7", color: "#D97706",
                fontSize: "11px", fontWeight: 700,
                padding: "3px 10px", borderRadius: "99px",
              }}>
                {patients.length} Waiting
              </span>
            </div>
            <p style={{ fontSize: "12px", color: "#94A3B8", margin: "0 0 12px" }}>Clinical Intake Queue</p>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
              <input
                placeholder="Find patient..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px 9px 34px",
                  borderRadius: "10px", border: "1.5px solid #E5E7EB",
                  background: "#F8FAFC", fontSize: "13px", color: "#0F172A",
                  outline: "none", fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          {/* Patient List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
            {filtered.map((p, i) => (
              <motion.div
                key={p.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelected(patients.indexOf(p))}
                style={{
                  padding: "14px", borderRadius: "14px", marginBottom: "8px",
                  cursor: "pointer", transition: "all 0.2s",
                  background: selected === patients.indexOf(p)
                    ? "linear-gradient(135deg, #4F46E5, #6366F1)"
                    : "white",
                  border: selected === patients.indexOf(p)
                    ? "none"
                    : "1.5px solid #E5E7EB",
                  position: "relative",
                }}
              >
                {p.urgency === "urgent" && selected !== patients.indexOf(p) && (
                  <span style={{
                    position: "absolute", top: "10px", right: "10px",
                    background: "#FEE2E2", color: "#DC2626",
                    fontSize: "9px", fontWeight: 700, padding: "2px 6px",
                    borderRadius: "4px", letterSpacing: "0.05em",
                  }}>URGENT</span>
                )}
                {p.urgency === "routine" && selected !== patients.indexOf(p) && (
                  <span style={{
                    position: "absolute", top: "10px", right: "10px",
                    background: "#F1F5F9", color: "#64748B",
                    fontSize: "9px", fontWeight: 700, padding: "2px 6px",
                    borderRadius: "4px", letterSpacing: "0.05em",
                  }}>ROUTINE</span>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "50%",
                    background: selected === patients.indexOf(p) ? "rgba(255,255,255,0.2)" : "#EEF2FF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "12px", fontWeight: 700,
                    color: selected === patients.indexOf(p) ? "white" : "#4F46E5",
                    flexShrink: 0,
                  }}>{p.id}</div>
                  <div>
                    <p style={{
                      fontSize: "13px", fontWeight: 700, margin: 0,
                      color: selected === patients.indexOf(p) ? "white" : "#0F172A",
                    }}>{p.name}</p>
                    <p style={{
                      fontSize: "11px", margin: "2px 0 0",
                      color: selected === patients.indexOf(p) ? "rgba(255,255,255,0.7)" : "#94A3B8",
                    }}>ID: {p.patientId} • Age {p.age}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "8px" }}>
                  <Clock size={11} color={selected === patients.indexOf(p) ? "rgba(255,255,255,0.6)" : "#94A3B8"} />
                  <span style={{
                    fontSize: "11px",
                    color: selected === patients.indexOf(p) ? "rgba(255,255,255,0.6)" : "#94A3B8",
                  }}>Waiting for {p.waitTime}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Patient Detail */}
        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
          <motion.div
            key={selected}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Patient Header */}
            <div style={{
              background: "white", borderRadius: "16px",
              border: "1px solid #E5E7EB", padding: "20px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{
                  width: "52px", height: "52px", borderRadius: "50%",
                  background: "#F1F5F9", display: "flex", alignItems: "center",
                  justifyContent: "center",
                }}>
                  <User size={24} color="#64748B" />
                </div>
                <div>
                  <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", margin: 0 }}>
                    {patient.name}
                  </h1>
                  <p style={{ fontSize: "13px", color: "#64748B", margin: "3px 0 0" }}>
                    Chief Complaint: {patient.complaint}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 16px", borderRadius: "10px",
                  border: "1.5px solid #E5E7EB", background: "white",
                  fontSize: "13px", fontWeight: 600, color: "#374151",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  <Clock size={14} />
                  View History
                </button>
                <button
                  onClick={() => router.push("/nurse/vitals")}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "10px 20px", borderRadius: "10px",
                    border: "none", background: "#4F46E5",
                    fontSize: "13px", fontWeight: 700, color: "white",
                    cursor: "pointer", fontFamily: "inherit",
                    boxShadow: "0 4px 12px rgba(79,70,229,0.3)",
                  }}>
                  <CheckCircle size={14} />
                  Mark Ready for Doctor
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "20px" }}>

              {/* Left Column */}
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

                {/* Vitals */}
                <div style={{
                  background: "white", borderRadius: "16px",
                  border: "1px solid #E5E7EB", padding: "20px 24px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                    <Activity size={16} color="#4F46E5" />
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: 0 }}>Vitals Record</h3>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    {[
                      { label: "BLOOD PRESSURE", value: patient.vitals.bp, unit: "mmHg", status: patient.bpStatus, icon: Heart },
                      { label: "HEART RATE", value: patient.vitals.hr, unit: "BPM", status: patient.hrStatus, icon: Activity },
                      { label: "BODY TEMP", value: patient.vitals.temp, unit: "°F", status: patient.tempStatus, icon: Thermometer },
                      { label: "SPO2", value: patient.vitals.spo2, unit: "%", status: patient.spo2Status, icon: Wind },
                    ].map((vital, i) => {
                      const Icon = vital.icon;
                      return (
                        <div key={i} style={{
                          background: "#F8FAFC", borderRadius: "12px",
                          padding: "16px", border: "1px solid #F1F5F9",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em" }}>
                              {vital.label}
                            </span>
                            <div style={{
                              width: "8px", height: "8px", borderRadius: "50%",
                              background: statusColor(vital.status),
                            }} />
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                            <span style={{ fontSize: "28px", fontWeight: 800, color: "#0F172A", lineHeight: 1 }}>
                              {vital.value}
                            </span>
                            <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 500 }}>{vital.unit}</span>
                          </div>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: statusColor(vital.status), marginTop: "4px", display: "block" }}>
                            {vital.status === "elevated" ? "↑ " : "✓ "}{statusLabel(vital.status)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Nursing Observation */}
                <div style={{
                  background: "white", borderRadius: "16px",
                  border: "1px solid #E5E7EB", padding: "20px 24px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <FileText size={16} color="#4F46E5" />
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: 0 }}>Nursing Observation</h3>
                  </div>
                  <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.7, margin: 0 }}>
                    {patient.observation}
                  </p>
                </div>
              </div>

              {/* Right Column */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                {/* Session Status */}
                <div style={{
                  background: "white", borderRadius: "16px",
                  border: "1px solid #E5E7EB", padding: "18px",
                }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 14px" }}>
                    Session Status
                  </h3>
                  {[
                    { label: "Consent Forms", value: patient.consent, done: patient.consent.includes("SIGNED") },
                    { label: "Questionnaire", value: patient.questionnaire, done: patient.questionnaire === "COMPLETED" },
                    { label: "Intake Vitals", value: patient.intake, done: patient.intake === "COMPLETED", active: patient.intake === "IN PROGRESS" },
                  ].map((item, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 12px", borderRadius: "10px", marginBottom: "6px",
                      border: item.active ? "1.5px solid #4F46E5" : "1.5px solid transparent",
                      background: item.active ? "#EEF2FF" : "#F8FAFC",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {item.done
                          ? <CheckCircle size={15} color="#10B981" />
                          : item.active
                            ? <Circle size={15} color="#4F46E5" fill="#4F46E5" />
                            : <Circle size={15} color="#CBD5E1" />
                        }
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>{item.label}</span>
                      </div>
                      <span style={{
                        fontSize: "9px", fontWeight: 700,
                        color: item.done ? "#10B981" : item.active ? "#4F46E5" : "#94A3B8",
                        letterSpacing: "0.06em",
                      }}>{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* Assigned Team */}
                <div style={{
                  background: "white", borderRadius: "16px",
                  border: "1px solid #E5E7EB", padding: "18px",
                }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>
                    Assigned Clinic Team
                  </h3>
                  {[
                    { initials: "SW", name: patient.nurse, role: "Lead Nurse (You)", color: "#4F46E5" },
                    { initials: "BK", name: patient.doctor, role: "On-call Physician", color: "#2563EB" },
                  ].map((member, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: i === 0 ? "10px" : 0 }}>
                      <div style={{
                        width: "34px", height: "34px", borderRadius: "50%",
                        background: member.color + "20", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: 700, color: member.color, flexShrink: 0,
                      }}>{member.initials}</div>
                      <div>
                        <p style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", margin: 0 }}>{member.name}</p>
                        <p style={{ fontSize: "11px", color: "#94A3B8", margin: "1px 0 0" }}>{member.role}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Allergy Alert */}
                {patient.allergies[0] !== "None known" && (
                  <div style={{
                    background: "#FFFBEB", borderRadius: "16px",
                    border: "1.5px solid #FDE68A", padding: "16px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                      <AlertTriangle size={14} color="#D97706" />
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#D97706" }}>Active Allergy Alerts</span>
                    </div>
                    {patient.allergies.map((a, i) => (
                      <p key={i} style={{ fontSize: "12px", color: "#92400E", margin: "2px 0", fontWeight: 500 }}>• {a}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}