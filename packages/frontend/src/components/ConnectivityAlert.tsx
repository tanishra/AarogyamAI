'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { isNetworkError } from '@/lib/errors';

interface ConnectivityContextValue {
  isOnline: boolean;
  consecutiveFailures: number;
  recordFailure: (error: unknown) => void;
  recordSuccess: () => void;
  retry: () => void;
}

const ConnectivityContext = createContext<ConnectivityContextValue | undefined>(undefined);

const MAX_CONSECUTIVE_FAILURES = 3;

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [showAlert, setShowAlert] = useState(false);

  // Monitor browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setConsecutiveFailures(0);
      setShowAlert(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowAlert(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const recordFailure = useCallback((error: unknown) => {
    if (isNetworkError(error)) {
      setConsecutiveFailures((prev) => {
        const newCount = prev + 1;
        if (newCount >= MAX_CONSECUTIVE_FAILURES) {
          setShowAlert(true);
        }
        return newCount;
      });
    }
  }, []);

  const recordSuccess = useCallback(() => {
    setConsecutiveFailures(0);
    setShowAlert(false);
  }, []);

  const retry = useCallback(() => {
    setConsecutiveFailures(0);
    setShowAlert(false);
  }, []);

  const value: ConnectivityContextValue = {
    isOnline,
    consecutiveFailures,
    recordFailure,
    recordSuccess,
    retry,
  };

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
      {showAlert && <ConnectivityAlertBanner onRetry={retry} isOnline={isOnline} />}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity must be used within ConnectivityProvider');
  }
  return context;
}

interface ConnectivityAlertBannerProps {
  onRetry: () => void;
  isOnline: boolean;
}

function ConnectivityAlertBanner({ onRetry, isOnline }: ConnectivityAlertBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="font-semibold">
              {isOnline ? 'Connection Issues' : 'No Internet Connection'}
            </p>
            <p className="text-sm">
              {isOnline
                ? 'Unable to reach the server. Please check your connection.'
                : 'You are currently offline. Please check your internet connection.'}
            </p>
          </div>
        </div>
        <button
          onClick={onRetry}
          className="bg-white text-red-600 px-4 py-2 rounded-md font-medium hover:bg-gray-100 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
