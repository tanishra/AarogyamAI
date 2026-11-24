import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NurseVitalsEntryPage from './page';
import { useAuth } from '@/lib/auth';
import { useParams, useSearchParams } from 'next/navigation';
import { I18nProvider } from '@/lib/i18n';

const mocks = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/nurse/vitals/p1'),
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
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

const QUERY_DATA: Record<string, any> = {};

/**
 * Minimal useMutation stand-in: runs the real mutationFn against the stubbed
 * fetch and exposes isPending/isSuccess/error so the page's mutation-driven UI
 * works. Errors are captured into `error` (mutate-style) rather than rethrown
 * so no unhandled rejections escape the form's await.
 */
function useMockMutation(opts: any) {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (variables?: any) => {
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
    mutate: (variables?: any) => {
      void mutateAsync(variables);
    },
    mutateAsync,
    isPending,
    isSuccess,
    error,
  };
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(({ queryKey }: any) => ({
    data: QUERY_DATA[queryKey[0]],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  useMutation: useMockMutation,
  useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
}));

const PATIENT_SUMMARY = {
  patient: { id: 'p1', name: 'Asha Verma', email: 'asha.verma@example.com' },
  summary: {
    chiefComplaint: 'Chest pain since this morning',
    symptoms: ['chest pain', 'fatigue'],
    medicalHistory: ['hypertension'],
    allergies: ['penicillin'],
  },
};

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderPage() {
  return render(
    <I18nProvider>
      <NurseVitalsEntryPage />
    </I18nProvider>,
  );
}

function fillVitals() {
  fireEvent.change(screen.getByPlaceholderText('Systolic'), { target: { value: '120' } });
  fireEvent.change(screen.getByPlaceholderText('Diastolic'), { target: { value: '80' } });
  fireEvent.change(screen.getByPlaceholderText('e.g., 72'), { target: { value: '72' } });
  fireEvent.change(screen.getByPlaceholderText('e.g., 98.6'), { target: { value: '98.6' } });
  fireEvent.change(screen.getByPlaceholderText('e.g., 98'), { target: { value: '98' } });
  fireEvent.change(screen.getByPlaceholderText('e.g., 16'), { target: { value: '16' } });
  fireEvent.change(screen.getByPlaceholderText('e.g., 170'), { target: { value: '170' } });
  fireEvent.change(screen.getByPlaceholderText('e.g., 70'), { target: { value: '70' } });
  fireEvent.change(screen.getByPlaceholderText('Enter any observations or context for the doctor...'), {
    target: { value: 'Patient resting comfortably' },
  });
}

describe('NurseVitalsEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(QUERY_DATA).forEach((key) => delete QUERY_DATA[key]);
    QUERY_DATA['nurse-patient-summary'] = PATIENT_SUMMARY;
    QUERY_DATA['active-alerts'] = [];
    QUERY_DATA['vitals-history'] = [];
    (useAuth as any).mockReturnValue({
      user: { id: 'n1', name: 'Nina Rao', email: 'nina.rao@example.com', role: 'Nurse' },
      role: 'Nurse',
      isAuthenticated: true,
      token: 'tok',
      logout: vi.fn(),
      sessionExpiresAt: null,
    });
    (useParams as any).mockReturnValue({ patientId: 'p1' });
    (useSearchParams as any).mockReturnValue(new URLSearchParams('sessionId=sess-1'));
    fetchMock.mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/vitals')) {
        return { ok: true, json: async () => ({ data: { id: 'v-new' } }) } as Response;
      }
      return { ok: true, json: async () => ({ data: {} }) } as Response;
    });
  });

  it('renders patient context and all vitals input fields', () => {
    renderPage();

    expect(screen.getByText('Asha Verma')).toBeInTheDocument();
    expect(screen.getByText('asha.verma@example.com')).toBeInTheDocument();
    expect(screen.getByText('Chest pain since this morning')).toBeInTheDocument();
    expect(screen.getByText('chest pain, fatigue')).toBeInTheDocument();
    expect(screen.getByText('penicillin')).toBeInTheDocument();
    expect(screen.getByText('No previous vitals recorded')).toBeInTheDocument();

    expect(screen.getByText(/Blood pressure/)).toBeInTheDocument();
    expect(screen.getByText(/Heart rate/)).toBeInTheDocument();
    expect(screen.getByText(/Temperature/)).toBeInTheDocument();
    expect(screen.getByText(/SpO2/)).toBeInTheDocument();
    expect(screen.getByText(/Respiratory Rate/)).toBeInTheDocument();
    expect(screen.getByText(/Height/)).toBeInTheDocument();
    expect(screen.getByText(/Weight/)).toBeInTheDocument();
    expect(screen.getByText(/Clinical notes/)).toBeInTheDocument();

    expect(screen.getByPlaceholderText('Systolic')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Diastolic')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save vitals' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark Patient Ready for Doctor' })).toBeInTheDocument();
  });

  it('submits entered vitals to the nurse vitals endpoint', async () => {
    renderPage();
    fillVitals();

    fireEvent.click(screen.getByRole('button', { name: 'Save vitals' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/nurse/patient/p1/vitals',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    const vitalsCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/vitals'))!;
    const init = vitalsCall[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toMatchObject({
      patientId: 'p1',
      sessionId: 'sess-1',
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: 80,
      heartRate: 72,
      temperatureFahrenheit: 98.6,
      oxygenSaturation: 98,
      respiratoryRate: 16,
      heightCm: 170,
      weightKg: 70,
      notes: 'Patient resting comfortably',
    });

    expect(await screen.findByText('✓ Vitals saved successfully')).toBeInTheDocument();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['vitals-history', 'p1'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['active-alerts'] });
  });

  it('shows the server error message when vitals submission fails', async () => {
    fetchMock.mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/vitals')) {
        return {
          ok: false,
          json: async () => ({ message: 'Vitals out of acceptable range' }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Systolic'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save vitals' }));

    expect(await screen.findByText('Vitals out of acceptable range')).toBeInTheDocument();
    expect(screen.queryByText('✓ Vitals saved successfully')).not.toBeInTheDocument();
  });

  it('marks the patient ready for the doctor', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Mark Patient Ready for Doctor' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/nurse/patient/p1/ready',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const readyCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/ready'))!;
    expect(JSON.parse((readyCall[1] as RequestInit).body as string)).toEqual({ sessionId: 'sess-1' });
  });

  it('shows the critical alerts banner when alerts are active', () => {
    QUERY_DATA['active-alerts'] = [
      {
        id: 'a1',
        vital_name: 'Heart rate',
        vital_value: '142 bpm',
        severity: 'critical',
        normal_range: '60-100 bpm',
        recommended_action: 'Recheck manually and notify physician',
        created_at: '2024-01-01T00:00:00Z',
      },
    ];
    renderPage();

    expect(screen.getByText('Critical Alerts (1)')).toBeInTheDocument();
    expect(screen.getByText('142 bpm')).toBeInTheDocument();
  });

  it('shows the missing-session empty state when sessionId is absent', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams());
    renderPage();

    expect(screen.getByText('Missing session ID')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save vitals' })).not.toBeInTheDocument();
  });
});
