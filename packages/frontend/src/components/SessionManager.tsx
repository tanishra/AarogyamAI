'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

const WARNING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function SessionManager() {
  const { sessionExpiresAt, refreshAccessToken, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (!sessionExpiresAt) {
      setShowWarning(false);
      return;
    }

    const checkSession = () => {
      const now = new Date().getTime();
      const expiresAt = sessionExpiresAt.getTime();
      const remaining = expiresAt - now;

      if (remaining <= 0) {
        // Session expired
        logout();
        return;
      }

      if (remaining <= WARNING_THRESHOLD_MS) {
        // Show warning
        setShowWarning(true);
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setShowWarning(false);
      }
    };

    // Check immediately
    checkSession();

    // Check every second
    const interval = setInterval(checkSession, 1000);

    return () => clearInterval(interval);
  }, [sessionExpiresAt, logout]);

  const handleExtendSession = async () => {
    try {
      await refreshAccessToken();
      setShowWarning(false);
    } catch (error) {
      console.error('Failed to extend session:', error);
    }
  };

  if (!showWarning) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 p-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center">
          <svg
            className="h-5 w-5 text-yellow-400 mr-2"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-yellow-800">
            Your session will expire in {timeRemaining}
          </span>
        </div>
        <button
          onClick={handleExtendSession}
          className="bg-yellow-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-yellow-700"
        >
          Extend Session
        </button>
      </div>
    </div>
  );
}
