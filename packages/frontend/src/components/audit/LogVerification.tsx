'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuditLogAPI } from '@/lib/api/services/auditLog';
import { useI18n } from '@/lib/i18n';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { showToast } from '@/lib/notifications/toast';

interface VerificationResult {
  status: string;
  entriesVerified: number;
  tamperedEntries: string[];
  verifiedAt: string;
}

export default function LogVerification() {
  const { t } = useI18n();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);

  const verifyMutation = useMutation({
    mutationFn: () =>
      AuditLogAPI.verifyIntegrity(startDate || undefined, endDate || undefined),
    onSuccess: (data) => {
      const mapped: VerificationResult = {
        status: data.verified ? 'verified' : 'failed',
        entriesVerified: data.totalEntries,
        tamperedEntries: data.tamperedEntries || [],
        verifiedAt: data.verifiedAt,
      };
      setResult(mapped);
      if (data.verified) {
        showToast(t('audit.verifyToastOk'), 'success');
      } else {
        showToast(t('audit.tamperedToast', { count: data.tamperedEntries.length }), 'error');
      }
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : t('audit.verifyToastFailed'),
        'error'
      );
    },
  });

  const handleVerify = () => {
    verifyMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Verification Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 aria-level={2} className="text-lg font-semibold text-gray-900 mb-4">
          {t('audit.verifyTitle')}
        </h3>

        <p className="text-sm text-gray-600 mb-6">
          {t('audit.verifyDesc')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('audit.startDateOptional')}
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
              {t('audit.endDateOptional')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-medium">{t('audit.processTitle')}</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>{t('audit.processHash')}</li>
                <li>{t('audit.processCompare')}</li>
                <li>{t('audit.processChain')}</li>
                <li>{t('audit.processIdentify')}</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={handleVerify}
          disabled={verifyMutation.isPending}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {verifyMutation.isPending ? (
            <>
              <LoadingSpinner size="small" />
              {t('admin.verifying')}
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {t('admin.verifyIntegrity')}
            </>
          )}
        </button>
      </div>

      {/* Verification Results */}
      {result && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 aria-level={2} className="text-lg font-semibold text-gray-900 mb-4">
            {t('audit.resultsTitle')}
          </h3>

          {/* Status Banner */}
          <div
            role={result.status === 'verified' ? 'status' : 'alert'}
            className={`rounded-lg p-4 mb-6 ${
              result.status === 'verified'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {result.status === 'verified' ? (
                <>
                  <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 aria-level={3} className="text-green-800 font-semibold text-lg">
                      {t('audit.integrityVerified')}
                    </h4>
                    <p className="text-green-600 text-sm mt-1">
                      {t('audit.verifiedDesc')}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 aria-level={3} className="text-red-800 font-semibold text-lg">
                      {t('audit.tamperingDetected')}
                    </h4>
                    <p className="text-red-600 text-sm mt-1">
                      {t('audit.tamperedFailed', {
                        count: result.tamperedEntries.length,
                        plural: result.tamperedEntries.length > 1 ? 'ies' : 'y',
                      })}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">{t('audit.statTotal')}</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {result.entriesVerified.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">{t('audit.statVerified')}</div>
              <div className="text-2xl font-bold text-green-600 mt-1">
                {(result.entriesVerified - result.tamperedEntries.length).toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">{t('audit.statTampered')}</div>
              <div className="text-2xl font-bold text-red-600 mt-1">
                {result.tamperedEntries.length}
              </div>
            </div>
          </div>

          {/* Verification Metadata */}
          <div className="text-sm text-gray-600 mb-6">
            <div>{t('audit.completedAt', { date: new Date(result.verifiedAt).toLocaleString() })}</div>
            {startDate && <div>{t('audit.startDateLabel', { date: new Date(startDate).toLocaleDateString() })}</div>}
            {endDate && <div>{t('audit.endDateLabel', { date: new Date(endDate).toLocaleDateString() })}</div>}
          </div>

          {/* Tampered Entries List */}
          {result.tamperedEntries.length > 0 && (
            <div>
              <h4 aria-level={3} className="text-sm font-semibold text-gray-900 mb-3">
                {t('audit.tamperedIds')}
              </h4>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="space-y-2">
                  {result.tamperedEntries.map((entryId) => (
                    <div
                      key={entryId}
                      className="font-mono text-sm text-red-800 bg-white px-3 py-2 rounded"
                    >
                      {entryId}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm text-red-600 mt-3">
                {t('audit.tamperedWarn')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
