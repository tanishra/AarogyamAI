"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronLeft, Clock } from "lucide-react";
import { getDoctorPatientContext, getDoctorQueue } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type QueueItem = Awaited<ReturnType<typeof getDoctorQueue>>["queue"][number];

export default function DoctorHistoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [chiefComplaint, setChiefComplaint] = useState("");

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
        const q = await getDoctorQueue(token);
        if (!active) return;
        setQueue(q.queue);

        const requested = params.get("session_id") ?? "";
        const resolved =
          q.queue.find((x) => x.session_id === requested)?.session_id ??
          q.queue[0]?.session_id ??
          "";
        setSessionId(resolved);

        if (resolved) {
          const context = await getDoctorPatientContext(token, resolved);
          if (!active) return;
          setChiefComplaint(
            context.structured_context?.chief_complaint ||
              q.queue.find((x) => x.session_id === resolved)?.chief_complaint ||
              ""
          );
        } else {
          setChiefComplaint("");
        }
      } catch (e) {
        if (!active) return;
        setError(`Failed to load history view: ${String(e)}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [token, role, router, params]);

  const timeline = useMemo(
    () =>
      queue.map((q, idx) => ({
        id: q.session_id,
        title: `Session ${q.session_id.slice(0, 8)}`,
        subtitle: q.chief_complaint || "Chief complaint unavailable",
        detail: `Urgency: ${q.urgency_flag}. Synthesis ready: ${
          q.synthesis_ready ? "Yes" : "No"
        }. Fallback active: ${q.fallback_active ? "Yes" : "No"}.`,
        at: new Date(q.ready_since),
        recent: idx === 0,
      })),
    [queue]
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "16px", padding: "16px 18px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontSize: "11px", fontWeight: 700, color: "#2563EB", letterSpacing: "0.08em" }}>LIVE HISTORY</p>
            <h1 style={{ margin: "4px 0 2px", fontSize: "24px", fontWeight: 800, color: "#0F172A" }}>Doctor Patient History</h1>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>
              {sessionId ? `Current Session ${sessionId}` : "No active session"}
            </p>
            {chiefComplaint && (
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
                Chief complaint: {chiefComplaint}
              </p>
            )}
          </div>
          <button
            onClick={() =>
              router.push(
                sessionId
                  ? `/doctor/dashboard?session_id=${sessionId}`
                  : "/doctor/dashboard"
              )
            }
            style={{
              border: "1px solid #E5E7EB",
              background: "white",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "13px",
              color: "#334155",
              padding: "9px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <ChevronLeft size={14} />
            Back to Dashboard
          </button>
        </div>

        {loading && <Panel text="Loading live timeline..." />}
        {!loading && error && <Panel text={error} danger />}
        {!loading && !error && timeline.length === 0 && (
          <Panel text="No patient sessions available in doctor queue." />
        )}

        {!loading && !error && timeline.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {timeline.map((event) => (
              <div key={event.id} style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "12px", padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <p style={{ margin: 0, fontWeight: 700, color: "#0F172A", fontSize: "14px" }}>{event.title}</p>
                    {event.recent && (
                      <span style={{ fontSize: "10px", fontWeight: 700, background: "#EFF6FF", color: "#2563EB", padding: "2px 7px", borderRadius: "6px" }}>
                        Recent
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748B", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Calendar size={12} />
                    {event.at.toLocaleDateString()}{" "}
                    <Clock size={12} style={{ marginLeft: 6 }} />
                    {event.at.toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ margin: "0 0 6px", color: "#475569", fontSize: "13px" }}>{event.subtitle}</p>
                <p style={{ margin: 0, color: "#64748B", fontSize: "12px" }}>{event.detail}</p>
              </div>
            ))}
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
