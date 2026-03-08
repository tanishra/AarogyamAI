'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatedButton } from '@/components/common';

interface Diagnosis {
  code: string;
  name: string;
  category?: string;
}

interface AddDifferentialFormProps {
  onSubmit: (data: {
    diagnosis: Diagnosis;
    priority: number;
    clinicalReasoning?: string;
  }) => Promise<void>;
  onCancel: () => void;
  onSearch: (query: string) => Promise<Diagnosis[]>;
  isSubmitting?: boolean;
}

export function AddDifferentialForm({
  onSubmit,
  onCancel,
  onSearch,
  isSubmitting = false,
}: AddDifferentialFormProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Diagnosis[]>([]);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<Diagnosis | null>(null);
  const [priority, setPriority] = useState(1);
  const [clinicalReasoning, setClinicalReasoning] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await onSearch(searchQuery);
        setSearchResults(results);
        setShowResults(true);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, onSearch]);

  const handleSelectDiagnosis = (diagnosis: Diagnosis) => {
    setSelectedDiagnosis(diagnosis);
    setSearchQuery(diagnosis.name);
    setShowResults(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDiagnosis) {
      return;
    }

    await onSubmit({
      diagnosis: selectedDiagnosis,
      priority,
      clinicalReasoning: clinicalReasoning.trim() || undefined,
    });
  };

  return (
    <div className="ui-surface p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Add Differential Diagnosis</h3>
        <p className="mt-1 text-sm text-slate-600">Search for ICD-10 diagnosis</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search Diagnosis
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedDiagnosis(null);
            }}
            onFocus={() => {
              if (searchResults.length > 0) {
                setShowResults(true);
              }
            }}
            placeholder="Type to search ICD-10 codes..."
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            required
          />
          
          {isSearching && (
            <div className="absolute right-3 top-9 text-slate-400">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}

          {showResults && searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {searchResults.map((diagnosis) => (
                <button
                  key={diagnosis.code}
                  type="button"
                  onClick={() => handleSelectDiagnosis(diagnosis)}
                  className="w-full border-b border-slate-100 px-3 py-2 text-left transition-colors hover:bg-blue-50 last:border-b-0"
                >
                  <div className="text-sm font-medium text-slate-900">{diagnosis.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span>{diagnosis.code}</span>
                    {diagnosis.category && (
                      <>
                        <span>•</span>
                        <span>{diagnosis.category}</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedDiagnosis && (
            <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-900">{selectedDiagnosis.name}</div>
                  <div className="text-xs text-green-700">ICD-10: {selectedDiagnosis.code}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDiagnosis(null);
                    setSearchQuery('');
                  }}
                  className="text-green-600 hover:text-green-800"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Priority (1 = highest)
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Clinical Reasoning (Optional)
          </label>
          <textarea
            value={clinicalReasoning}
            onChange={(e) => setClinicalReasoning(e.target.value)}
            rows={3}
            placeholder="Explain why this diagnosis is being considered..."
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
          <AnimatedButton
            type="submit"
            disabled={!selectedDiagnosis || isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Diagnosis'}
          </AnimatedButton>
          <AnimatedButton
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </AnimatedButton>
        </div>
      </form>
    </div>
  );
}
