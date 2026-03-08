'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigation } from '@/components/Navigation';
import { AppShell, PageHeader, AnimatedButton, EmptyState } from '@/components/common';

interface AuditLogEntry {
  id: string;
  timestamp: string | number;
  userId: string;
  userName: string;
  userRole: string;
  actionType: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure';
  errorDetails?: string;
  ipAddress: string;
  userAgent: string;
}

interface AuditResponse {
  data: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ userId: '', actionType: '', startDate: '', endDate: '', resource: '' });
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
      });

      const response = await fetch(`/api/audit/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      return (await response.json()) as AuditResponse;
    },
  });

  const logs = data?.data || [];
  const hasMore = Boolean(data?.pagination?.hasMore);

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      const response = await fetch('/api/audit/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          format,
          ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
        }),
      });

      if (!response.ok) throw new Error('Export failed');
      const result = await response.json();
      if (result?.data?.downloadUrl) window.open(result.data.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Failed to export audit logs');
    }
  };

  return (
    <>
      <Navigation />
      <AppShell>
        <div className="mb-6 flex flex-col gap-4 overflow-hidden rounded-[22px] border border-amber-300/45 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 px-6 py-6 text-white shadow-2xl shadow-orange-900/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="ui-chip border-white/30 bg-white/10 text-amber-100">Security & Audit</p>
            <h1 className="mt-3 text-3xl font-bold">Audit Logs</h1>
            <p className="mt-1 text-sm text-amber-100/90">{logs.length} entries loaded</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AnimatedButton variant="secondary" onClick={() => handleExport('csv')}>Export CSV</AnimatedButton>
            <AnimatedButton variant="secondary" onClick={() => handleExport('pdf')}>Export PDF</AnimatedButton>
            <AnimatedButton onClick={() => refetch()}>Refresh</AnimatedButton>
          </div>
        </div>

        <div className="ui-surface mb-5 border-orange-200/70 bg-gradient-to-r from-orange-50 to-amber-50 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Filters</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <input type="text" placeholder="User ID" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })} className="ui-focus-ring rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input type="text" placeholder="Action" value={filters.actionType} onChange={(e) => setFilters({ ...filters, actionType: e.target.value })} className="ui-focus-ring rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="ui-focus-ring rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="ui-focus-ring rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <input type="text" placeholder="Resource" value={filters.resource} onChange={(e) => setFilters({ ...filters, resource: e.target.value })} className="ui-focus-ring rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <AnimatedButton variant="secondary" onClick={() => setFilters({ userId: '', actionType: '', startDate: '', endDate: '', resource: '' })}>
              Clear
            </AnimatedButton>
            <AnimatedButton onClick={() => setPage(1)}>Apply</AnimatedButton>
          </div>
        </div>

        <div className="ui-surface overflow-hidden p-0">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-slate-600">Loading audit logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No logs found" description="Try broadening your filter criteria." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{log.userName}</p>
                        <p className="text-xs text-slate-500">{log.userRole}</p>
                      </td>
                      <td className="px-4 py-3">{log.actionType}</td>
                      <td className="px-4 py-3">{log.resource}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${log.outcome === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {log.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedLog(log)} className="font-medium text-blue-600 hover:text-blue-700">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-600">Page {page}</p>
            <div className="flex gap-2">
              <AnimatedButton variant="secondary" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Previous</AnimatedButton>
              <AnimatedButton variant="secondary" size="sm" onClick={() => setPage(page + 1)} disabled={!hasMore}>Next</AnimatedButton>
            </div>
          </div>
        </div>

        {selectedLog ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="ui-surface w-full max-w-2xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Audit Entry</h2>
                <button onClick={() => setSelectedLog(null)} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
              </div>
              <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(selectedLog, null, 2)}</pre>
            </div>
          </div>
        ) : null}
      </AppShell>
    </>
  );
}
