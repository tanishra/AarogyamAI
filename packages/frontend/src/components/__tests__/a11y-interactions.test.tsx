import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll, type Mock } from 'vitest';
import { axe } from 'jest-axe';
import { I18nProvider } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api';
import { useParams, useSearchParams } from 'next/navigation';
import DoctorDashboardPage from '@/app/doctor/dashboard/page';
import NurseVitalsEntryPage from '@/app/nurse/vitals/[patientId]/page';
import AuditPage from '@/app/audit/page';
import { PatientChat } from '@/components/patient/PatientChat';
import AnomalyAlertList from '@/components/audit/AnomalyAlertList';
import { PasswordResetDialog } from '@/components/admin/PasswordResetDialog';
import type { UserAccount } from '@/lib/api/types';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/audit'),
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Pages import the guards from their direct submodule paths too.
vi.mock('@/lib/auth/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/auth/RoleGuard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/lib/notifications/toast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn(), toasts: [], removeToast: vi.fn() })),
  showToast: vi.fn(),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const apiPost = vi.mocked(apiClient.post);

const QUERY_DATA: Record<string, unknown> = {};
const QUERY_ERRORS: Record<string, unknown> = {};

/**
 * Minimal useMutation stand-in (same pattern as nurse/vitals page.test.tsx):
 * runs the real mutationFn against the stubbed fetch and exposes
 * isPending/isSuccess/error so mutation-driven UI states render. Errors are
 * captured into `error` rather than rethrown so no unhandled rejections
 * escape the form's await.
 */
interface MockMutationOptions {
  mutationFn?: (variables?: unknown) => Promise<unknown> | unknown;
  onSuccess?: (result: unknown, variables: unknown, context: unknown) => unknown;
}

function useMockMutation(opts: MockMutationOptions) {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (variables?: unknown) => {
    setIsPending(true);
    setIsSuccess(false);
    setError(null);
    try {
      const result = await opts.mutationFn?.(variables);
      setIsSuccess(true);
      await opts.onSuccess?.(result, variables, undefined);
      return result;
    } catch (err) {
      setError(err as Error);
      return undefined;
    } finally {
      setIsPending(false);
    }
  };

  return {
    mutate: (variables?: unknown) => {
      void mutateAsync(variables);
    },
    mutateAsync,
    isPending,
    isSuccess,
    error,
  };
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(({ queryKey }: { queryKey: string[] }) => ({
    data: QUERY_DATA[queryKey[0]],
    isLoading: false,
    error: QUERY_ERRORS[queryKey[0]] ?? null,
    refetch: vi.fn(),
  })),
  useMutation: useMockMutation,
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function authAs(role: string, user?: { id: string; name: string; email: string }) {
  (useAuth as unknown as Mock).mockReturnValue({
    user: { id: 'u1', name: 'Test User', email: 't@e.com', role, ...user },
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

function resetQueryMocks() {
  Object.keys(QUERY_DATA).forEach((key) => delete QUERY_DATA[key]);
  Object.keys(QUERY_ERRORS).forEach((key) => delete QUERY_ERRORS[key]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetQueryMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const QUEUE_PATIENTS = [
  {
    queue_id: 'q1',
    patient_id: 'p1',
    session_id: 's1',
    patient_name: 'Asha Verma',
    patient_email: 'asha.verma@example.com',
    status: 'ready_for_review',
    priority: 'urgent',
    nurse_name: 'Nina Rao',
  },
  {
    queue_id: 'q2',
    patient_id: 'p2',
    session_id: 's2',
    patient_name: 'Rahul Mehta',
    patient_email: 'rahul.mehta@example.com',
    status: 'waiting',
    priority: 'routine',
  },
];

const PATIENT_CONTEXT = {
  summary: {
    chiefComplaint: 'Chest pain radiating to left arm',
    symptoms: ['chest pain', 'sweating'],
  },
  vitals: {
    bloodPressureSystolic: 150,
    bloodPressureDiastolic: 95,
    heartRate: 102,
    temperatureFahrenheit: 99.1,
    oxygenSaturation: 96,
    respiratoryRate: 20,
    heightCm: 165,
    weightKg: 70,
    bmi: 25.7,
  },
  considerations: [
    {
      id: 'c1',
      conditionName: 'Costochondritis',
      likelihood: 'moderate',
      urgency: 'routine',
      supportingFactors: ['Chest wall tenderness'],
      explanation: 'Musculoskeletal pattern consistent with exam findings.',
      status: 'pending',
    },
  ],
  reasoning: null,
};

const CHAT_START_PAYLOAD = {
  data: {
    data: {
      sessionId: 'sess-1',
      welcomeMessage: 'Hi, I am your AI nurse assistant. What brings you in today?',
    },
  },
};

const CHAT_REPLY_PAYLOAD = {
  data: {
    data: {
      response: 'Thanks for sharing. Can you tell me more about when it started?',
      isEmergency: false,
    },
  },
};

const CHAT_WELCOME = /AI nurse assistant/;
const CHAT_PLACEHOLDER = 'Describe what you are feeling…';

const NURSE_PATIENT_SUMMARY = {
  patient: { id: 'p1', name: 'Asha Verma', email: 'asha.verma@example.com' },
  summary: {
    chiefComplaint: 'Chest pain since this morning',
    symptoms: ['chest pain', 'fatigue'],
    medicalHistory: ['hypertension'],
    allergies: ['penicillin'],
  },
};

const CRITICAL_ALERT = {
  id: 'a1',
  vital_name: 'Heart rate',
  vital_value: '142 bpm',
  severity: 'critical' as const,
  normal_range: '60-100 bpm',
  recommended_action: 'Recheck manually and notify physician',
  patient_name: 'Asha Verma',
  created_at: '2024-01-01T00:00:00Z',
};

const ANOMALY_ALERT = {
  id: 'anom-1',
  userId: 'u9',
  userName: 'Nina Rao',
  userRole: 'Nurse',
  triggerCondition: 'Bulk record access outside shift hours',
  timestamp: '2024-01-01T00:00:00Z',
  details: { recordCount: 42, timeWindow: '02:00-03:00' },
  acknowledged: false,
};

const AUDIT_LOG_ENTRY = {
  id: 'log-1',
  timestamp: '2024-01-01T00:00:00Z',
  userId: 'u9',
  userName: 'Nina Rao',
  userRole: 'Nurse',
  actionType: 'record_view',
  resource: 'patient_record',
  resourceId: 'p1',
  outcome: 'success' as const,
  ipAddress: '127.0.0.1',
  userAgent: 'vitest',
  hash: 'abc123',
};

const RESET_USER: UserAccount = {
  id: 'u-reset',
  name: 'Rahul Mehta',
  email: 'rahul.mehta@example.com',
  role: 'Doctor',
  isActive: true,
  mfaEnabled: false,
  lastPasswordChange: '2024-01-01T00:00:00Z',
  createdAt: '2023-01-01T00:00:00Z',
};

function mockChatApi() {
  apiPost.mockImplementation((url: string) => {
    if (url === '/api/patient/chat/start') return Promise.resolve(CHAT_START_PAYLOAD);
    if (url === '/api/patient/chat/message') return Promise.resolve(CHAT_REPLY_PAYLOAD);
    if (url === '/api/patient/chat/sess-1/complete') return Promise.resolve({ data: { data: {} } });
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

function sendChatMessage(text: string) {
  fireEvent.change(screen.getByPlaceholderText(CHAT_PLACEHOLDER), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

/* ------------------------------------------------------------------ */

describe('a11y interactions — selected patient state (doctor dashboard)', () => {
  beforeEach(() => {
    authAs('Doctor', { id: 'd1', name: 'Dr. Meera Iyer', email: 'meera.iyer@example.com' });
    QUERY_DATA['doctorQueue'] = { data: { patients: QUEUE_PATIENTS } };
    QUERY_DATA['doctor-patient-history'] = {
      sessions: [{ id: 's0', status: 'completed' }],
      vitalsHistory: [{ id: 'v0' }],
      reasoningHistory: [],
    };
    QUERY_DATA['doctor-completed-patients'] = { data: { patients: [] } };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: PATIENT_CONTEXT }),
    } as Response);
  });

  it('expanded review workspace after selecting a patient has no violations', async () => {
    const { container } = renderI18n(<DoctorDashboardPage />);

    fireEvent.click(screen.getByRole('button', { name: /Asha Verma/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/doctor/patient/p1/context?sessionId=s1', {
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    expect(
      await screen.findByText('Comprehensive context prepared for physician review'),
    ).toBeInTheDocument();
    expect(screen.getByText('Chest pain radiating to left arm')).toBeInTheDocument();
    expect(screen.getByText('AI considerations (advisory)')).toBeInTheDocument();
    expect(screen.queryByText('Select a patient')).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});

/* ------------------------------------------------------------------ */

describe('a11y interactions — tab switch (audit page)', () => {
  beforeEach(() => {
    authAs('Administrator', { id: 'a1', name: 'Admin User', email: 'admin@example.com' });
    QUERY_DATA['audit-logs'] = { data: [AUDIT_LOG_ENTRY], total: 1 };
    QUERY_DATA['anomaly-alerts'] = [ANOMALY_ALERT];
  });

  it('switched anomaly-alerts panel has no violations', async () => {
    const { container } = renderI18n(<AuditPage />);

    expect(await screen.findByText('Audit Log Entries')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Anomaly Alerts' }));

    expect(await screen.findByText('1 Unacknowledged Anomaly')).toBeInTheDocument();
    expect(screen.getByText('Bulk record access outside shift hours')).toBeInTheDocument();
    expect(screen.queryByText('Audit Log Entries')).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});

/* ------------------------------------------------------------------ */

describe('a11y interactions — PatientChat states', () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; the component calls it on new messages.
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    authAs('Patient', { id: 'pat-1', name: 'Ravi Kumar', email: 'ravi@example.com' });
    mockChatApi();
  });

  it('populated transcript has no violations', async () => {
    const { container } = renderI18n(<PatientChat />);
    await screen.findByText(CHAT_WELCOME);

    sendChatMessage('I have a headache');

    expect(await screen.findByText('I have a headache')).toBeInTheDocument();
    expect(await screen.findByText(/tell me more about when it started/)).toBeInTheDocument();
    expect(screen.getByText('3 messages')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('thinking indicator is announced (role=status) and has no violations', async () => {
    let resolveReply: (value: unknown) => void = () => {};
    apiPost.mockImplementation((url: string) => {
      if (url === '/api/patient/chat/start') return Promise.resolve(CHAT_START_PAYLOAD);
      return new Promise((resolve) => {
        resolveReply = resolve;
      });
    });
    const { container } = renderI18n(<PatientChat />);
    await screen.findByText(CHAT_WELCOME);

    sendChatMessage('Fever for two days');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Assistant is thinking…');
    expect(status).toHaveAttribute('aria-live', 'polite');

    expect(await axe(container)).toHaveNoViolations();

    resolveReply({ data: { data: { response: 'How high is the fever?', isEmergency: false } } });
    expect(await screen.findByText('How high is the fever?')).toBeInTheDocument();
  });

  it('failed-send error is announced (role=alert) and has no violations', async () => {
    apiPost.mockImplementation((url: string) => {
      if (url === '/api/patient/chat/start') return Promise.resolve(CHAT_START_PAYLOAD);
      return Promise.reject(new Error('Network down'));
    });
    const { container } = renderI18n(<PatientChat />);
    await screen.findByText(CHAT_WELCOME);

    sendChatMessage('I feel dizzy');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Network down');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('session-start failure is announced (role=alert) and has no violations', async () => {
    apiPost.mockRejectedValue(new Error('Service unavailable'));
    const { container } = renderI18n(<PatientChat />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Service unavailable');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('emergency detection banner is announced (role=alert) and has no violations', async () => {
    apiPost.mockImplementation((url: string) => {
      if (url === '/api/patient/chat/start') return Promise.resolve(CHAT_START_PAYLOAD);
      return Promise.resolve({
        data: { data: { response: 'This sounds serious.', isEmergency: true } },
      });
    });
    const { container } = renderI18n(<PatientChat />);
    await screen.findByText(CHAT_WELCOME);

    sendChatMessage('Crushing chest pain');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Potential High-Risk Symptoms Detected');
    expect(alert).toHaveTextContent('call 911 immediately');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('session completion banner is announced (role=status) and has no violations', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('alert', vi.fn());
    const { container } = renderI18n(<PatientChat />);
    await screen.findByText(CHAT_WELCOME);

    sendChatMessage('I have a headache');
    await screen.findByText(/tell me more about when it started/);

    fireEvent.click(screen.getByRole('button', { name: 'Complete Session' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Session Completed Successfully');

    expect(await axe(container)).toHaveNoViolations();
  });
});

/* ------------------------------------------------------------------ */

describe('a11y interactions — nurse vitals entry states', () => {
  beforeEach(() => {
    authAs('Nurse', { id: 'n1', name: 'Nina Rao', email: 'nina.rao@example.com' });
    (useParams as unknown as Mock).mockReturnValue({ patientId: 'p1' });
    (useSearchParams as unknown as Mock).mockReturnValue(new URLSearchParams('sessionId=sess-1'));
    QUERY_DATA['nurse-patient-summary'] = NURSE_PATIENT_SUMMARY;
    QUERY_DATA['active-alerts'] = [];
    QUERY_DATA['vitals-history'] = [];
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/vitals')) {
        return { ok: true, json: async () => ({ data: { id: 'v-new' } }) } as Response;
      }
      return { ok: true, json: async () => ({ data: {} }) } as Response;
    });
  });

  it('submit failure error is announced (role=alert) and has no violations', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/vitals')) {
        return {
          ok: false,
          json: async () => ({ message: 'Vitals out of acceptable range' }),
        } as Response;
      }
      return { ok: true, json: async () => ({ data: {} }) } as Response;
    });
    const { container } = renderI18n(<NurseVitalsEntryPage />);
    expect(await screen.findByText('Chest pain since this morning')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Systolic'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save vitals' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Vitals out of acceptable range');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('critical alert banner is announced (role=alert) with expandable action and no violations', async () => {
    QUERY_DATA['active-alerts'] = [CRITICAL_ALERT];
    const { container } = renderI18n(<NurseVitalsEntryPage />);

    expect(await screen.findByText('Critical Alerts (1)')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('142 bpm');
    expect(alert).toHaveTextContent('60-100 bpm');

    const toggle = screen.getByRole('button', { name: 'Show Recommended Action' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Recheck manually and notify physician')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});

/* ------------------------------------------------------------------ */

describe('a11y interactions — AnomalyAlertList states', () => {
  beforeEach(() => {
    authAs('Administrator', { id: 'a1', name: 'Admin User', email: 'admin@example.com' });
  });

  it('query error banner is announced (role=alert) and has no violations', async () => {
    QUERY_ERRORS['anomaly-alerts'] = new Error('Audit service offline');
    const { container } = renderI18n(<AnomalyAlertList />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Error Loading Anomaly Alerts');
    expect(alert).toHaveTextContent('Audit service offline');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('acknowledge confirmation dialog has dialog semantics, initial focus, and no violations', async () => {
    QUERY_DATA['anomaly-alerts'] = [ANOMALY_ALERT];
    const { container } = renderI18n(<AnomalyAlertList />);

    fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Acknowledge Anomaly');
    // Focus moved inside the dialog on open (autoFocus on the safe Cancel action).
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(dialog).getByText('Bulk record access outside shift hours')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});

/* ------------------------------------------------------------------ */

describe('a11y interactions — dialog states', () => {
  beforeEach(() => {
    authAs('Administrator', { id: 'a1', name: 'Admin User', email: 'admin@example.com' });
  });

  it('password reset confirmation dialog is modal-labelled, focused, and has no violations', async () => {
    const { container } = renderI18n(<PasswordResetDialog user={RESET_USER} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Confirm Password Reset');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(dialog).getByText(/rahul\.mehta@example\.com/)).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('password reset dialog closed state still passes after cancel', async () => {
    const { container } = renderI18n(<PasswordResetDialog user={RESET_USER} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
