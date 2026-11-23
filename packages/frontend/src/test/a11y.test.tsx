import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Navigation } from '@/components/Navigation';
import { I18nProvider } from '@/lib/i18n';
import LoginPage from '@/app/login/page';
import DoctorDashboard from '@/app/doctor/dashboard/page';
import NurseDashboard from '@/app/nurse/dashboard/page';
import PatientDashboard from '@/app/patient/dashboard/page';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/dashboard'),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const QUERY_DATA: Record<string, any> = {
  doctorQueue: { data: { patients: [] } },
  'doctor-patient-history': { data: {} },
  'doctor-completed-patients': { data: { patients: [] } },
  nurseQueue: { data: { patients: [] } },
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(({ queryKey }: any) => ({
    data: QUERY_DATA[queryKey[0]],
    isLoading: false,
    error: null,
  })),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import { useAuth } from '@/lib/auth';

vi.stubGlobal(
  'fetch',
  vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) } as Response),
  ),
);

function authAs(role: string) {
  (useAuth as any).mockReturnValue({
    user: { id: '1', name: 'Test User', email: 't@e.com', role },
    role,
    isAuthenticated: true,
    token: 'tok',
    logout: vi.fn(),
    sessionExpiresAt: null,
  });
}

function renderI18n(node: React.ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>);
}

describe('a11y — core components', () => {
  it('LoadingSpinner has no violations', async () => {
    const { container } = render(<LoadingSpinner />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ErrorBoundary (children path) has no violations', async () => {
    const { container } = render(
      <ErrorBoundary>
        <div>content</div>
      </ErrorBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('a11y — chrome components', () => {
  beforeEach(() => authAs('Administrator'));

  it('Navigation has no violations', async () => {
    const { container } = renderI18n(<Navigation />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('a11y — top-level pages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('LoginPage has no violations', async () => {
    (useAuth as any).mockReturnValue({ login: vi.fn() });
    const { container } = renderI18n(<LoginPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DoctorDashboard has no violations', async () => {
    authAs('Doctor');
    const { container } = renderI18n(<DoctorDashboard />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('NurseDashboard has no violations', async () => {
    authAs('Nurse');
    const { container } = renderI18n(<NurseDashboard />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PatientDashboard has no violations', async () => {
    authAs('Patient');
    const { container } = renderI18n(<PatientDashboard />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
