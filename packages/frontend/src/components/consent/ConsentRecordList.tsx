'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ConsentAPI } from '@/lib/api/services/consent';
import { LoadingSpinner } from '@/components/LoadingSpinner';

import type { ConsentRecord } from '@/lib/api/types';

export default function ConsentRecordList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Fetch consent records
  const { data: records = [], isLoading, error } = useQuery({
    queryKey: ['consent-records', statusFilter, typeFilter],
    queryFn: () =>
      ConsentAPI.getConsentRecords(
        undefined,
        statusFilter !== 'all' ? (statusFilter as ConsentRecord['status']) : undefined
      ),
  });

  // Filter by search term and type
  const filteredRecords = records.filter((record) => {
    const matchesSearch =
      record.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.patientId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType =
      typeFilter === 'all' || record.consentType.toLowerCase() === typeFilter.toLowerCase();
    return matchesSearch && matchesType;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'withdrawn':
        return 'bg-red-100 text-red-800';
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error Loading Consent Records</h3>
          <p className="text-red-600 mt-2">
            {error instanceof Error ? error.message : 'Failed to load consent records'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Consent Records</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Patient
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Name or ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Consent Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="treatment">Treatment</option>
              <option value="research">Research</option>
              <option value="data_sharing">Data Sharing</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Consent Records</h3>
          <p className="text-sm text-gray-600 mt-1">
            {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} found
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Consent Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Granted Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expiration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No consent records found
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <>
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {record.patientName}
                        </div>
                        <div className="text-sm text-gray-500">{record.patientId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.consentType}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(record.grantedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.expiresAt
                          ? new Date(record.expiresAt).toLocaleDateString()
                          : 'No expiration'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            record.status
                          )}`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() =>
                            setExpandedRow(expandedRow === record.id ? null : record.id)
                          }
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {expandedRow === record.id ? 'Hide Details' : 'View Details'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Row */}
                    {expandedRow === record.id && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-gray-50">
                          <div className="space-y-4">
                            {/* Data Categories */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                Data Categories
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {record.scope.dataCategories.map((category, idx) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                                  >
                                    {category}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Processing Purposes */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                Processing Purposes
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {record.scope.processingPurposes.map((purpose, idx) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                                  >
                                    {purpose}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Withdrawal Info */}
                            {record.withdrawnAt && (
                              <div className="bg-red-50 border border-red-200 rounded p-3">
                                <p className="text-sm text-red-800">
                                  <span className="font-semibold">Withdrawn on:</span>{' '}
                                  {new Date(record.withdrawnAt).toLocaleString()}
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
