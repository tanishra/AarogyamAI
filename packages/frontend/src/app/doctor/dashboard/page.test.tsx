import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DoctorDashboardPage from './page';
import { useAuth } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';

const mocks = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/doctor/dashboard'),
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
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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
  {
    queue_id: 'q3',
    patient_id: 'p3',
    session_id: 's3',
    patient_name: 'Priya Nair',
    patient_email: 'priya.nair@example.com',
    status: 'under_review',
    priority: 'emergency',
    nurse_name: 'Tom Ali',
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

const QUERY_DATA: Record<string, any> = {};

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(({ queryKey }: any) => ({
    data: QUERY_DATA[queryKey[0]],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
    isPending: false,
    isSuccess: false,
    error: null,
  })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
}));

const logoutMock = vi.fn();
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderPage() {
  return render(
    <I18nProvider>
      <DoctorDashboardPage />
    </I18nProvider>,
  );
}

describe('DoctorDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(QUERY_DATA).forEach((key) => delete QUERY_DATA[key]);
    QUERY_DATA['doctorQueue'] = { data: { patients: QUEUE_PATIENTS } };
    QUERY_DATA['doctor-patient-history'] = {
      sessions: [{ id: 's0', status: 'completed' }],
      vitalsHistory: [{ id: 'v0' }],
      reasoningHistory: [],
    };
    QUERY_DATA['doctor-completed-patients'] = { data: { patients: [] } };
    (useAuth as any).mockReturnValue({
      user: { id: 'd1', name: 'Dr. Meera Iyer', email: 'meera.iyer@example.com', role: 'Doctor' },
      role: 'Doctor',
      isAuthenticated: true,
      token: 'tok',
      logout: logoutMock,
      sessionExpiresAt: null,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: PATIENT_CONTEXT }),
    } as Response);
  });

  it('renders queued patients with priorities and nurse assignments', () => {
    renderPage();

    expect(screen.getByText('Doctor Review Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Patient Queue')).toBeInTheDocument();
    expect(screen.getByText('3 Ready')).toBeInTheDocument();
    expect(screen.getByText('Asha Verma')).toBeInTheDocument();
    expect(screen.getByText('Rahul Mehta')).toBeInTheDocument();
    expect(screen.getByText('Priya Nair')).toBeInTheDocument();
    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByText('routine')).toBeInTheDocument();
    expect(screen.getByText('emergency')).toBeInTheDocument();
    expect(screen.getByText('Nurse: Nina Rao')).toBeInTheDocument();
    expect(screen.getByText('Nurse: Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Select a patient')).toBeInTheDocument();
  });

  it('renders the empty-queue state when no patients are queued', () => {
    QUERY_DATA['doctorQueue'] = { data: { patients: [] } };
    renderPage();

    expect(screen.getByText('No patients in queue')).toBeInTheDocument();
    expect(screen.getByText('Queue is clear for now.')).toBeInTheDocument();
    expect(screen.getByText('Select a patient')).toBeInTheDocument();
    expect(screen.getByText('0 Ready')).toBeInTheDocument();
  });

  it('refresh button invalidates the doctor queue query', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['doctorQueue'] });
  });

  it('logout button signs the doctor out', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('selecting a patient fetches context and shows the review workspace', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Asha Verma/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/doctor/patient/p1/context?sessionId=s1', {
        headers: { Authorization: 'Bearer tok' },
      }),
    );

    expect(await screen.findByText('Comprehensive context prepared for physician review')).toBeInTheDocument();
    expect(screen.getByText('Chest pain radiating to left arm')).toBeInTheDocument();
    expect(screen.getByText('chest pain, sweating')).toBeInTheDocument();
    expect(screen.getByText('150/95')).toBeInTheDocument();
    expect(screen.getByText('AI considerations (advisory)')).toBeInTheDocument();
    expect(screen.getByText('Costochondritis')).toBeInTheDocument();
    expect(screen.getByText('Clinical review')).toBeInTheDocument();
    expect(screen.queryByText('Select a patient')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Dedicated Review Page/ })).toHaveAttribute(
      'href',
      '/doctor/patient/p1/review?sessionId=s1',
    );
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['doctor-patient-history', 'p1'],
    });
  });
});
