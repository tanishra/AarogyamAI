import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { PatientChat } from './PatientChat';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api';
import { I18nProvider } from '@/lib/i18n';

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const apiGet = apiClient.get as any;
const apiPost = apiClient.post as any;

const START_PAYLOAD = {
  data: {
    data: {
      sessionId: 'sess-1',
      welcomeMessage: 'Hi, I am your AI nurse assistant. What brings you in today?',
    },
  },
};

const REPLY_PAYLOAD = {
  data: {
    data: { response: 'Thanks for sharing. Can you tell me more about when it started?', isEmergency: false },
  },
};

function mockChatApi() {
  apiPost.mockImplementation((url: string) => {
    if (url === '/api/patient/chat/start') return Promise.resolve(START_PAYLOAD);
    if (url === '/api/patient/chat/message') return Promise.resolve(REPLY_PAYLOAD);
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

function renderChat() {
  return render(
    <I18nProvider>
      <PatientChat />
    </I18nProvider>,
  );
}

const PLACEHOLDER = 'Describe what you are feeling…';
const WELCOME = /AI nurse assistant/;

describe('PatientChat', () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; the component calls it on new messages.
    (Element.prototype as any).scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (useAuth as any).mockReturnValue({
      user: { id: 'pat-1', name: 'Ravi Kumar', email: 'ravi@example.com', role: 'Patient' },
      role: 'Patient',
      isAuthenticated: true,
      token: 'tok',
      logout: vi.fn(),
      sessionExpiresAt: null,
    });
    mockChatApi();
  });

  it('starts a session and renders the chat header, input, and send button', async () => {
    renderChat();

    expect(await screen.findByText('Tell me about your symptoms')).toBeInTheDocument();
    expect(await screen.findByText(WELCOME)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledWith('/api/patient/chat/start', { patientId: 'pat-1' });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('keeps the send button disabled until the input has text', async () => {
    renderChat();
    await screen.findByText(WELCOME);

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: 'I have a headache' } });
    expect(sendButton).toBeEnabled();
  });

  it('sends the typed message and renders the assistant reply', async () => {
    renderChat();
    await screen.findByText(WELCOME);

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: 'I have a headache' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/api/patient/chat/message', {
        sessionId: 'sess-1',
        message: 'I have a headache',
      }),
    );
    expect(await screen.findByText('I have a headache')).toBeInTheDocument();
    expect(await screen.findByText(/tell me more about when it started/)).toBeInTheDocument();
    expect(screen.getByText('3 messages')).toBeInTheDocument();
  });

  it('sends the message on Enter keypress', async () => {
    renderChat();
    await screen.findByText(WELCOME);

    const input = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'Fever for two days' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/api/patient/chat/message', {
        sessionId: 'sess-1',
        message: 'Fever for two days',
      }),
    );
  });

  it('quick prompt chip fills the input', async () => {
    renderChat();
    await screen.findByText(WELCOME);

    fireEvent.click(screen.getByRole('button', { name: 'Fever' }));

    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('Fever');
  });

  it('shows the thinking indicator while awaiting the reply', async () => {
    let resolveReply: (value: any) => void = () => {};
    apiPost.mockImplementation((url: string) => {
      if (url === '/api/patient/chat/start') return Promise.resolve(START_PAYLOAD);
      return new Promise((resolve) => {
        resolveReply = resolve;
      });
    });
    renderChat();
    await screen.findByText(WELCOME);

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: 'Fever for two days' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Assistant is thinking…')).toBeInTheDocument();

    resolveReply({ data: { data: { response: 'How high is the fever?', isEmergency: false } } });

    expect(await screen.findByText('How high is the fever?')).toBeInTheDocument();
    expect(screen.queryByText('Assistant is thinking…')).not.toBeInTheDocument();
  });

  it('shows an error when the reply fails', async () => {
    apiPost.mockImplementation((url: string) => {
      if (url === '/api/patient/chat/start') return Promise.resolve(START_PAYLOAD);
      return Promise.reject(new Error('Network down'));
    });
    renderChat();
    await screen.findByText(WELCOME);

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: 'I feel dizzy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('shows an error when the session cannot start', async () => {
    apiPost.mockRejectedValue(new Error('Service unavailable'));
    renderChat();

    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
  });
});
