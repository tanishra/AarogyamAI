'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { AnimatedButton, EmptyState, Skeleton } from '@/components/common';
import { apiClient } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const QUICK_PROMPTS = ['Chest pain', 'Shortness of breath', 'Headache', 'Fever', 'Medication reaction'];

export function PatientChat() {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergencyDetected, setEmergencyDetected] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isCompletingSession, setIsCompletingSession] = useState(false);

  const canSend = useMemo(
    () => !!inputMessage.trim() && !sessionComplete && !isTyping && !!sessionId,
    [inputMessage, sessionComplete, isTyping, sessionId]
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (user?.id) {
      void startChatSession();
    }
  }, [user?.id]);

  const normalizeMessage = (raw: any): Message => ({
    id: String(raw.id),
    role: raw.role === 'assistant' ? 'assistant' : 'user',
    content: String(raw.content || ''),
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
  });

  const fetchSessionMessages = async (id: string) => {
    const response = await apiClient.get(`/api/patient/chat/${id}`);
    const payload = response.data;
    const incoming = Array.isArray(payload?.data?.messages)
      ? payload.data.messages.map(normalizeMessage)
      : [];
    setMessages(incoming);
  };

  const startChatSession = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await apiClient.post('/api/patient/chat/start', {
        patientId: user?.id,
      });

      const data = response.data;
      const id = data?.data?.sessionId;
      setSessionId(id);

      if (data?.data?.welcomeMessage) {
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: data.data.welcomeMessage,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else if (id) {
        await fetchSessionMessages(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start AI nurse session');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!canSend || !sessionId) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    const draft: Message = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, draft]);
    setIsTyping(true);
    setError(null);

    try {
      const response = await apiClient.post('/api/patient/chat/message', {
        sessionId,
        message: userMessage,
      });

      const payload = response.data;
      const aiText = payload?.data?.response || '';

      if (payload?.data?.isEmergency) {
        setEmergencyDetected(true);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: aiText,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message failed to send');
    } finally {
      setIsTyping(false);
    }
  };

  const completeSession = async () => {
    if (!sessionId) {
      console.error('[PatientChat] No session ID available');
      alert('No active session to complete');
      return;
    }

    if (!confirm('Complete this session? Your conversation will be saved and sent to the medical team.')) {
      return;
    }

    console.log('[PatientChat] Starting session completion for:', sessionId);
    setIsCompletingSession(true);
    setError(null);

    try {
      console.log('[PatientChat] Calling API to complete session...');
      const response = await apiClient.post(`/api/patient/chat/${sessionId}/complete`);
      console.log('[PatientChat] API Response:', response.data);
      
      alert('Session completed successfully! Your intake summary has been saved.');
      
      // Mark as complete
      setSessionComplete(true);
      
      // Wait 1 second then reset
      setTimeout(() => {
        console.log('[PatientChat] Resetting UI for new session');
        setSessionComplete(false);
        setMessages([]);
        setSessionId(null);
        setEmergencyDetected(false);
        setInputMessage('');
        setIsCompletingSession(false);
        
        // Start new session
        console.log('[PatientChat] Starting new session...');
        void startChatSession();
      }, 1000);
    } catch (err: any) {
      console.error('[PatientChat] Complete session error:', err);
      console.error('[PatientChat] Error details:', {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
      });
      
      const errorMsg = err?.response?.data?.message || err?.message || 'Failed to complete session';
      setError(`Error: ${errorMsg}`);
      alert(`Failed to complete session: ${errorMsg}`);
      setIsCompletingSession(false);
    }
  };

  if (isLoading && !messages.length) {
    return (
      <div className="ui-surface overflow-hidden p-6">
        <div className="mb-4 h-1 w-32 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
        <Skeleton className="mb-4 h-5 w-52" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="ml-auto h-16 w-1/2" />
          <Skeleton className="h-16 w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {emergencyDetected && (
        <div className="ui-surface border-amber-200 bg-gradient-to-r from-amber-50/90 to-orange-50/90 p-4 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-amber-800">Potential High-Risk Symptoms Detected</h3>
              <p className="mt-1 text-sm text-amber-700">If this is life-threatening, call 911 immediately.</p>
            </div>
            <AnimatedButton variant="danger" size="sm" onClick={() => window.open('tel:911')}>
              Emergency Call
            </AnimatedButton>
          </div>
        </div>
      )}

      {error ? (
        <div className="ui-surface border-red-200 bg-red-50/80 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="ui-surface overflow-hidden">
        <div className="border-b border-slate-200 bg-gradient-to-r from-white via-blue-50/50 to-cyan-50/50 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">AI Nursing Intake</p>
              <p className="mt-1 text-xs text-slate-500">Active session for pre-consultation preparation and triage context</p>
            </div>
            <AnimatedButton 
              variant="secondary" 
              size="sm" 
              onClick={completeSession} 
              disabled={sessionComplete || isCompletingSession || !sessionId || messages.length < 2}
            >
              {isCompletingSession ? 'Completing...' : sessionComplete ? 'Completed' : 'Complete Session'}
            </AnimatedButton>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              `${messages.length} messages`,
              emergencyDetected ? 'Emergency flagged' : 'No emergency flag',
              sessionComplete ? 'Session closed' : 'Session active',
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-blue-200/70 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-blue-700"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto bg-gradient-to-b from-white to-slate-50/70 p-5">
          {!messages.length ? (
            <EmptyState
              title="No messages yet"
              description="Start by describing your current concern in plain words."
            />
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] ${message.role === 'user' ? 'items-end' : 'items-start'} flex flex-col animate-fade-in`}
                  >
                    <span className="mb-1 text-xs text-slate-400">
                      {message.role === 'assistant' ? 'AI Nurse' : 'You'}
                    </span>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed transition-transform duration-200 hover:scale-[1.01] ${
                        message.role === 'user'
                          ? 'bg-gradient-to-br from-blue-600 via-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/20'
                          : 'border border-slate-200 bg-white/95 text-slate-800 shadow-sm'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                    AI Nurse is typing...
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-gradient-to-r from-slate-50/80 via-blue-50/30 to-cyan-50/30 px-5 py-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setInputMessage(prompt)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:border-cyan-200 hover:text-slate-900"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-3">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Describe your symptoms..."
              disabled={sessionComplete || isTyping}
              rows={2}
              className="ui-focus-ring w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />
            <AnimatedButton onClick={sendMessage} disabled={!canSend} className="mb-0.5">
              Send
            </AnimatedButton>
          </div>
        </div>
      </div>

      {sessionComplete && (
        <div className="ui-surface border-green-200 bg-gradient-to-r from-green-50/90 to-emerald-50/90 p-4 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-green-800">Session Completed Successfully</h3>
              <p className="mt-1 text-sm text-green-700">
                Your intake summary has been saved and is now available to the medical team. You can start a new session anytime.
              </p>
            </div>
            <AnimatedButton 
              variant="primary" 
              size="sm" 
              onClick={() => {
                setSessionComplete(false);
                setMessages([]);
                setSessionId(null);
                setEmergencyDetected(false);
                void startChatSession();
              }}
            >
              New Session
            </AnimatedButton>
          </div>
        </div>
      )}
    </div>
  );
}
