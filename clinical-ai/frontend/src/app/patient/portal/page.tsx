"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bell, User, Calendar, ClipboardList, FileText,
  Heart, ChevronRight, CheckCircle, Circle, ArrowRight,
  MapPin, Phone, BookOpen, Shield, CreditCard, Activity
} from "lucide-react";

const navItems = ["Dashboard", "Appointments", "Medical Records", "Messages"];

export default function PatientPortal() {
  const router = useRouter();
  const [tier2Hover, setTier2Hover] = useState(false);

  return (
    <div style={{
      minHeight: "100vh", background: "#F8FAFC",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>

      {/* Navbar */}
      <div style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 40px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{
          display: "flex", alignItems: "center", height: "60px", gap: "40px",
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "8px" }}>
            <div style={{
              width: "30px", height: "30px", borderRadius: "8px",
              background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "white" }}>Z</span>
            </div>
            <div>
              <span style={{ fontSize: "13px", fontWeight: 800, color: "#0F172A" }}>ZENPATH </span>
              <span style={{ fontSize: "13px", fontWeight: 400, color: "#94A3B8" }}>CLINIC</span>
            </div>
          </div>

          {navItems.map((item, i) => (
            <button key={item} style={{
              fontSize: "14px", fontWeight: i === 0 ? 700 : 500,
              color: i === 0 ? "#2563EB" : "#64748B",
              background: "none", border: "none", cursor: "pointer",
              borderBottom: i === 0 ? "2px solid #2563EB" : "2px solid transparent",
              paddingBottom: "2px", fontFamily: "inherit",
            }}>{item}</button>
          ))}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }}>
              <Bell size={18} />
            </button>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%",
              background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User size={16} color="#D97706" />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px" }}>

          {/* Left */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Welcome */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>
                Welcome back, James.
              </h1>
              <p style={{ fontSize: "14px", color: "#64748B", margin: 0 }}>
                Complete your pre-visit preparation for your upcoming appointment.
              </p>
            </motion.div>

            {/* Appointment Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              style={{
                background: "white", borderRadius: "16px",
                border: "1px solid #E5E7EB", padding: "20px 24px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                <div style={{
                  background: "#F0F4F8", borderRadius: "12px",
                  padding: "12px 16px", textAlign: "center", minWidth: "60px",
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", letterSpacing: "0.08em" }}>OCT</div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "#0F172A", lineHeight: 1 }}>24</div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#10B981" }}>Confirmed</span>
                  </div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                    Annual Wellness Checkup
                  </h3>
                  <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>
                    10:30 AM — Dr. Sarah Mitchell
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button style={{
                  padding: "9px 16px", borderRadius: "10px",
                  border: "1.5px solid #E5E7EB", background: "white",
                  fontSize: "13px", fontWeight: 600, color: "#374151",
                  cursor: "pointer", fontFamily: "inherit",
                }}>Reschedule</button>
                <button style={{
                  padding: "9px 16px", borderRadius: "10px",
                  border: "none", background: "#2563EB",
                  fontSize: "13px", fontWeight: 700, color: "white",
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
                }}>View Details</button>
              </div>
            </motion.div>

            {/* Pending Questionnaires */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0F172A", margin: 0 }}>Pending Questionnaires</h3>
                <span style={{ fontSize: "12px", color: "#64748B", fontWeight: 500 }}>2 Tasks</span>
              </div>

              {[
                {
                  icon: ClipboardList, color: "#F59E0B",
                  title: "Initial Intake Questionnaire",
                  sub: "Required for your next session. Est. 5-8 minutes.",
                  progress: 45, action: "Start Questionnaire", primary: true,
                  route: "/patient/questionnaire",
                },
                {
                  icon: Activity, color: "#64748B",
                  title: "Symptom Tracker Update",
                  sub: "Please update your recent symptoms for the past 7 days.",
                  progress: null, action: "Resume", primary: false,
                  route: "/patient/questionnaire",
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px", borderRadius: "12px", border: "1px solid #F1F5F9",
                    background: "#F8FAFC", marginBottom: i === 0 ? "10px" : 0,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                      <div style={{
                        width: "38px", height: "38px", borderRadius: "10px",
                        background: item.color + "20", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon size={18} color={item.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 2px" }}>{item.title}</p>
                        <p style={{ fontSize: "12px", color: "#94A3B8", margin: 0 }}>{item.sub}</p>
                        {item.progress && (
                          <div style={{ marginTop: "6px" }}>
                            <div style={{ height: "3px", background: "#E5E7EB", borderRadius: "99px", width: "160px" }}>
                              <div style={{ height: "100%", width: `${item.progress}%`, background: "#2563EB", borderRadius: "99px" }} />
                            </div>
                            <span style={{ fontSize: "10px", color: "#94A3B8", fontWeight: 500 }}>{item.progress}% Complete</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => router.push(item.route)}
                      style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        padding: "9px 16px", borderRadius: "10px",
                        border: item.primary ? "none" : "1.5px solid #E5E7EB",
                        background: item.primary ? "#2563EB" : "white",
                        fontSize: "12px", fontWeight: 700,
                        color: item.primary ? "white" : "#374151",
                        cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                        boxShadow: item.primary ? "0 4px 10px rgba(37,99,235,0.25)" : "none",
                      }}
                    >
                      {item.action} {item.primary && <ArrowRight size={13} />}
                    </button>
                  </div>
                );
              })}
            </motion.div>

            {/* Consent Tiers */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "20px 24px" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0F172A", margin: 0 }}>Clinical Consent Tiers</h3>
                <button style={{ fontSize: "12px", color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
                  Manage All
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {/* Tier 1 — Signed */}
                <div style={{
                  borderRadius: "14px", border: "1.5px solid #E5E7EB",
                  padding: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563EB", letterSpacing: "0.08em" }}>TIER 1</span>
                    <CheckCircle size={16} color="#10B981" />
                  </div>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>General Care Consent</p>
                  <p style={{ fontSize: "12px", color: "#94A3B8", margin: "0 0 8px" }}>
                    Permission for routine examinations and clinic operations.
                  </p>
                  <p style={{ fontSize: "11px", color: "#CBD5E1", margin: 0 }}>Signed: Oct 10, 2023</p>
                </div>

                {/* Tier 2 — Pending */}
                <div style={{
                  borderRadius: "14px", border: "1.5px solid #E5E7EB",
                  padding: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em" }}>TIER 2</span>
                    <Circle size={16} color="#CBD5E1" />
                  </div>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>Data Synthesis Consent</p>
                  <p style={{ fontSize: "12px", color: "#94A3B8", margin: "0 0 10px" }}>
                    Allows AI-assisted synthesis of your medical records for better insights.
                  </p>
                  <button
                    onMouseEnter={() => setTier2Hover(true)}
                    onMouseLeave={() => setTier2Hover(false)}
                    style={{
                      fontSize: "12px", fontWeight: 700,
                      color: tier2Hover ? "#1D4ED8" : "#2563EB",
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: "inherit", padding: 0,
                      display: "flex", alignItems: "center", gap: "4px",
                    }}
                  >
                    Review & Sign <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Latest Vitals */}
            <motion.div
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
              style={{
                background: "#2563EB", borderRadius: "16px", padding: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <Heart size={16} color="white" fill="white" />
                <span style={{ fontSize: "14px", fontWeight: 700, color: "white" }}>Latest Vitals</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                {[
                  { label: "Blood Pressure", value: "118/75", sub: "Optimal" },
                  { label: "Heart Rate", value: "68 bpm", sub: "Steady" },
                ].map(v => (
                  <div key={v.label} style={{
                    background: "rgba(255,255,255,0.15)", borderRadius: "12px", padding: "12px",
                  }}>
                    <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", margin: "0 0 4px", fontWeight: 500 }}>{v.label}</p>
                    <p style={{ fontSize: "18px", fontWeight: 800, color: "white", margin: "0 0 2px" }}>{v.value}</p>
                    <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", margin: 0 }}>{v.sub}</p>
                  </div>
                ))}
              </div>
              <button style={{
                width: "100%", padding: "10px", borderRadius: "10px",
                background: "rgba(255,255,255,0.2)", border: "none",
                fontSize: "13px", fontWeight: 700, color: "white",
                cursor: "pointer", fontFamily: "inherit",
              }}>View History</button>
            </motion.div>

            {/* Clinic Info */}
            <motion.div
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
              style={{
                background: "white", borderRadius: "16px",
                border: "1px solid #E5E7EB", padding: "18px",
              }}
            >
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>ZenPath Main Clinic</h3>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <MapPin size={14} color="#94A3B8" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#374151", margin: "0 0 2px" }}>Medical Arts Building</p>
                  <p style={{ fontSize: "12px", color: "#94A3B8", margin: 0 }}>123 Health Ave, Suite 400<br />New York, NY 10012</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <Phone size={13} color="#94A3B8" />
                <span style={{ fontSize: "12px", color: "#64748B" }}>(555) 123-4567</span>
              </div>
              <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: "12px" }}>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", margin: "0 0 8px" }}>RESOURCES</p>
                {[
                  { icon: BookOpen, label: "Appointment Guide" },
                  { icon: Shield, label: "Privacy Policy" },
                  { icon: CreditCard, label: "Billing & Insurance" },
                ].map(r => {
                  const Icon = r.icon;
                  return (
                    <button key={r.label} style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      fontSize: "12px", color: "#2563EB", fontWeight: 600,
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: "inherit", padding: "3px 0", width: "100%",
                    }}>
                      <Icon size={13} /> {r.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981" }} />
                <span style={{ fontSize: "11px", color: "#94A3B8" }}>Systems Nominal • Patient Portal v2.4.0</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}