'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ConsentAPI } from '@/lib/api/services/consent';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function ComplianceReportGenerator() {
  const [timePeriod, setTimePeriod] = useState('1');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [reportData, setReportData] = useState<{
    downloadUrl: string;
    expiresAt: string;
  } | null>(null);

  // Generate report mutation
  const generateReport = useMutation({
    mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) =>
      ConsentAPI.generateComplianceReport(startDate, endDate),
    onSuccess: (data) => {
      setReportData(data);
    },
  });

  const handleGenerate = () => {
    let startDate: string;
    let endDate: string = new Date().toISOString().split('T')[0];

    if (timePeriod === 'custom') {
      if (!customStartDate || !customEndDate) {
        alert('Please select both start and end dates');
        return;
      }
      startDate = customStartDate;
      endDate = customEndDate;
    } else {
      const months = parseInt(timePeriod);
      const start = new Date();
      start.setMonth(start.getMonth() - months);
      startDate = start.toISOString().split('T')[0];
    }

    generateReport.mutate({ startDate, endDate });
  };

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Generate Compliance Report
        </h3>

        <div className="space-y-4">
          {/* Time Period Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time Period
            </label>
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="1">Last 1 Month</option>
              <option value="3">Last 3 Months</option>
              <option value="6">Last 6 Months</option>
              <option value="12">Last 12 Months</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* Custom Date Range */}
          {timePeriod === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Report Contents Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">
              Report Contents
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Consent records summary (granted, withdrawn, expired)</li>
              <li>• Grievance statistics (by status and resolution time)</li>
              <li>• Data access request metrics (fulfillment rate and timeline)</li>
              <li>• Audit log summary (access patterns and anomalies)</li>
              <li>• Compliance metrics (DPDP Act 2023 requirements)</li>
            </ul>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={generateReport.isPending}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {generateReport.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" />
                Generating Report...
              </span>
            ) : (
              'Generate Report'
            )}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {generateReport.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error Generating Report</h3>
          <p className="text-red-600 mt-2">
            {generateReport.error instanceof Error
              ? generateReport.error.message
              : 'Failed to generate compliance report'}
          </p>
        </div>
      )}

      {/* Report Ready */}
      {reportData && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">📄</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Report Ready for Download
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Your compliance report has been generated successfully.
              </p>

              {/* Report Metadata */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Generated:</span>
                  <span className="text-gray-900 font-medium">
                    {new Date().toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Expires:</span>
                  <span className="text-gray-900 font-medium">
                    {new Date(reportData.expiresAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Format:</span>
                  <span className="text-gray-900 font-medium">PDF</span>
                </div>
              </div>

              {/* Download Button */}
              <a
                href={reportData.downloadUrl}
                download
                className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                Download Report
              </a>

              {/* Expiration Warning */}
              <p className="text-xs text-gray-500 mt-3">
                ⚠️ This download link will expire in 24 hours for security reasons.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Reports */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-md font-semibold text-gray-900 mb-4">About Compliance Reports</h4>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            Compliance reports provide a comprehensive overview of data protection activities
            and help demonstrate adherence to the Digital Personal Data Protection Act, 2023.
          </p>
          <p>
            Reports include detailed metrics on consent management, grievance resolution,
            data access requests, and audit trail summaries.
          </p>
          <p>
            All reports are generated in PDF format and include timestamps, digital signatures,
            and verification hashes for authenticity.
          </p>
        </div>
      </div>
    </div>
  );
}
