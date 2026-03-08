import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from './AuthGuard';
import { useAuth } from './AuthContext';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('AuthGuard', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('should render children when authenticated', () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: true });

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should redirect to login when not authenticated', () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: false });

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
