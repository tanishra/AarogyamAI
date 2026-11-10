import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardPage from './page';
import { useAuth } from '@/lib/auth';

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Next.js navigation (used by Navigation / SessionManager children)
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/dashboard'),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const adminAuth = {
  user: { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Administrator' },
  role: 'Administrator',
  isAuthenticated: true,
  sessionExpiresAt: null,
};

const dpoAuth = {
  user: { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'DPO' },
  role: 'DPO',
  isAuthenticated: true,
  sessionExpiresAt: null,
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display welcome message with user name', () => {
    (useAuth as any).mockReturnValue(adminAuth);

    render(<DashboardPage />);

    expect(screen.getByText(/Welcome, John Doe/i)).toBeInTheDocument();
  });

  it('should display user role badge', () => {
    (useAuth as any).mockReturnValue(adminAuth);

    render(<DashboardPage />);

    expect(screen.getAllByText('Administrator').length).toBeGreaterThan(0);
  });

  it('should display Administrator quick action cards', () => {
    (useAuth as any).mockReturnValue(adminAuth);

    render(<DashboardPage />);

    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Metrics Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Audit Console')).toBeInTheDocument();
    expect(screen.getByText('Consent Ops')).toBeInTheDocument();
    expect(screen.queryByText('DPO Hub')).not.toBeInTheDocument();
  });

  it('should display DPO quick action cards', () => {
    (useAuth as any).mockReturnValue(dpoAuth);

    render(<DashboardPage />);

    const dpoHubLinks = screen.getAllByText('DPO Hub');
    expect(dpoHubLinks.length).toBeGreaterThan(0);
    expect(dpoHubLinks.map((el) => el.closest('a')).some((a) => a?.getAttribute('href') === '/dpo')).toBe(true);
    expect(screen.getByText('Audit Console')).toBeInTheDocument();
    expect(screen.getByText('Consent Ops')).toBeInTheDocument();
  });

  it('should link to user management page for Administrator', () => {
    (useAuth as any).mockReturnValue(adminAuth);

    render(<DashboardPage />);

    const userManagementLink = screen.getByText('User Management').closest('a');
    expect(userManagementLink).toHaveAttribute('href', '/admin/users');
  });

  it('should display the operational snapshot section', () => {
    (useAuth as any).mockReturnValue(adminAuth);

    render(<DashboardPage />);

    expect(screen.getByText('Operational Snapshot')).toBeInTheDocument();
  });
});
