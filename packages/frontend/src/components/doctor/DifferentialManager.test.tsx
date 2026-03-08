import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { DifferentialManager } from './DifferentialManager';
import apiClient from '@/lib/api/client';

// Mock the API client
vi.mock('@/lib/api/client');
const mockedApiClient = apiClient as any;

describe('DifferentialManager', () => {
  const mockEncounterId = 'test-encounter-123';
  const mockDifferentials = [
    {
      id: 'diff-1',
      diagnosis: {
        code: 'J18.9',
        name: 'Pneumonia, unspecified organism',
        category: 'Respiratory',
      },
      priority: 1,
      source: 'ai' as const,
      clinicalReasoning: 'Patient presents with fever and cough',
      confidence: 85,
      addedBy: 'ai-system',
      addedAt: '2024-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders differential list', () => {
    render(
      <DifferentialManager
        encounterId={mockEncounterId}
        initialDifferentials={mockDifferentials}
      />
    );

    expect(screen.getByText('Differential Diagnoses')).toBeInTheDocument();
    expect(screen.getByText('Pneumonia, unspecified organism')).toBeInTheDocument();
    expect(screen.getByText('ICD-10: J18.9')).toBeInTheDocument();
  });

  it('shows add diagnosis button', () => {
    render(
      <DifferentialManager
        encounterId={mockEncounterId}
        initialDifferentials={[]}
      />
    );

    const addButton = screen.getByText('Add Diagnosis');
    expect(addButton).toBeInTheDocument();
  });

  it('shows add form when add button clicked', () => {
    render(
      <DifferentialManager
        encounterId={mockEncounterId}
        initialDifferentials={[]}
      />
    );

    const addButton = screen.getByText('Add Diagnosis');
    fireEvent.click(addButton);

    expect(screen.getByText('Add Differential Diagnosis')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type to search ICD-10 codes...')).toBeInTheDocument();
  });

  it('handles remove diagnosis', async () => {
    // Mock successful delete
    mockedApiClient.delete.mockResolvedValueOnce({ data: { message: 'Removed' } });
    mockedApiClient.get.mockResolvedValueOnce({ data: { data: [] } });

    // Mock window.confirm
    global.confirm = vi.fn(() => true);

    render(
      <DifferentialManager
        encounterId={mockEncounterId}
        initialDifferentials={mockDifferentials}
      />
    );

    const removeButton = screen.getByLabelText('Remove diagnosis');
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(mockedApiClient.delete).toHaveBeenCalledWith(
        `/api/doctor/encounters/${mockEncounterId}/differentials/diff-1`
      );
    });
  });

  it('displays empty state when no differentials', () => {
    render(
      <DifferentialManager
        encounterId={mockEncounterId}
        initialDifferentials={[]}
      />
    );

    expect(screen.getByText('No differential diagnoses yet')).toBeInTheDocument();
  });

  it('shows AI badge for AI-generated diagnoses', () => {
    render(
      <DifferentialManager
        encounterId={mockEncounterId}
        initialDifferentials={mockDifferentials}
      />
    );

    expect(screen.getByText('AI')).toBeInTheDocument();
  });
});
