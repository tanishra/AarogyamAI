import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleEditor } from './RoleEditor';
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

describe('RoleEditor', () => {
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
        <RoleEditor user={user} onUpdate={mockOnUpdate} />
      </QueryClientProvider>
    );
  };

  it('displays current role and allows role selection', async () => {
    renderComponent();

    expect(screen.getByText(/Current Role:/)).toBeInTheDocument();
    expect(screen.getByText('Doctor')).toBeInTheDocument();

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('Doctor');
  });

  it('changes user role successfully', async () => {
    vi.mocked(UserManagementAPI.changeUserRole).mockResolvedValue();

    renderComponent();

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'Administrator');

    const changeButton = screen.getByText('Change Role');
    await userEvent.click(changeButton);

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Confirm Role Change')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /Confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(UserManagementAPI.changeUserRole).toHaveBeenCalledWith('1', 'Administrator');
      expect(mockShowToast).toHaveBeenCalledWith('success', 'User role updated successfully');
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });

  it('prevents changing own administrator role', async () => {
    const adminUser: UserAccount = {
      ...mockUser,
      id: 'admin-id',
      role: 'Administrator',
    };

    renderComponent(adminUser);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'Doctor');

    expect(select).toBeDisabled();
    expect(screen.getByText('You cannot remove your own Administrator role')).toBeInTheDocument();

    const changeButton = screen.getByText('Change Role');
    expect(changeButton).toBeDisabled();
  });

  it('shows confirmation dialog with role details', async () => {
    vi.mocked(UserManagementAPI.changeUserRole).mockResolvedValue();

    renderComponent();

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'Nurse');

    const changeButton = screen.getByText('Change Role');
    await userEvent.click(changeButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Role Change')).toBeInTheDocument();
      expect(screen.getByText('Doctor')).toBeInTheDocument();
      expect(screen.getByText('Nurse')).toBeInTheDocument();
    });
  });

  it('handles role change error', async () => {
    vi.mocked(UserManagementAPI.changeUserRole).mockRejectedValue(
      new Error('Permission denied')
    );

    renderComponent();

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'Administrator');

    const changeButton = screen.getByText('Change Role');
    await userEvent.click(changeButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Role Change')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /Confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Permission denied');
    });
  });
});
