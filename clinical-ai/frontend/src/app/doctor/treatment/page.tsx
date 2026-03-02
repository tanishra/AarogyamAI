"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Clock, Save, Trash2 } from "lucide-react";
import {
  getDoctorPatientContext,
  getDoctorQueue,
  saveDoctorReasoningDraft,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type PlanItem = {
  id: string;
  action: string;
  done: boolean;
  priority: "High" | "Medium" | "Routine";
};

export default function TreatmentPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [treatmentNote, setTreatmentNote] = useState("");

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
            setItems([]);
          }
          return;
        }
        const context = await getDoctorPatientContext(token, resolved);
        if (!active) return;
        setSessionId(resolved);

        const generated: PlanItem[] = [];
        context.differentials.slice(0, 5).forEach((d, index) => {
          generated.push({
            id: `diff-${d.consideration_id}`,
            action: `Review and manage: ${d.title}`,
            done: d.doctor_action === "accepted",
            priority: index === 0 ? "High" : index < 3 ? "Medium" : "Routine",
          });
        });
        if (context.vitals_summary) {
          generated.push({
            id: "vitals-recheck",
            action: "Re-check vitals trend and outlier flags before final decision.",
            done: false,
            priority: "Medium",
          });
        }
        if (generated.length === 0) {
          generated.push({
            id: "default-plan",
            action: "Collect full context and document treatment plan.",
            done: false,
            priority: "Routine",
          });
        }
        setItems(generated);
        setTreatmentNote(
          generated
            .map((g, idx) => `${idx + 1}. ${g.action}`)
            .join("\n")
        );
      } catch (e) {
        if (!active) return;
        setError(`Failed to load live treatment context: ${String(e)}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [token, role, router, params]);

  const completed = useMemo(() => items.filter((i) => i.done).length, [items]);

  const toggle = (id: string) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i))
    );
  const remove = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const saveAndContinue = async () => {
    if (!token || !sessionId || saving) return;
    setSaving(true);
    setError("");
    try {
      const completedItems = items.filter((i) => i.done);
      await saveDoctorReasoningDraft(token, {
        session_id: sessionId,
        plan: treatmentNote.trim(),
        rationale: `Treatment checklist completion: ${completedItems.length}/${items.length}`,
      });
      router.push(`/doctor/smart-note?session_id=${sessionId}`);
    } catch (e) {
      setError(`Failed to save treatment draft: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "16px", padding: "16px 18px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: "11px", color: "#2563EB", fontWeight: 700, letterSpacing: "0.08em", margin: 0 }}>LIVE TREATMENT</p>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0F172A", margin: "4px 0 2px" }}>Treatment Planning</h1>
            <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>
              {sessionId ? `Session ${sessionId}` : "No active session selected"}
            </p>
          </div>
          <button
            onClick={() => void saveAndContinue()}
            disabled={!sessionId || saving}
            style={{
              border: "none",
              borderRadius: "10px",
              background: "#2563EB",
              color: "white",
              fontWeight: 700,
              fontSize: "13px",
              padding: "10px 14px",
              cursor: sessionId && !saving ? "pointer" : "not-allowed",
              opacity: sessionId ? 1 : 0.6,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save & Open Smart Note"}
          </button>
        </div>

        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>
            Progress: <strong style={{ color: "#0F172A" }}>{completed}/{items.length}</strong> actions completed
          </p>
        </div>

        {loading && <Panel text="Loading live patient treatment actions..." />}
        {!loading && error && <Panel text={error} danger />}

        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  background: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "12px",
                  padding: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  opacity: item.done ? 0.65 : 1,
                }}
              >
                <button
                  onClick={() => toggle(item.id)}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    border: item.done ? "none" : "2px solid #CBD5E1",
                    background: item.done ? "#10B981" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {item.done && <CheckCircle size={14} color="white" />}
                </button>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 4px", fontSize: "14px", color: "#0F172A", fontWeight: 600 }}>
                    {item.action}
                  </p>
                  <p style={{ margin: 0, fontSize: "11px", color: "#64748B", display: "flex", alignItems: "center", gap: "5px" }}>
                    <Clock size={12} />
                    Priority: {item.priority}
                  </p>
                </div>
                <button
                  onClick={() => remove(item.id)}
                  style={{ border: "none", background: "none", color: "#94A3B8", cursor: "pointer" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "12px", padding: "12px" }}>
              <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#64748B", fontWeight: 700 }}>
                Treatment Plan Draft
              </p>
              <textarea
                value={treatmentNote}
                onChange={(e) => setTreatmentNote(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "140px",
                  borderRadius: "10px",
                  border: "1px solid #CBD5E1",
                  padding: "10px",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  color: "#334155",
                  lineHeight: 1.5,
                  resize: "vertical",
                  outline: "none",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div
      style={{
        background: danger ? "#FEF2F2" : "white",
        border: `1px solid ${danger ? "#FECACA" : "#E5E7EB"}`,
        borderRadius: "12px",
        padding: "14px",
        color: danger ? "#B91C1C" : "#64748B",
        fontSize: "13px",
        fontWeight: danger ? 600 : 500,
      }}
    >
      {text}
    </div>
  );
}
