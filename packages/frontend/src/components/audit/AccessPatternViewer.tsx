'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuditLogAPI } from '@/lib/api/services/auditLog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AccessPattern {
  userId: string;
  userName: string;
  userRole: string;
  accessCount: number;
  lastAccess: string;
  purpose: string;
  isAnomaly: boolean;
}

export default function AccessPatternViewer() {
  const [patientId, setPatientId] = useState('');
  const [searchPatientId, setSearchPatientId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch access patterns
  const { data, isLoading, error } = useQuery({
    queryKey: ['access-patterns', searchPatientId, startDate, endDate],
    queryFn: () =>
      AuditLogAPI.getAccessPatterns(searchPatientId, startDate || undefined, endDate || undefined),
    enabled: !!searchPatientId,
  });

  const handleSearch = () => {
    setSearchPatientId(patientId);
  };

  const patterns: AccessPattern[] = Array.isArray(data) ? data : ((data as any)?.patterns || []);
  const timeline = (data as any)?.timeline || [];

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Patient Data Access Patterns
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Patient ID *
            </label>
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Enter patient ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <button
          onClick={handleSearch}
          disabled={!patientId}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Search Access Patterns
        </button>
      </div>

      {/* Results */}
      {searchPatientId && (
        <>
          {isLoading ? (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="large" />
              </div>
            </div>
          ) : error ? (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-red-800 font-semibold">Error Loading Access Patterns</h3>
                <p className="text-red-600 mt-2">
                  {error instanceof Error ? error.message : 'Failed to load access patterns'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Timeline Chart */}
              {timeline.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">
                    Access Timeline
                  </h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeline}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(value) => new Date(value).toLocaleString()}
                        formatter={(value: number) => [value, 'Accesses']}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="Access Count"
                        dot={{ fill: '#3b82f6' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Access Pattern Table */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900">
                    Users Who Accessed This Patient
                  </h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {patterns.length} user{patterns.length !== 1 ? 's' : ''} found
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Access Count
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Access
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Purpose
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {patterns.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                            No access patterns found for this patient
                          </td>
                        </tr>
                      ) : (
                        patterns.map((pattern) => (
                          <tr
                            key={pattern.userId}
                            className={pattern.isAnomaly ? 'bg-red-50' : ''}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {pattern.userName}
                              </div>
                              <div className="text-sm text-gray-500">{pattern.userRole}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-bold text-gray-900">
                                {pattern.accessCount}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(pattern.lastAccess).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {pattern.purpose}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {pattern.isAnomaly ? (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 flex items-center gap-1 w-fit">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  Anomaly
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                  Normal
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
