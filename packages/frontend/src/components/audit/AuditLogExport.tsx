'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuditLogAPI } from '@/lib/api/services/auditLog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { showToast } from '@/lib/notifications/toast';

type ExportFormat = 'csv' | 'pdf';

export default function AuditLogExport() {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [showDialog, setShowDialog] = useState(false);

  const exportMutation = useMutation({
    mutationFn: (format: ExportFormat) => AuditLogAPI.exportLogs(format),
    onSuccess: (data) => {
      if (data.downloadUrl) {
        // Open download URL in new tab
        window.open(data.downloadUrl, '_blank');
        showToast('Export completed successfully', 'success');
        setShowDialog(false);
      }
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : 'Failed to export audit logs',
        'error'
      );
    },
  });

  const handleExport = () => {
    exportMutation.mutate(format);
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Export
      </button>

      {/* Export Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Export Audit Logs</h3>
            </div>

            {/* Content */}
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600">
                Export audit logs with current filters applied. Large datasets may be processed asynchronously.
              </p>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Export Format
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="csv"
                      checked={format === 'csv'}
                      onChange={(e) => setFormat(e.target.value as ExportFormat)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-900">CSV (Comma-Separated Values)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="pdf"
                      checked={format === 'pdf'}
                      onChange={(e) => setFormat(e.target.value as ExportFormat)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-900">PDF (Formatted Report)</span>
                  </label>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex gap-2">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Export includes:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>All filtered audit log entries</li>
                      <li>Generation timestamp and user identity</li>
                      <li>Confidentiality notice</li>
                      <li>Download link expires in 1 hour</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowDialog(false)}
                disabled={exportMutation.isPending}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exportMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {exportMutation.isPending ? (
                  <>
                    <LoadingSpinner size="small" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export {format.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
