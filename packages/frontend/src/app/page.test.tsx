import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import Home from './page';
import { useAuth } from '@/lib/auth';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

describe('Home Page', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('redirects to /login when unauthenticated', async () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: false });

    render(<Home />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('redirects to /dashboard when authenticated', async () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: true });

    render(<Home />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('renders a loading spinner while resolving auth', () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: false });

    render(<Home />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
