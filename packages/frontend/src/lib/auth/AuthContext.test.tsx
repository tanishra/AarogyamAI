import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Mock fetch
global.fetch = vi.fn();

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it('should initialize with unauthenticated state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('should login successfully and update state', async () => {
    const mockResponse = {
      user: {
        id: '1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'Administrator' as const,
      },
      token: 'mock-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login({
        email: 'admin@example.com',
        password: 'password123',
      });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockResponse.user);
    expect(result.current.token).toBe('mock-token');
    expect(result.current.role).toBe('Administrator');
  });

  it('should handle login failure', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Invalid credentials' }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(
      act(async () => {
        await result.current.login({
          email: 'admin@example.com',
          password: 'wrong-password',
        });
      })
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should logout and clear state', async () => {
    const mockLoginResponse = {
      user: {
        id: '1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'Administrator' as const,
      },
      token: 'mock-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockLoginResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Login first
    await act(async () => {
      await result.current.login({
        email: 'admin@example.com',
        password: 'password123',
      });
    });

    expect(result.current.isAuthenticated).toBe(true);

    // Then logout
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('should refresh access token', async () => {
    const mockLoginResponse = {
      user: {
        id: '1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'Administrator' as const,
      },
      token: 'old-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };

    const mockRefreshResponse = {
      token: 'new-token',
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockLoginResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefreshResponse,
      });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Login first
    await act(async () => {
      await result.current.login({
        email: 'admin@example.com',
        password: 'password123',
      });
    });

    expect(result.current.token).toBe('old-token');

    // Refresh token
    await act(async () => {
      await result.current.refreshAccessToken();
    });

    expect(result.current.token).toBe('new-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should throw error when useAuth is used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});
