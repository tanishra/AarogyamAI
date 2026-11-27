'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ConsentAPI } from '@/lib/api/services/consent';
import { useI18n } from '@/lib/i18n';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function ComplianceReportGenerator() {
  const { t } = useI18n();
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
        alert(t('compliance.selectDates'));
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
          {t('compliance.generateTitle')}
        </h3>

        <div className="space-y-4">
          {/* Time Period Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('compliance.timePeriod')}
            </label>
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="1">{t('compliance.last1Month')}</option>
              <option value="3">{t('compliance.last3Months')}</option>
              <option value="6">{t('compliance.last6Months')}</option>
              <option value="12">{t('compliance.last12Months')}</option>
              <option value="custom">{t('compliance.customRange')}</option>
            </select>
          </div>

          {/* Custom Date Range */}
          {timePeriod === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('admin.startDate')}
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
                  {t('admin.endDate')}
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
              {t('compliance.contents')}
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• {t('compliance.contentConsent')}</li>
              <li>• {t('compliance.contentGrievance')}</li>
              <li>• {t('compliance.contentAccess')}</li>
              <li>• {t('compliance.contentAudit')}</li>
              <li>• {t('compliance.contentMetrics')}</li>
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
                {t('compliance.generating')}
              </span>
            ) : (
              t('compliance.generate')
            )}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {generateReport.isError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">{t('compliance.generateError')}</h3>
          <p className="text-red-600 mt-2">
            {generateReport.error instanceof Error
              ? generateReport.error.message
              : t('compliance.generateFailed')}
          </p>
        </div>
      )}

      {/* Report Ready */}
      {reportData && (
        <div role="status" aria-live="polite" className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">📄</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t('compliance.ready')}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {t('compliance.readyDesc')}
              </p>

              {/* Report Metadata */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('compliance.generated')}</span>
                  <span className="text-gray-900 font-medium">
                    {new Date().toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('compliance.expires')}</span>
                  <span className="text-gray-900 font-medium">
                    {new Date(reportData.expiresAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('compliance.format')}</span>
                  <span className="text-gray-900 font-medium">PDF</span>
                </div>
              </div>

              {/* Download Button */}
              <a
                href={reportData.downloadUrl}
                download
                className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                {t('compliance.download')}
              </a>

              {/* Expiration Warning */}
              <p className="text-xs text-gray-500 mt-3">
                {t('compliance.expiryWarn')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Reports */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-md font-semibold text-gray-900 mb-4">{t('compliance.about')}</h4>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            {t('compliance.aboutP1')}
          </p>
          <p>
            {t('compliance.aboutP2')}
          </p>
          <p>
            {t('compliance.aboutP3')}
          </p>
        </div>
      </div>
    </div>
  );
}
