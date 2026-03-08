import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardPage from './page';
import { useAuth } from '@/lib/auth';

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display welcome message with user name', () => {
    (useAuth as any).mockReturnValue({
      user: { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Administrator' },
      role: 'Administrator',
      isAuthenticated: true,
    });

    render(<DashboardPage />);

    expect(screen.getByText(/Welcome back, John Doe/i)).toBeInTheDocument();
  });

  it('should display user role', () => {
    (useAuth as any).mockReturnValue({
      user: { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Administrator' },
      role: 'Administrator',
      isAuthenticated: true,
    });

    render(<DashboardPage />);

    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('should display Administrator quick action cards', () => {
    (useAuth as any).mockReturnValue({
      user: { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Administrator' },
      role: 'Administrator',
      isAuthenticated: true,
    });

    render(<DashboardPage />);

    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Metrics Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.queryByText('Consent Management')).not.toBeInTheDocument();
  });

  it('should display DPO quick action cards', () => {
    (useAuth as any).mockReturnValue({
      user: { id: '1', name: 'Jane Smith', email: 'jane@example.com', role: 'DPO' },
      role: 'DPO',
      isAuthenticated: true,
    });

    render(<DashboardPage />);

    expect(screen.getByText('Consent Management')).toBeInTheDocument();
    expect(screen.getByText('Grievances')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('Compliance Reports')).toBeInTheDocument();
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
  });

  it('should link to user management page for Administrator', () => {
    (useAuth as any).mockReturnValue({
      user: { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Administrator' },
      role: 'Administrator',
      isAuthenticated: true,
    });

    render(<DashboardPage />);

    const userManagementLink = screen.getByText('User Management').closest('a');
    expect(userManagementLink).toHaveAttribute('href', '/admin/users');
  });

  it('should show "Coming Soon" for disabled features', () => {
    (useAuth as any).mockReturnValue({
      user: { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Administrator' },
      role: 'Administrator',
      isAuthenticated: true,
    });

    render(<DashboardPage />);

    const comingSoonLabels = screen.getAllByText('(Coming Soon)');
    expect(comingSoonLabels.length).toBeGreaterThan(0);
  });

  it('should display MVP info section', () => {
    (useAuth as any).mockReturnValue({
      user: { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Administrator' },
      role: 'Administrator',
      isAuthenticated: true,
    });

    render(<DashboardPage />);

    expect(screen.getByText('Admin Panel MVP')).toBeInTheDocument();
    expect(
      screen.getByText(/This is the initial MVP version of the admin panel/i)
    ).toBeInTheDocument();
  });
});
