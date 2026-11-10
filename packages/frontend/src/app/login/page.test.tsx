import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import LoginPage from './page';
import { useAuth } from '@/lib/auth';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

describe('LoginPage', () => {
  const mockPush = vi.fn();
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (useRouter as any).mockReturnValue({ push: mockPush });
    (useAuth as any).mockReturnValue({ login: mockLogin });
  });

  it('should render sign-in form', () => {
    render(<LoginPage />);

    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^sign in$/i }).at(-1)!).toBeInTheDocument();
  });

  it('should switch to sign-up tab', () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account/i })
    ).toBeInTheDocument();
  });

  it('should submit valid credentials and route by role', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    localStorage.setItem('user', JSON.stringify({ role: 'Doctor' }));

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('you@example.com');
    const passwordInput = screen.getByPlaceholderText('Enter password');
    const submitButton = screen.getAllByRole('button', { name: /^sign in$/i }).at(-1)!;

    fireEvent.change(emailInput, { target: { value: 'doctor@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'doctor@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/doctor/dashboard');
    });
  });

  it('should route non-clinical roles to /dashboard', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    localStorage.setItem('user', JSON.stringify({ role: 'Administrator' }));

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
      target: { value: 'password123' } },
    );
    fireEvent.click(screen.getAllByRole('button', { name: /^sign in$/i }).at(-1)!);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should display error message on login failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /^sign in$/i }).at(-1)!);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should disable submit button while loading', async () => {
    mockLogin.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /^sign in$/i }).at(-1)!);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
  });
});
