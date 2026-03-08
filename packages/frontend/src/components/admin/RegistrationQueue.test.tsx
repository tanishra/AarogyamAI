import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RegistrationQueue } from './RegistrationQueue';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import type { RegistrationRequest } from '@/lib/api/types';

vi.mock('@/lib/api/services/userManagement');
vi.mock('@/lib/notifications/toast');

const mockRequests: RegistrationRequest[] = [
  {
    id: '1',
    applicantName: 'Dr. John Smith',
    email: 'john.smith@example.com',
    requestedRole: 'Doctor',
    credentials: 'MD, Board Certified',
    submittedAt: '2024-01-15T10:00:00Z',
    status: 'pending',
  },
  {
    id: '2',
    applicantName: 'Nurse Jane Doe',
    email: 'jane.doe@example.com',
    requestedRole: 'Nurse',
    credentials: 'RN, BSN',
    submittedAt: '2024-01-16T14:30:00Z',
    status: 'pending',
  },
];

describe('RegistrationQueue', () => {
  let queryClient: QueryClient;
  const mockShowToast = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({
      showToast: mockShowToast,
      toasts: [],
      removeToast: vi.fn(),
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <RegistrationQueue />
      </QueryClientProvider>
    );
  };

  it('displays pending registration requests', async () => {
    vi.mocked(UserManagementAPI.getRegistrationRequests).mockResolvedValue(mockRequests);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
      expect(screen.getByText('Nurse Jane Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john.smith@example.com')).toBeInTheDocument();
    expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('2 pending requests')).toBeInTheDocument();
  });

  it('shows empty state when no pending requests', async () => {
    vi.mocked(UserManagementAPI.getRegistrationRequests).mockResolvedValue([]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No pending registration requests')).toBeInTheDocument();
    });
  });

  it('approves a registration request', async () => {
    vi.mocked(UserManagementAPI.getRegistrationRequests).mockResolvedValue(mockRequests);
    vi.mocked(UserManagementAPI.approveRegistration).mockResolvedValue();
    window.confirm = vi.fn(() => true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
    });

    const approveButtons = screen.getAllByText('Approve');
    await userEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(UserManagementAPI.approveRegistration).toHaveBeenCalledWith('1');
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Registration request approved successfully');
    });
  });

  it('rejects a registration request with reason', async () => {
    vi.mocked(UserManagementAPI.getRegistrationRequests).mockResolvedValue(mockRequests);
    vi.mocked(UserManagementAPI.rejectRegistration).mockResolvedValue();

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
    });

    const rejectButtons = screen.getAllByText('Reject');
    await userEvent.click(rejectButtons[0]);

    // Dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Reject Registration Request')).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText('Please provide a reason for rejection...');
    await userEvent.type(reasonInput, 'Incomplete credentials');

    // Find the confirm button in the dialog (not the table buttons)
    const dialogButtons = screen.getAllByRole('button', { name: /Reject/i });
    const confirmButton = dialogButtons[dialogButtons.length - 1]; // Last one is in the dialog
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(UserManagementAPI.rejectRegistration).toHaveBeenCalledWith('1', 'Incomplete credentials');
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Registration request rejected');
    });
  });

  it('requires rejection reason', async () => {
    vi.mocked(UserManagementAPI.getRegistrationRequests).mockResolvedValue(mockRequests);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
    });

    const rejectButtons = screen.getAllByText('Reject');
    await userEvent.click(rejectButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Reject Registration Request')).toBeInTheDocument();
    });

    // Find the confirm button in the dialog (not the table buttons)
    const dialogButtons = screen.getAllByRole('button', { name: /Reject/i });
    const confirmButton = dialogButtons[dialogButtons.length - 1]; // Last one is in the dialog
    
    // Button should be disabled when no reason is provided
    expect(confirmButton).toBeDisabled();
    expect(UserManagementAPI.rejectRegistration).not.toHaveBeenCalled();
  });

  it('displays error when API call fails', async () => {
    vi.mocked(UserManagementAPI.getRegistrationRequests).mockRejectedValue(
      new Error('Network error')
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Error loading registration requests/)).toBeInTheDocument();
    });
  });

  it('displays all required fields for each request', async () => {
    vi.mocked(UserManagementAPI.getRegistrationRequests).mockResolvedValue(mockRequests);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
    });

    // Check all required fields are displayed
    expect(screen.getByText('john.smith@example.com')).toBeInTheDocument();
    expect(screen.getByText('MD, Board Certified')).toBeInTheDocument();
    expect(screen.getByText('Doctor')).toBeInTheDocument();
    
    // Check date is formatted
    const dateElements = screen.getAllByText(/1\/15\/2024|1\/16\/2024/);
    expect(dateElements.length).toBeGreaterThan(0);
  });
});
