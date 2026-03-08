'use client';

import { useState } from 'react';

export default function ComplianceReportGenerator() {
  const [timePeriod, setTimePeriod] = useState(3);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setDownloadUrl(null);
    
    try {
      const response = await fetch('/api/compliance/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ timePeriodMonths: timePeriod }),
      });

      if (!response.ok) throw new Error('Report generation failed');

      const data = await response.json();
      setDownloadUrl(data.data.downloadUrl);
    } catch (error) {
      console.error('Report generation error:', error);
      alert('Failed to generate compliance report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance Report Generator</h3>
      <p className="text-sm text-gray-600 mb-6">
        Generate comprehensive DPDP compliance reports including consent statistics, grievance summaries, and data access metrics
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Time Period
        </label>
        <select
          value={timePeriod}
          onChange={(e) => setTimePeriod(parseInt(e.target.value))}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value={1}>Last 1 month</option>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Generating...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Generate Report</span>
            </>
          )}
        </button>

        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Download Report</span>
          </a>
        )}
      </div>

      {downloadUrl && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            <span className="font-medium">Report generated successfully!</span>
            <br />
            <span className="text-xs">Download link expires in 1 hour</span>
          </p>
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Report Contents:</h4>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Consent statistics (granted, withdrawn, expired)</li>
          <li>Grievance summaries (pending, resolved, escalated)</li>
          <li>Data access request metrics</li>
          <li>Data breach incidents (if any)</li>
          <li>DPO identity and generation timestamp</li>
          <li>Confidentiality notice</li>
        </ul>
      </div>
    </div>
  );
}
