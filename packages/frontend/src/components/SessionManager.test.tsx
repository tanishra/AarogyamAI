import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SessionManager } from './SessionManager';
import { useAuth } from '@/lib/auth';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

describe('SessionManager', () => {
  const mockRefreshAccessToken = vi.fn();
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not show warning when session has more than 5 minutes remaining', () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    (useAuth as any).mockReturnValue({
      sessionExpiresAt: expiresAt,
      refreshAccessToken: mockRefreshAccessToken,
      logout: mockLogout,
    });

    render(<SessionManager />);

    expect(screen.queryByText(/your session will expire/i)).not.toBeInTheDocument();
  });

  it('should show warning when session has less than 5 minutes remaining', async () => {
    const expiresAt = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now

    (useAuth as any).mockReturnValue({
      sessionExpiresAt: expiresAt,
      refreshAccessToken: mockRefreshAccessToken,
      logout: mockLogout,
    });

    render(<SessionManager />);

    await waitFor(() => {
      expect(screen.getByText(/your session will expire/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /extend session/i })).toBeInTheDocument();
  });

  it('should call refreshAccessToken when extend button is clicked', async () => {
    const expiresAt = new Date(Date.now() + 4 * 60 * 1000);

    mockRefreshAccessToken.mockResolvedValueOnce(undefined);

    (useAuth as any).mockReturnValue({
      sessionExpiresAt: expiresAt,
      refreshAccessToken: mockRefreshAccessToken,
      logout: mockLogout,
    });

    render(<SessionManager />);

    await waitFor(() => {
      expect(screen.getByText(/your session will expire/i)).toBeInTheDocument();
    });

    const extendButton = screen.getByRole('button', { name: /extend session/i });
    fireEvent.click(extendButton);

    await waitFor(() => {
      expect(mockRefreshAccessToken).toHaveBeenCalled();
    });
  });

  it('should call logout when session expires', async () => {
    const expiresAt = new Date(Date.now() + 1000); // 1 second from now

    (useAuth as any).mockReturnValue({
      sessionExpiresAt: expiresAt,
      refreshAccessToken: mockRefreshAccessToken,
      logout: mockLogout,
    });

    render(<SessionManager />);

    // Fast-forward time past expiration
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('should update time remaining countdown', async () => {
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes from now

    (useAuth as any).mockReturnValue({
      sessionExpiresAt: expiresAt,
      refreshAccessToken: mockRefreshAccessToken,
      logout: mockLogout,
    });

    render(<SessionManager />);

    await waitFor(() => {
      expect(screen.getByText(/your session will expire/i)).toBeInTheDocument();
    });

    // Check initial time
    expect(screen.getByText(/3:00/)).toBeInTheDocument();

    // Advance time by 1 minute
    vi.advanceTimersByTime(60 * 1000);

    await waitFor(() => {
      expect(screen.getByText(/2:00/)).toBeInTheDocument();
    });
  });

  it('should not render when sessionExpiresAt is null', () => {
    (useAuth as any).mockReturnValue({
      sessionExpiresAt: null,
      refreshAccessToken: mockRefreshAccessToken,
      logout: mockLogout,
    });

    render(<SessionManager />);

    expect(screen.queryByText(/your session will expire/i)).not.toBeInTheDocument();
  });
});
