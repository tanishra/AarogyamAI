'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { setAuthTokenGetter, setRefreshTokenFunction } from '@/lib/api';
import type { AuthState, User, LoginCredentials, LoginResponse, RefreshResponse } from './types';

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiration

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    refreshToken: null,
    role: null,
    isAuthenticated: false,
    sessionExpiresAt: null,
  });

  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load auth state from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      const user = JSON.parse(userStr);
      setAuthState({
        user,
        token,
        refreshToken,
        role: user.role,
        isAuthenticated: true,
        sessionExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      });
    }
  }, []);

  // Setup API client token getter
  useEffect(() => {
    console.log('[AuthContext] Setting up token getter, token available:', !!authState.token);
    setAuthTokenGetter(() => authState.token);
  }, [authState.token]);

  const scheduleTokenRefresh = useCallback((expiresAt: Date) => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    const now = new Date().getTime();
    const expiresAtMs = expiresAt.getTime();
    const refreshAt = expiresAtMs - REFRESH_BUFFER_MS;
    const delay = refreshAt - now;

    if (delay > 0) {
      refreshTimeoutRef.current = setTimeout(async () => {
        try {
          await refreshAccessToken();
        } catch (error) {
          console.error('Auto token refresh failed:', error);
          // If auto-refresh fails, logout user
          await logout();
        }
      }, delay);
    }
  }, []);

  const refreshAccessToken = useCallback(async () => {
    if (!authState.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: authState.refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data: RefreshResponse = await response.json();
    const expiresAt = new Date(data.expiresAt);

    setAuthState(prev => ({
      ...prev,
      token: data.token,
      sessionExpiresAt: expiresAt,
    }));

    scheduleTokenRefresh(expiresAt);
  }, [authState.refreshToken, scheduleTokenRefresh]);

  // Setup API client refresh function
  useEffect(() => {
    setRefreshTokenFunction(refreshAccessToken);
  }, [refreshAccessToken]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const result = await response.json();
    const data = result.data;
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    // Store in localStorage
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));

    setAuthState({
      user: data.user,
      token: data.accessToken,
      refreshToken: data.refreshToken,
      role: data.user.role,
      isAuthenticated: true,
      sessionExpiresAt: expiresAt,
    });

    scheduleTokenRefresh(expiresAt);
  }, [scheduleTokenRefresh]);

  const logout = useCallback(async () => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    try {
      if (authState.token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authState.token}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    }

    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    setAuthState({
      user: null,
      token: null,
      refreshToken: null,
      role: null,
      isAuthenticated: false,
      sessionExpiresAt: null,
    });
  }, [authState.token]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const value: AuthContextValue = {
    ...authState,
    login,
    logout,
    refreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
