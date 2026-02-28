"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle, Plus, Trash2, ChevronRight, Save,
  Pill, Activity, Calendar, User, Zap, Clock, AlertTriangle
} from "lucide-react";

type Priority = "High" | "Medium" | "Routine";

interface TreatmentItem {
  id: number;
  category: string;
  action: string;
  priority: Priority;
  timeline: string;
  done: boolean;
}

const priorityColor = (p: Priority) =>
  p === "High" ? { bg: "#FEE2E2", text: "#DC2626" } :
  p === "Medium" ? { bg: "#FEF3C7", text: "#D97706" } :
  { bg: "#F1F5F9", text: "#64748B" };

const initialItems: TreatmentItem[] = [
  { id: 1, category: "Investigations", action: "Serial Troponin assay q6h × 3", priority: "High", timeline: "Immediate", done: false },
  { id: 2, category: "Investigations", action: "12-lead ECG monitoring — continuous", priority: "High", timeline: "Immediate", done: false },
  { id: 3, category: "Medications", action: "Sublingual Nitroglycerin 0.4mg PRN for acute episodes", priority: "High", timeline: "Immediate", done: true },
  { id: 4, category: "Medications", action: "Restart Atorvastatin 40mg PO daily", priority: "Medium", timeline: "Today", done: false },
  { id: 5, category: "Medications", action: "Dual antiplatelet therapy — pending troponin results", priority: "Medium", timeline: "Conditional", done: false },
  { id: 6, category: "Referrals", action: "Cardiology consult — stress test or cath evaluation", priority: "High", timeline: "Within 24h", done: false },
  { id: 7, category: "Referrals", action: "Dietitian referral for cardiac diet counselling", priority: "Routine", timeline: "This week", done: false },
  { id: 8, category: "Education", action: "Patient education: activity restrictions + warning signs", priority: "Medium", timeline: "Before discharge", done: false },
];

const categories = ["Investigations", "Medications", "Referrals", "Education"];

export default function TreatmentPlan() {
  const router = useRouter();
  const [items, setItems] = useState<TreatmentItem[]>(initialItems);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (id: number) => setItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const remove = (id: number) => setItems(prev => prev.filter(i => i.id !== id));

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false); setSaved(true);
    setTimeout(() => router.push("/doctor/history"), 1200);
  };

  const completed = items.filter(i => i.done).length;

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
              Doctor <span style={{ color: "#CBD5E1" }}>/</span> <span style={{ color: "#0F172A", fontWeight: 600 }}>Treatment Planning</span>
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
              <Zap size={13} color="#2563EB" /> AI Suggestions
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
              {saving
                ? <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : saved ? <><CheckCircle size={14} /> Saved</> : <><Save size={14} /> Commit Plan</>
              }
            </motion.button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "28px 24px" }}>

        {/* Page header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "20px", marginBottom: "24px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563EB", letterSpacing: "0.1em" }}>TREATMENT PLAN</span>
            </div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Marcus Thorne</h1>
            <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>Primary Dx: Unstable Angina Pectoris • Session PS-902</p>
          </div>

          {/* Progress */}
          <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "16px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#2563EB" }}>{completed}/{items.length}</div>
            <div style={{ fontSize: "11px", color: "#94A3B8", fontWeight: 600 }}>ACTIONS COMPLETE</div>
            <div style={{ height: "4px", background: "#F1F5F9", borderRadius: "99px", marginTop: "8px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(completed / items.length) * 100}%`, background: "#2563EB", borderRadius: "99px", transition: "width 0.4s" }} />
            </div>
          </div>
        </div>

        {/* Categories */}
        {categories.map(cat => {
          const catItems = items.filter(i => i.category === cat);
          if (catItems.length === 0) return null;
          const Icon = cat === "Medications" ? Pill : cat === "Investigations" ? Activity : cat === "Referrals" ? User : Calendar;

          return (
            <div key={cat} style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <Icon size={15} color="#64748B" />
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748B", letterSpacing: "0.08em" }}>
                  {cat.toUpperCase()}
                </span>
                <div style={{ flex: 1, height: "1px", background: "#E5E7EB" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {catItems.map(item => {
                  const pc = priorityColor(item.priority);
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      style={{
                        background: "white", borderRadius: "12px",
                        border: "1px solid #E5E7EB", padding: "14px 16px",
                        display: "flex", alignItems: "center", gap: "12px",
                        opacity: item.done ? 0.6 : 1, transition: "opacity 0.2s",
                      }}
                    >
                      <button
                        onClick={() => toggle(item.id)}
                        style={{
                          width: "22px", height: "22px", borderRadius: "50%",
                          border: item.done ? "none" : "2px solid #CBD5E1",
                          background: item.done ? "#10B981" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", flexShrink: 0, padding: 0,
                        }}
                      >
                        {item.done && <CheckCircle size={14} color="white" />}
                      </button>

                      <div style={{ flex: 1 }}>
                        <p style={{
                          fontSize: "14px", fontWeight: 600, color: "#0F172A", margin: "0 0 4px",
                          textDecoration: item.done ? "line-through" : "none",
                        }}>{item.action}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px",
                            background: pc.bg, color: pc.text,
                          }}>{item.priority}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#94A3B8" }}>
                            <Clock size={11} /> {item.timeline}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => remove(item.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", padding: "4px" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Add item */}
        <button style={{
          width: "100%", padding: "14px", borderRadius: "12px",
          border: "1.5px dashed #CBD5E1", background: "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          fontSize: "13px", fontWeight: 600, color: "#94A3B8",
          cursor: "pointer", fontFamily: "inherit", marginTop: "4px",
        }}>
          <Plus size={15} /> Add Treatment Action
        </button>

        {/* Alert */}
        <div style={{
          marginTop: "20px", background: "#FFFBEB", borderRadius: "12px",
          border: "1.5px solid #FDE68A", padding: "14px 16px",
          display: "flex", alignItems: "flex-start", gap: "10px",
        }}>
          <AlertTriangle size={15} color="#D97706" style={{ marginTop: "2px", flexShrink: 0 }} />
          <p style={{ fontSize: "13px", color: "#92400E", lineHeight: 1.6, margin: 0 }}>
            <strong>Allergy Alert:</strong> Patient has documented Penicillin allergy (Severe). Avoid all beta-lactam antibiotics if antibiotic therapy becomes necessary.
          </p>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}