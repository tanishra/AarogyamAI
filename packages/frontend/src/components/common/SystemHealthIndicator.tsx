'use client';

import { useState, useEffect } from 'react';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  lastSuccessfulRequest: Date | null;
  averageResponseTime: number;
  consecutiveFailures: number;
}

export function SystemHealthIndicator() {
  const [health, setHealth] = useState<HealthStatus>({
    status: 'healthy',
    lastSuccessfulRequest: new Date(),
    averageResponseTime: 0,
    consecutiveFailures: 0,
  });
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Monitor API health from localStorage (updated by API interceptor)
    const checkHealth = () => {
      const healthData = localStorage.getItem('apiHealth');
      if (healthData) {
        try {
          const parsed = JSON.parse(healthData);
          setHealth({
            status: parsed.status || 'healthy',
            lastSuccessfulRequest: parsed.lastSuccessfulRequest ? new Date(parsed.lastSuccessfulRequest) : null,
            averageResponseTime: parsed.averageResponseTime || 0,
            consecutiveFailures: parsed.consecutiveFailures || 0,
          });
        } catch (e) {
          console.error('Failed to parse health data', e);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (health.status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'down':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (health.status) {
      case 'healthy':
        return 'All Systems Operational';
      case 'degraded':
        return 'Performance Degraded';
      case 'down':
        return 'System Unavailable';
      default:
        return 'Unknown';
    }
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatLastRequest = (date: Date | null) => {
    if (!date) return 'Never';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        {/* Compact View */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 transition-colors w-full"
        >
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
          <span className="text-xs font-medium text-gray-700">{getStatusText()}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded View */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-4 space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Status</div>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
                <span className="text-sm text-gray-900">{getStatusText()}</span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Response Time</div>
              <div className="text-sm text-gray-900">
                {formatResponseTime(health.averageResponseTime)}
                {health.averageResponseTime > 5000 && (
                  <span className="ml-2 text-xs text-yellow-600">⚠ Slow</span>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Last Request</div>
              <div className="text-sm text-gray-900">
                {formatLastRequest(health.lastSuccessfulRequest)}
              </div>
            </div>

            {health.consecutiveFailures > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-2">
                <div className="text-xs font-semibold text-red-900">
                  ⚠ {health.consecutiveFailures} consecutive failures
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                Version: 1.0.0 • Deployed: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
