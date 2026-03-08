import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserList } from './UserList';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import type { UserAccount, PaginatedResponse } from '@/lib/api/types';

vi.mock('@/lib/api/services/userManagement');

const mockUsers: UserAccount[] = [
  {
    id: '1',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'Administrator',
    isActive: true,
    mfaEnabled: true,
    mfaMethod: 'totp',
    lastPasswordChange: '2024-01-01T00:00:00Z',
    createdAt: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Doctor Smith',
    email: 'doctor@example.com',
    role: 'Doctor',
    isActive: true,
    mfaEnabled: false,
    lastPasswordChange: '2024-01-01T00:00:00Z',
    createdAt: '2023-06-01T00:00:00Z',
  },
  {
    id: '3',
    name: 'Inactive User',
    email: 'inactive@example.com',
    role: 'Nurse',
    isActive: false,
    mfaEnabled: false,
    lastPasswordChange: '2024-01-01T00:00:00Z',
    createdAt: '2023-03-01T00:00:00Z',
  },
];

describe('UserList', () => {
  let queryClient: QueryClient;
  const mockOnSelectUser = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <UserList onSelectUser={mockOnSelectUser} />
      </QueryClientProvider>
    );
  };

  it('displays user list with pagination info', async () => {
    const mockResponse: PaginatedResponse<UserAccount> = {
      data: mockUsers,
      total: 3,
      page: 1,
      pageSize: 50,
    };
    vi.mocked(UserManagementAPI.getUsers).mockResolvedValue(mockResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('Doctor Smith')).toBeInTheDocument();
      expect(screen.getByText('Inactive User')).toBeInTheDocument();
    });

    expect(screen.getByText('3 total users')).toBeInTheDocument();
  });

  it('filters users by search term', async () => {
    const mockResponse: PaginatedResponse<UserAccount> = {
      data: mockUsers,
      total: 3,
      page: 1,
      pageSize: 50,
    };
    vi.mocked(UserManagementAPI.getUsers).mockResolvedValue(mockResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search users...');
    await userEvent.type(searchInput, 'doctor');

    await waitFor(() => {
      expect(screen.getByText('Doctor Smith')).toBeInTheDocument();
      expect(screen.queryByText('Admin User')).not.toBeInTheDocument();
    });
  });

  it('displays user status correctly', async () => {
    const mockResponse: PaginatedResponse<UserAccount> = {
      data: mockUsers,
      total: 3,
      page: 1,
      pageSize: 50,
    };
    vi.mocked(UserManagementAPI.getUsers).mockResolvedValue(mockResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const activeStatuses = screen.getAllByText('Active');
    expect(activeStatuses).toHaveLength(2);

    const inactiveStatus = screen.getByText('Inactive');
    expect(inactiveStatus).toBeInTheDocument();
  });

  it('displays MFA status correctly', async () => {
    const mockResponse: PaginatedResponse<UserAccount> = {
      data: mockUsers,
      total: 3,
      page: 1,
      pageSize: 50,
    };
    vi.mocked(UserManagementAPI.getUsers).mockResolvedValue(mockResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('Enabled (totp)')).toBeInTheDocument();
    const disabledStatuses = screen.getAllByText('Disabled');
    expect(disabledStatuses).toHaveLength(2);
  });

  it('calls onSelectUser when View Details is clicked', async () => {
    const mockResponse: PaginatedResponse<UserAccount> = {
      data: mockUsers,
      total: 3,
      page: 1,
      pageSize: 50,
    };
    vi.mocked(UserManagementAPI.getUsers).mockResolvedValue(mockResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const viewButtons = screen.getAllByText('View Details');
    await userEvent.click(viewButtons[0]);

    expect(mockOnSelectUser).toHaveBeenCalledWith(mockUsers[0]);
  });

  it('handles pagination', async () => {
    const mockResponse: PaginatedResponse<UserAccount> = {
      data: mockUsers,
      total: 150,
      page: 1,
      pageSize: 50,
    };
    vi.mocked(UserManagementAPI.getUsers).mockResolvedValue(mockResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    const nextButton = screen.getByText('Next');
    expect(nextButton).not.toBeDisabled();

    const prevButton = screen.getByText('Previous');
    expect(prevButton).toBeDisabled();
  });
});
