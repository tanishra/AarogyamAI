'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface AuditLogFilters {
  userId?: string;
  actionType?: string;
  startDate?: string;
  endDate?: string;
  resource?: string;
}

interface AuditLogSearchProps {
  onSearch?: (filters: AuditLogFilters) => void;
}

export default function AuditLogSearch({ onSearch }: AuditLogSearchProps) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [activeFilters, setActiveFilters] = useState<AuditLogFilters>({});

  const handleFilterChange = (key: keyof AuditLogFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  const handleSearch = () => {
    setActiveFilters(filters);
    if (onSearch) {
      onSearch(filters);
    }
    // Invalidate query to trigger refetch with new filters
    queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
  };

  const handleClearFilters = () => {
    setFilters({});
    setActiveFilters({});
    if (onSearch) {
      onSearch({});
    }
    queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
  };

  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Audit Logs</h3>

      {/* Filter Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {/* User ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            User ID
          </label>
          <input
            type="text"
            value={filters.userId || ''}
            onChange={(e) => handleFilterChange('userId', e.target.value)}
            placeholder="Enter user ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Action Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Action Type
          </label>
          <select
            value={filters.actionType || ''}
            onChange={(e) => handleFilterChange('actionType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="registration_approved">Registration Approved</option>
            <option value="registration_rejected">Registration Rejected</option>
            <option value="role_change">Role Change</option>
            <option value="account_deactivation">Account Deactivation</option>
            <option value="account_activation">Account Activation</option>
            <option value="password_reset">Password Reset</option>
            <option value="mfa_enabled">MFA Enabled</option>
            <option value="mfa_disabled">MFA Disabled</option>
            <option value="consent_withdrawal">Consent Withdrawal</option>
            <option value="grievance_update">Grievance Update</option>
            <option value="data_access_fulfilled">Data Access Fulfilled</option>
          </select>
        </div>

        {/* Resource */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Resource
          </label>
          <input
            type="text"
            value={filters.resource || ''}
            onChange={(e) => handleFilterChange('resource', e.target.value)}
            placeholder="Enter resource ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSearch}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Search
        </button>
        <button
          onClick={handleClearFilters}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
        >
          Clear Filters
        </button>
        {activeFilterCount > 0 && (
          <span className="text-sm text-gray-600">
            {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
          </span>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(activeFilters).map(([key, value]) => {
            if (!value) return null;
            return (
              <div
                key={key}
                className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                <span>{value}</span>
                <button
                  onClick={() => {
                    const newFilters = { ...activeFilters };
                    delete newFilters[key as keyof AuditLogFilters];
                    setActiveFilters(newFilters);
                    setFilters(newFilters);
                    if (onSearch) {
                      onSearch(newFilters);
                    }
                    queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
                  }}
                  className="hover:text-blue-900"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
