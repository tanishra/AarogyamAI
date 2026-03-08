"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, Mic, MicOff, Sparkles } from "lucide-react";
import {
  getDoctorLiveSupport,
  getDoctorPatientContext,
  getDoctorQueue,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type QueueItem = Awaited<ReturnType<typeof getDoctorQueue>>["queue"][number];
type DoctorContext = Awaited<ReturnType<typeof getDoctorPatientContext>>;
type LiveSuggestion = Awaited<ReturnType<typeof getDoctorLiveSupport>>["suggestions"][number];

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{
      transcript: string;
    }>
  >;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export default function DoctorCommandPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [context, setContext] = useState<DoctorContext | null>(null);
  const [transcript, setTranscript] = useState("");
  const [suggestions, setSuggestions] = useState<LiveSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!token || role !== "doctor") {
      router.replace("/login");
      return;
    }

    let active = true;
    const run = async () => {
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
      } catch (e) {
        if (!active) return;
        setError(`Failed to load queue: ${String(e)}`);
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [token, role, router, params]);

  useEffect(() => {
    if (!token || !sessionId) {
      setContext(null);
      return;
    }
    let active = true;
    const run = async () => {
      setLoadingContext(true);
      try {
        const ctx = await getDoctorPatientContext(token, sessionId);
        if (!active) return;
        setContext(ctx);
      } catch {
        if (!active) return;
        setContext(null);
      } finally {
        if (active) setLoadingContext(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [token, sessionId]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const selected = useMemo(
    () => queue.find((q) => q.session_id === sessionId) ?? null,
    [queue, sessionId]
  );

  const toggleSpeech = () => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Browser speech recognition not available. Type transcript manually.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.onresult = (event: SpeechResultEvent) => {
      let combined = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        combined += event.results[i][0].transcript;
      }
      setTranscript((prev) => `${prev} ${combined}`.trim());
    };
    recognition.onerror = () => {
      setIsListening(false);
      setError("Speech recognition stopped unexpectedly.");
    };
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const generateSupport = async () => {
    if (!token || !sessionId) return;
    if (!transcript.trim()) {
      setError("Add live transcript notes before generating suggestions.");
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const res = await getDoctorLiveSupport(token, {
        session_id: sessionId,
        transcript_text: transcript.trim(),
      });
      setSuggestions(res.suggestions);
    } catch (e) {
      setError(`Failed to generate support suggestions: ${String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F2F6FB", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: "20px" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "14px 16px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontSize: "11px", color: "#3B82F6", fontWeight: 800, letterSpacing: "0.08em" }}>STAGE 3 • CLINICAL COMMAND</p>
            <h1 style={{ margin: "4px 0 0", fontSize: "26px", color: "#0F172A", fontWeight: 800 }}>Live Encounter Console</h1>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => router.push(`/doctor/differential?session_id=${sessionId}`)} style={{ border: "1px solid #D1D5DB", borderRadius: "10px", background: "white", color: "#334155", padding: "9px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
              Open Differential
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: "10px", borderRadius: "10px", border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", padding: "10px 12px", fontSize: "12px", fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "14px" }}>
          <section style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "12px", padding: "12px" }}>
            <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#64748B", fontWeight: 800, letterSpacing: "0.07em" }}>SESSION SELECTOR</p>
            {loading ? (
              <p style={{ margin: 0, fontSize: "12px", color: "#94A3B8" }}>Loading queue...</p>
            ) : queue.length === 0 ? (
              <p style={{ margin: 0, fontSize: "12px", color: "#94A3B8" }}>No sessions available.</p>
            ) : (
              queue.map((q) => {
                const active = q.session_id === sessionId;
                return (
                  <button
                    key={q.session_id}
                    onClick={() => setSessionId(q.session_id)}
                    style={{ width: "100%", textAlign: "left", border: active ? "1.5px solid #3B82F6" : "1px solid #E5E7EB", background: active ? "#EFF6FF" : "white", borderRadius: "10px", padding: "9px", marginBottom: "7px", cursor: "pointer" }}
                  >
                    <p style={{ margin: "0 0 3px", fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>{q.patient_name || "Patient"}</p>
                    <p style={{ margin: 0, fontSize: "11px", color: "#64748B" }}>{q.chief_complaint || "No complaint"}</p>
                  </button>
                );
              })
            )}

            <div style={{ marginTop: "10px", borderRadius: "10px", border: "1px solid #E5E7EB", background: "#F8FAFC", padding: "10px" }}>
              <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#64748B", fontWeight: 800, letterSpacing: "0.07em" }}>SYNTHESIS STATUS</p>
              {loadingContext ? (
                <p style={{ margin: 0, fontSize: "12px", color: "#94A3B8" }}>Loading context...</p>
              ) : context ? (
                <>
                  <p style={{ margin: "0 0 4px", fontSize: "12px", color: context.synthesis_ready ? "#166534" : "#92400E", fontWeight: 700 }}>
                    {context.synthesis_ready ? "Ready" : "Pending"}
                  </p>
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748B" }}>
                    Existing synthesis continues to use intake answers + vitals.
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "12px", color: "#94A3B8" }}>No context loaded.</p>
              )}
            </div>
          </section>

          <section style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "12px", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "24px", color: "#0F172A", fontWeight: 800 }}>
                Clinical Command: {selected?.patient_name || "Patient"}
              </h2>
              <button
                onClick={toggleSpeech}
                style={{ border: "1px solid #D1D5DB", borderRadius: "10px", background: isListening ? "#DBEAFE" : "white", color: "#334155", padding: "8px 11px", fontSize: "12px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                {isListening ? "Stop Mic" : "Start Mic"}
              </button>
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Capture live encounter notes/transcript here..."
              style={{ width: "100%", minHeight: "170px", borderRadius: "10px", border: "1px solid #CBD5E1", padding: "11px", resize: "vertical", outline: "none", fontFamily: "inherit", fontSize: "14px", color: "#334155", lineHeight: 1.5, marginBottom: "10px" }}
            />

            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <button
                onClick={() => setTranscript("")}
                style={{ border: "1px solid #D1D5DB", borderRadius: "10px", background: "white", color: "#334155", padding: "9px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
              >
                Clear Transcript
              </button>
              <button
                onClick={() => void generateSupport()}
                disabled={generating || !sessionId}
                style={{ border: "none", borderRadius: "10px", background: "#2563EB", color: "white", padding: "9px 12px", fontSize: "12px", fontWeight: 700, cursor: generating ? "not-allowed" : "pointer", opacity: generating ? 0.7 : 1, display: "flex", alignItems: "center", gap: "6px" }}
              >
                {generating ? <Activity size={13} /> : <Sparkles size={13} />}
                {generating ? "Generating..." : "Generate AI Action Suggestions"}
              </button>
            </div>

            <div style={{ borderRadius: "10px", border: "1px solid #E5E7EB", background: "#F8FAFC", padding: "10px" }}>
              <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800, color: "#64748B", letterSpacing: "0.07em" }}>REAL-TIME SUGGESTIONS</p>
              {suggestions.length === 0 ? (
                <p style={{ margin: 0, fontSize: "12px", color: "#94A3B8" }}>
                  No suggestions generated yet.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {suggestions.map((s) => (
                    <div key={s.suggestion_id} style={{ border: "1px solid #E5E7EB", background: "white", borderRadius: "10px", padding: "9px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                        <p style={{ margin: 0, fontSize: "13px", color: "#0F172A", fontWeight: 700 }}>{s.title}</p>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: s.urgency_flag === "critical" ? "#DC2626" : s.urgency_flag === "urgent" ? "#D97706" : "#64748B" }}>
                          {s.urgency_flag.toUpperCase()}
                        </span>
                      </div>
                      <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#475569", lineHeight: 1.45 }}>{s.rationale}</p>
                      <p style={{ margin: 0, fontSize: "11px", color: "#94A3B8" }}>Type: {s.suggestion_type}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
