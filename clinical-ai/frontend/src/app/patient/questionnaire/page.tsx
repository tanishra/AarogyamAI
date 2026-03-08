"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle, Radio, Shield, Sparkles } from "lucide-react";

import { finalizeIntake } from "@/lib/api";
import { IntakeWsClient, type IntakeWsEnvelope } from "@/lib/intake-ws";
import { useAuthStore } from "@/store/auth.store";

type ChatMessage = {
  id: string;
  role: "assistant" | "patient" | "system";
  text: string;
  at: string;
  isSummary?: boolean;
};

export default function PatientQuestionnaire() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const offline = params.get("offline") === "1";
  const token = useAuthStore((s) => s.token);

  const [connected, setConnected] = useState(false);
  const [, setSummary] = useState("No intake responses submitted yet.");
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [emergency, setEmergency] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const wsRef = useRef<IntakeWsClient | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const streamTimersRef = useRef<number[]>([]);

  const canRunLive = Boolean(token && sessionId && !offline);

  const stopAllMessageStreams = useCallback(() => {
    for (const timer of streamTimersRef.current) {
      window.clearInterval(timer);
    }
    streamTimersRef.current = [];
  }, []);

  const appendAssistantMessage = useCallback((
    text: string,
    opts?: {
      replaceKickoffIfNoPatient?: boolean;
      customId?: string;
      stream?: boolean;
      streamIntervalMs?: number;
    }
  ) => {
    const id = opts?.customId ?? `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const at = new Date().toISOString();
    const stream = opts?.stream ?? true;
    const streamInterval = opts?.streamIntervalMs ?? 18;

    setMessages((prev) => {
      const hasPatientReply = prev.some((m) => m.role === "patient");
      const kickoffIndex = prev.findIndex((m) => m.id === "assistant-kickoff");

      if (opts?.replaceKickoffIfNoPatient && kickoffIndex >= 0 && !hasPatientReply) {
        const next = [...prev];
        next[kickoffIndex] = { id, role: "assistant", text: stream ? "" : text, at };
        return next;
      }

      if (opts?.customId && prev.some((m) => m.id === opts.customId)) {
        return prev;
      }

      return [...prev, { id, role: "assistant", text: stream ? "" : text, at }];
    });

    if (!stream) return;

    let cursor = 0;
    const step = Math.max(2, Math.ceil(text.length / 40));
    const timer = window.setInterval(() => {
      cursor = Math.min(text.length, cursor + step);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                text: text.slice(0, cursor),
              }
            : m
        )
      );
      if (cursor >= text.length) {
        window.clearInterval(timer);
        streamTimersRef.current = streamTimersRef.current.filter((t) => t !== timer);
      }
    }, streamInterval);
    streamTimersRef.current.push(timer);
  }, []);

  useEffect(() => {
    chatViewportRef.current?.scrollTo({
      top: chatViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    return () => {
      stopAllMessageStreams();
      wsRef.current?.disconnect();
    };
  }, [stopAllMessageStreams]);

  useEffect(() => {
    if (!canRunLive) return;

    const ws = new IntakeWsClient(sessionId, token!, {
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onEvent: (evt: IntakeWsEnvelope) => {
        const p = evt.payload ?? {};

        if (evt.event === "assistant.question") {
          const questionText = String(p.question_text ?? "Please continue.");
          appendAssistantMessage(questionText, {
            replaceKickoffIfNoPatient: true,
            stream: true,
          });
          setProcessing(false);
          return;
        }

        if (evt.event === "intake.summary.updated") {
          setSummary((prev) => String(p.summary ?? prev));
          return;
        }

        if (evt.event === "intake.emergency_flag") {
          setEmergency(String(p.advisory ?? "Urgent warning detected."));
          return;
        }

        if (evt.event === "intake.completed") {
          setCompleted(Boolean(p.questionnaire_done));
          setProcessing(false);
          const rawSummary = String(p.human_summary ?? "").trim();
          if (rawSummary) {
            try {
              const parsed = JSON.parse(rawSummary) as { display_text?: string };
              const displayText = parsed.display_text ?? rawSummary;
              setMessages((prev) => [
                ...prev,
                {
                  id: `summary-${Date.now()}`,
                  role: "assistant",
                  text: displayText,
                  at: new Date().toISOString(),
                  isSummary: true,
                },
              ]);
            } catch {
              appendAssistantMessage(rawSummary, { stream: true });
            }
          }
          return;
        }

        if (evt.event === "error") {
          setProcessing(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "system",
              text: String(p.message ?? "Something went wrong. Please try again."),
              at: new Date().toISOString(),
            },
          ]);
        }
      },
    });

    wsRef.current = ws;
    ws.connect();

    return () => {
      stopAllMessageStreams();
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, [appendAssistantMessage, canRunLive, sessionId, stopAllMessageStreams, token]);

  const submitAnswer = (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || completed) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `patient-${Date.now()}`,
        role: "patient",
        text,
        at: new Date().toISOString(),
      },
    ]);

    setProcessing(true);
    setInput("");

    if (wsRef.current) {
      wsRef.current.sendTextAnswer(text, "chat");
      return;
    }

    setSummary((prev) => `${prev} | ${text}`.slice(0, 1200));
    appendAssistantMessage("Thanks for sharing. Please continue, and tell me when you are done.", {
      stream: true,
    });
    setProcessing(false);
  };

  const finalize = async () => {
    if (completed) {
      router.push("/patient/portal");
      return;
    }

    try {
      if (wsRef.current) wsRef.current.complete();
      if (token && sessionId && !offline) {
        const done = await finalizeIntake(token, sessionId);
        setSummary(done.intake_summary_preview);
      }
      setCompleted(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `done-${Date.now()}`,
          role: "system",
          text: "Chat complete. Summary has been sent for nurse verification.",
          at: new Date().toISOString(),
        },
      ]);
    } catch {
      setCompleted(true);
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 20% 15%, rgba(37,99,235,0.12), transparent 42%), radial-gradient(circle at 84% 0%, rgba(56,189,248,0.14), transparent 35%), #ECF3F8",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: "16px 16px 14px",
      }}
    >
      <div style={{ maxWidth: "1180px", height: "100%", margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            borderRadius: "24px",
            padding: "22px",
            background: "linear-gradient(135deg, #0F172A, #1E3A8A)",
            boxShadow: "0 20px 45px rgba(15,23,42,0.32)",
            color: "white",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, fontSize: "11px", letterSpacing: "0.1em", fontWeight: 700, opacity: 0.8 }}>
                CLINICAL ZEN INTAKE ASSISTANT
              </p>
              <h1 style={{ margin: "7px 0 0", fontSize: "29px", lineHeight: 1.15, fontWeight: 800 }}>
                Clinical Zen Patient Chat Intake
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ borderRadius: "999px", padding: "7px 12px", fontSize: "11px", fontWeight: 700, background: "rgba(255,255,255,0.14)" }}>
                Text Chat Only
              </span>
              <span
                style={{
                  borderRadius: "999px",
                  padding: "7px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: connected ? "rgba(16,185,129,0.22)" : "rgba(245,158,11,0.22)",
                  color: connected ? "#BBF7D0" : "#FDE68A",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Radio size={12} /> {connected ? "Connected" : "Offline/fallback"}
              </span>
            </div>
          </div>
        </motion.div>

        {emergency ? (
          <div
            style={{
              borderRadius: "14px",
              padding: "11px 13px",
              marginBottom: "14px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#B91C1C",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={16} style={{ marginTop: "1px" }} />
            {emergency}
          </div>
        ) : null}

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            borderRadius: "22px",
            border: "1px solid #DDE6EE",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(2px)",
            boxShadow: "0 16px 35px rgba(30, 41, 59, 0.08)",
            padding: "16px",
            height: "calc(100% - 128px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            ref={chatViewportRef}
            style={{
              flex: 1,
              overflowY: "auto",
              borderRadius: "14px",
              border: "1px solid #E2E8F0",
              background: "linear-gradient(180deg, #F8FBFE, #F1F6FA)",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {messages.map((msg) => {
              const mine = msg.role === "patient";
              const system = msg.role === "system";
              const isSummary = Boolean(msg.isSummary);
              return (
                <div key={msg.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: system ? "100%" : "82%" }}>
                  <div
                    style={{
                      borderRadius: "14px",
                      padding: "10px 12px",
                      fontSize: "14px",
                      lineHeight: 1.55,
                      background: isSummary ? "#EFF6FF" : system ? "#ECFEFF" : mine ? "#1D4ED8" : "white",
                      color: isSummary ? "#1D4ED8" : system ? "#0E7490" : mine ? "white" : "#0F172A",
                      border: isSummary
                        ? "1.5px solid #93C5FD"
                        : system
                        ? "1px solid #A5F3FC"
                        : mine
                        ? "1px solid #1D4ED8"
                        : "1px solid #E2E8F0",
                      boxShadow: isSummary ? "0 4px 16px rgba(29,78,216,0.10)" : "0 4px 12px rgba(15,23,42,0.06)",
                      fontWeight: system ? 600 : 500,
                    }}
                  >
                    {isSummary ? (
                      <div>
                        {msg.text.split("\n").map((line, i) => {
                          const isBullet = line.trim().startsWith("•");
                          const isHeading = i === 0;
                          const isClosing = /^i'll pass/i.test(line.trim());
                          return (
                            <div
                              key={i}
                              style={{
                                marginBottom: isClosing ? "0" : "4px",
                                fontWeight: isHeading ? 700 : isBullet ? 600 : 500,
                                paddingTop: isClosing ? "8px" : "0",
                                borderTop: isClosing ? "1px solid #BFDBFE" : "none",
                                marginTop: isClosing ? "6px" : "0",
                              }}
                            >
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              );
            })}
            {processing ? (
              <div style={{ alignSelf: "flex-start", maxWidth: "70%" }}>
                <div
                  style={{
                    borderRadius: "14px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    background: "#FFFFFF",
                    color: "#475569",
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    fontWeight: 600,
                  }}
                >
                  Assistant is typing...
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ borderRadius: "14px", border: "1px solid #E2E8F0", padding: "10px", background: "white", marginTop: "10px" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!processing && input.trim()) {
                    submitAnswer();
                  }
                }
              }}
              placeholder="Type your message naturally..."
              style={{
                width: "100%",
                minHeight: "110px",
                borderRadius: "11px",
                border: "1px solid #DBE4EE",
                background: "#FCFEFF",
                padding: "12px",
                fontSize: "14px",
                color: "#0F172A",
                outline: "none",
                resize: "vertical",
                lineHeight: 1.45,
                fontFamily: "inherit",
                marginBottom: "10px",
              }}
            />

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={() => submitAnswer()}
                disabled={processing || !input.trim()}
                style={{
                  border: "none",
                  borderRadius: "12px",
                  padding: "11px 16px",
                  background: "#2563EB",
                  color: "white",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: processing || !input.trim() ? "not-allowed" : "pointer",
                  opacity: processing || !input.trim() ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                Send Message <ArrowRight size={14} />
              </button>

              <button
                onClick={finalize}
                style={{
                  marginLeft: "auto",
                  border: "none",
                  borderRadius: "12px",
                  padding: "11px 16px",
                  background: completed ? "#10B981" : "#0F172A",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {completed ? <CheckCircle size={14} /> : <Sparkles size={14} />}
                {completed ? "Back to Portal" : "Finish Intake"}
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: "10px",
              borderRadius: "12px",
              border: "1px solid #BBF7D0",
              background: "#F0FDF4",
              padding: "10px",
              fontSize: "11px",
              color: "#166534",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: 700,
            }}
          >
            <Shield size={13} /> Nurse verification is mandatory before AI synthesis handoff.
          </div>

        </motion.section>
      </div>
    </div>
  );
}
