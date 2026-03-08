'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { EmptyState, Skeleton } from '@/components/common';

interface ChatSession {
  id: string;
  status: string;
  startedAt?: string;
  started_at?: string;
  completedAt?: string;
  completed_at?: string;
  emergencyDetected?: boolean;
  emergency_detected?: boolean;
  messageCount?: number;
  message_count?: number;
}

export function MedicalHistory() {
  const { user, token } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selected = useMemo(() => sessions.find((s) => s.id === selectedSession), [sessions, selectedSession]);

  useEffect(() => {
    if (user && token) {
      void loadChatHistory();
    }
  }, [user, token]);

  const loadChatHistory = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/patient/chat/history', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to load chat history');
      const data = await response.json();
      console.log('[MedicalHistory] Loaded sessions:', data?.data?.sessions);
      setSessions(data?.data?.sessions || []);
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSessionDetails = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/patient/chat/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to load session details');
      const data = await response.json();
      console.log('[MedicalHistory] Loaded session details:', data.data);
      console.log('[MedicalHistory] Clinical reasoning:', data.data.clinicalReasoning);
      
      setSessionDetails(data.data);
      setSelectedSession(sessionId);
    } catch (error) {
      console.error('Failed to load session details:', error);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="ui-surface ui-surface-hover p-4">
        <h2 className="text-base font-semibold text-slate-900">Past Intake Sessions</h2>
        <p className="mt-1 text-xs text-slate-500">Review previous nurse-intake conversations.</p>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : sessions.length === 0 ? (
            <EmptyState
              title="No consultations yet"
              description="Once you complete your first intake, it will appear here."
            />
          ) : (
            sessions.map((session) => {
              const started = session.startedAt || session.started_at;
              const emergency = Boolean(session.emergencyDetected || session.emergency_detected);
              const active = selectedSession === session.id;

              return (
                <button
                  key={session.id}
                  onClick={() => loadSessionDetails(session.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                    active
                      ? 'border-cyan-300 bg-gradient-to-r from-cyan-50 to-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:scale-[1.01] hover:border-cyan-200 hover:shadow-sm'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        emergency
                          ? 'bg-red-100 text-red-700'
                          : session.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {emergency ? 'Emergency' : session.status || 'Session'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {started ? new Date(started).toLocaleDateString() : 'Unknown date'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {(session.messageCount || session.message_count || 0).toString()} messages
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {!selectedSession ? (
          <EmptyState
            title="Pick a session"
            description="Select any previous intake session to view summary and conversation history."
          />
        ) : !sessionDetails ? (
          <div className="ui-surface p-6">
            <Skeleton className="mb-4 h-6 w-52" />
            <Skeleton className="mb-2 h-16 w-full" />
            <Skeleton className="mb-2 h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="ui-surface ui-surface-hover p-5">
              <h3 className="text-base font-semibold text-slate-900">Session Overview</h3>
              <p className="mt-1 text-sm text-slate-500">
                {selected?.startedAt || selected?.started_at
                  ? new Date(selected.startedAt || selected.started_at || '').toLocaleString()
                  : 'No timestamp available'}
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {selected?.status === 'completed' ? '✓ Completed' : selected?.status || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Messages</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {selected?.messageCount || selected?.message_count || 0} messages
                  </p>
                </div>
                {sessionDetails?.summary && (
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chief Complaint</p>
                      <p className="mt-1 text-sm text-slate-800">
                        {sessionDetails.summary.chief_complaint || sessionDetails.summary.chiefComplaint || 'Not captured'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</p>
                      <p className="mt-1 text-sm text-slate-800">
                        {sessionDetails.summary.duration || 'Not captured'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Severity</p>
                      <p className="mt-1 text-sm text-slate-800">
                        {sessionDetails.summary.severity || 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Symptoms</p>
                      <p className="mt-1 text-sm text-slate-800">
                        {Array.isArray(sessionDetails.summary.symptoms) && sessionDetails.summary.symptoms.length > 0
                          ? sessionDetails.summary.symptoms.join(', ')
                          : 'None recorded'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="ui-surface ui-surface-hover p-5">
              <h3 className="text-base font-semibold text-slate-900">Conversation Timeline</h3>
              <div className="mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
                {(sessionDetails?.messages || []).map((message: any) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${
                        message.role === 'user'
                          ? 'bg-gradient-to-br from-blue-600 via-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-500/20'
                          : 'border border-slate-200 bg-white text-slate-800 shadow-sm'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {sessionDetails?.clinicalReasoning && (
              <div className="ui-surface ui-surface-hover p-5 border-2 border-green-200 bg-green-50/30">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">👨‍⚕️</span>
                  <h3 className="text-base font-semibold text-slate-900">Doctor's Diagnosis & Treatment Plan</h3>
                </div>

                {sessionDetails.clinicalReasoning.differentialDiagnosis && 
                 sessionDetails.clinicalReasoning.differentialDiagnosis.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-2">
                      Diagnosis
                    </p>
                    <ul className="space-y-2">
                      {sessionDetails.clinicalReasoning.differentialDiagnosis.map((diagnosis: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-slate-800">
                          <span className="text-green-600 mt-0.5">•</span>
                          <span>{diagnosis}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sessionDetails.clinicalReasoning.diagnosticPlan && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-2">
                      Treatment Plan
                    </p>
                    <div className="rounded-lg border border-green-200 bg-white p-3">
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">
                        {sessionDetails.clinicalReasoning.diagnosticPlan}
                      </p>
                    </div>
                  </div>
                )}

                {sessionDetails.clinicalReasoning.finalNotes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-2">
                      Doctor's Notes
                    </p>
                    <div className="rounded-lg border border-green-200 bg-white p-3">
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">
                        {sessionDetails.clinicalReasoning.finalNotes}
                      </p>
                    </div>
                  </div>
                )}

                {sessionDetails.clinicalReasoning.approvedAt && (
                  <p className="mt-4 text-xs text-slate-500">
                    Approved on {new Date(sessionDetails.clinicalReasoning.approvedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {console.log('[MedicalHistory] Rendering - has clinicalReasoning?', !!sessionDetails?.clinicalReasoning, sessionDetails?.clinicalReasoning)}
          </div>
        )}
      </div>
    </div>
  );
}
