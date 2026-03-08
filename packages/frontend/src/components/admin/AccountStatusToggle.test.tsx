import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountStatusToggle } from './AccountStatusToggle';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import { useAuth } from '@/lib/auth';
import type { UserAccount } from '@/lib/api/types';

vi.mock('@/lib/api/services/userManagement');
vi.mock('@/lib/notifications/toast');
vi.mock('@/lib/auth');

const mockUser: UserAccount = {
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'Doctor',
  isActive: true,
  mfaEnabled: false,
  lastPasswordChange: '2024-01-01T00:00:00Z',
  createdAt: '2023-01-01T00:00:00Z',
};

describe('AccountStatusToggle', () => {
  let queryClient: QueryClient;
  const mockShowToast = vi.fn();
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({
      showToast: mockShowToast,
      toasts: [],
      removeToast: vi.fn(),
    });
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'admin-id', email: 'admin@example.com', role: 'Administrator' },
      token: 'token',
      refreshToken: 'refresh',
      role: 'Administrator',
      isAuthenticated: true,
      sessionExpiresAt: new Date(),
      login: vi.fn(),
      logout: vi.fn(),
      refreshAccessToken: vi.fn(),
    });
  });

  const renderComponent = (user = mockUser) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AccountStatusToggle user={user} onUpdate={mockOnUpdate} />
      </QueryClientProvider>
    );
  };

  it('displays current account status', () => {
    renderComponent();

    expect(screen.getByText(/Current Status:/)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('deactivates an active account', async () => {
    vi.mocked(UserManagementAPI.changeUserStatus).mockResolvedValue();

    renderComponent();

    const deactivateButton = screen.getByText('Deactivate');
    await userEvent.click(deactivateButton);

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Confirm Account Deactivation')).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText('Provide a reason for this action...');
    await userEvent.type(reasonInput, 'User requested account closure');

    const confirmButton = screen.getByRole('button', { name: /Deactivate/i });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(UserManagementAPI.changeUserStatus).toHaveBeenCalledWith(
        '1',
        false,
        'User requested account closure'
      );
      expect(mockShowToast).toHaveBeenCalledWith('success', 'User account deactivated successfully');
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });

  it('activates an inactive account', async () => {
    vi.mocked(UserManagementAPI.changeUserStatus).mockResolvedValue();
    const inactiveUser = { ...mockUser, isActive: false };

    renderComponent(inactiveUser);

    expect(screen.getByText('Inactive')).toBeInTheDocument();

    const activateButton = screen.getByText('Activate');
    await userEvent.click(activateButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Account Activation')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /Activate/i });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(UserManagementAPI.changeUserStatus).toHaveBeenCalledWith('1', true, undefined);
      expect(mockShowToast).toHaveBeenCalledWith('success', 'User account activated successfully');
    });
  });

  it('prevents deactivating own account', async () => {
    const ownUser: UserAccount = {
      ...mockUser,
      id: 'admin-id',
    };

    renderComponent(ownUser);

    expect(screen.getByText('You cannot deactivate your own account')).toBeInTheDocument();

    const deactivateButton = screen.getByText('Deactivate');
    expect(deactivateButton).toBeDisabled();
  });

  it('handles status change error', async () => {
    vi.mocked(UserManagementAPI.changeUserStatus).mockRejectedValue(
      new Error('Database error')
    );

    renderComponent();

    const deactivateButton = screen.getByText('Deactivate');
    await userEvent.click(deactivateButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Account Deactivation')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /Deactivate/i });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Database error');
    });
  });
});
