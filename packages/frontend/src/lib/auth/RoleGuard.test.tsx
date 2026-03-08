import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { RoleGuard } from './RoleGuard';
import { useAuth } from './AuthContext';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('RoleGuard', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('should render children when user has allowed role', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      role: 'Administrator',
    });

    render(
      <RoleGuard allowedRoles={['Administrator']}>
        <div>Admin Content</div>
      </RoleGuard>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should redirect to unauthorized when user role is not allowed', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      role: 'DPO',
    });

    render(
      <RoleGuard allowedRoles={['Administrator']}>
        <div>Admin Content</div>
      </RoleGuard>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/unauthorized');
  });

  it('should redirect to login when not authenticated', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: false,
      role: null,
    });

    render(
      <RoleGuard allowedRoles={['Administrator']}>
        <div>Admin Content</div>
      </RoleGuard>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('should allow multiple roles', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      role: 'DPO',
    });

    render(
      <RoleGuard allowedRoles={['Administrator', 'DPO']}>
        <div>Shared Content</div>
      </RoleGuard>
    );

    expect(screen.getByText('Shared Content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
