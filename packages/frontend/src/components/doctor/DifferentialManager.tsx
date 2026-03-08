'use client';

import { useState } from 'react';
import { DifferentialList } from './DifferentialList';
import { AddDifferentialForm } from './AddDifferentialForm';
import apiClient from '@/lib/api/client';

interface Diagnosis {
  code: string;
  name: string;
  category?: string;
}

interface Differential {
  id: string;
  diagnosis: Diagnosis;
  priority: number;
  source: 'ai' | 'physician';
  clinicalReasoning?: string;
  confidence?: number;
  addedBy: string;
  addedAt: string;
}

interface DifferentialManagerProps {
  encounterId: string;
  initialDifferentials?: Differential[];
  onUpdate?: () => void;
}

export function DifferentialManager({
  encounterId,
  initialDifferentials = [],
  onUpdate,
}: DifferentialManagerProps) {
  const [differentials, setDifferentials] = useState<Differential[]>(initialDifferentials);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAdd = () => {
    setShowAddForm(true);
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
  };

  const handleSubmitAdd = async (data: {
    diagnosis: Diagnosis;
    priority: number;
    clinicalReasoning?: string;
  }) => {
    setIsLoading(true);
    try {
      const response = await apiClient.post(
        `/api/doctor/encounters/${encounterId}/differentials`,
        {
          icdCode: data.diagnosis.code,
          diagnosisName: data.diagnosis.name,
          diagnosisCategory: data.diagnosis.category,
          priority: data.priority,
          source: 'physician',
          clinicalReasoning: data.clinicalReasoning,
        }
      );

      // Refresh differentials list
      await refreshDifferentials();
      setShowAddForm(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error adding differential:', error);
      alert('Failed to add differential diagnosis');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Are you sure you want to remove this diagnosis?')) {
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.delete(
        `/api/doctor/encounters/${encounterId}/differentials/${id}`
      );

      // Refresh differentials list
      await refreshDifferentials();
      onUpdate?.();
    } catch (error) {
      console.error('Error removing differential:', error);
      alert('Failed to remove differential diagnosis');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    // Optimistically update UI
    const reordered = orderedIds
      .map(id => differentials.find(d => d.id === id))
      .filter((d): d is Differential => d !== undefined);
    setDifferentials(reordered);

    try {
      await apiClient.put(
        `/api/doctor/encounters/${encounterId}/differentials/order`,
        { orderedIds }
      );
      onUpdate?.();
    } catch (error) {
      console.error('Error reordering differentials:', error);
      // Revert on error
      await refreshDifferentials();
      alert('Failed to reorder differential diagnoses');
    }
  };

  const handleSearch = async (query: string): Promise<Diagnosis[]> => {
    try {
      const response = await apiClient.get('/api/doctor/diagnoses/search', {
        params: { q: query },
      });
      return response.data.data || [];
    } catch (error) {
      console.error('Error searching diagnoses:', error);
      return [];
    }
  };

  const refreshDifferentials = async () => {
    try {
      const response = await apiClient.get(
        `/api/doctor/encounters/${encounterId}/differentials`
      );
      setDifferentials(response.data.data || []);
    } catch (error) {
      console.error('Error refreshing differentials:', error);
    }
  };

  if (showAddForm) {
    return (
      <AddDifferentialForm
        onSubmit={handleSubmitAdd}
        onCancel={handleCancelAdd}
        onSearch={handleSearch}
        isSubmitting={isLoading}
      />
    );
  }

  return (
    <DifferentialList
      encounterId={encounterId}
      differentials={differentials}
      onAdd={handleAdd}
      onRemove={handleRemove}
      onReorder={handleReorder}
      isLoading={isLoading}
    />
  );
}
