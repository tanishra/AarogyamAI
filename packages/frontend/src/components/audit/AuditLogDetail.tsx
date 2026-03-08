'use client';

interface AuditLogEntry {
  id: string;
  timestamp: string;
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
  hash: string;
}

interface AuditLogDetailProps {
  log: AuditLogEntry;
  onClose: () => void;
}

export default function AuditLogDetail({ log, onClose }: AuditLogDetailProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Basic Information */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Entry ID</label>
                <div className="text-sm text-gray-900 font-mono">{log.id}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Timestamp</label>
                <div className="text-sm text-gray-900">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Action Type</label>
                <div className="text-sm">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {log.actionType}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Outcome</label>
                <div className="text-sm">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      log.outcome === 'success'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {log.outcome}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* User Information */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">User Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">User ID</label>
                <div className="text-sm text-gray-900 font-mono">{log.userId}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">User Name</label>
                <div className="text-sm text-gray-900">{log.userName}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">User Role</label>
                <div className="text-sm text-gray-900">{log.userRole}</div>
              </div>
            </div>
          </div>

          {/* Resource Information */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Resource Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Resource Type</label>
                <div className="text-sm text-gray-900">{log.resource}</div>
              </div>
              {log.resourceId && (
                <div>
                  <label className="text-xs text-gray-500">Resource ID</label>
                  <div className="text-sm text-gray-900 font-mono">{log.resourceId}</div>
                </div>
              )}
            </div>
          </div>

          {/* Technical Details */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Technical Details</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">IP Address</label>
                <div className="text-sm text-gray-900 font-mono">{log.ipAddress}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">User Agent</label>
                <div className="text-sm text-gray-900 break-all">{log.userAgent}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Hash (Tamper Detection)</label>
                <div className="text-sm text-gray-900 font-mono break-all bg-gray-50 p-2 rounded">
                  {log.hash}
                </div>
              </div>
            </div>
          </div>

          {/* Error Details (if failure) */}
          {log.outcome === 'failure' && log.errorDetails && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Error Details</h4>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <pre className="text-sm text-red-800 whitespace-pre-wrap break-all">
                  {log.errorDetails}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
