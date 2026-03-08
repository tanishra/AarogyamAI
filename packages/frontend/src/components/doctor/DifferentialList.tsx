'use client';

import { useState } from 'react';
import { AnimatedButton } from '@/components/common';

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

interface DifferentialListProps {
  encounterId: string;
  differentials: Differential[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  isLoading?: boolean;
}

export function DifferentialList({
  encounterId,
  differentials,
  onAdd,
  onRemove,
  onReorder,
  isLoading = false,
}: DifferentialListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const currentOrder = differentials.map(d => d.id);
    const draggedIndex = currentOrder.indexOf(draggedId);
    const targetIndex = currentOrder.indexOf(targetId);

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);

    onReorder(newOrder);
    setDraggedId(null);
    setDragOverId(null);
  };

  const getSourceBadge = (source: 'ai' | 'physician') => {
    if (source === 'ai') {
      return (
        <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
          AI
        </span>
      );
    }
    return (
      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
        Physician
      </span>
    );
  };

  return (
    <div className="ui-surface overflow-hidden p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Differential Diagnoses</h3>
          <p className="mt-1 text-sm text-slate-600">Drag to reorder by priority</p>
        </div>
        <AnimatedButton onClick={onAdd} disabled={isLoading} size="sm">
          Add Diagnosis
        </AnimatedButton>
      </div>

      {differentials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No differential diagnoses yet</p>
          <p className="mt-1 text-xs text-slate-500">Add diagnoses to build your differential list</p>
        </div>
      ) : (
        <div className="space-y-2">
          {differentials.map((diff, index) => (
            <div
              key={diff.id}
              draggable
              onDragStart={(e) => handleDragStart(e, diff.id)}
              onDragOver={(e) => handleDragOver(e, diff.id)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, diff.id)}
              className={`group rounded-xl border bg-white p-4 transition-all duration-200 ${
                draggedId === diff.id
                  ? 'opacity-50'
                  : dragOverId === diff.id
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-200 hover:border-blue-200 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 cursor-move items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                  {index + 1}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900">{diff.diagnosis.name}</h4>
                      <p className="mt-0.5 text-xs text-slate-500">ICD-10: {diff.diagnosis.code}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getSourceBadge(diff.source)}
                      {diff.confidence !== undefined && (
                        <span className="text-xs text-slate-500">{diff.confidence}%</span>
                      )}
                    </div>
                  </div>
                  
                  {diff.clinicalReasoning && (
                    <p className="mt-2 text-xs text-slate-600">{diff.clinicalReasoning}</p>
                  )}
                </div>

                <button
                  onClick={() => onRemove(diff.id)}
                  className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  aria-label="Remove diagnosis"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
