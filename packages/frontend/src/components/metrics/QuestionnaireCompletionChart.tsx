import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { TooltipValueType } from 'recharts';
import { useI18n } from '@/lib/i18n';

interface QuestionnaireCompletionData {
  rate: number;
  avgCompletionTime: number;
  abandonmentBySection: Record<string, number>;
  warningThreshold: boolean;
}

interface QuestionnaireCompletionChartProps {
  data?: QuestionnaireCompletionData;
}

export default function QuestionnaireCompletionChart({ data }: QuestionnaireCompletionChartProps) {
  const { t } = useI18n();
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 aria-level={2} className="text-lg font-semibold text-gray-900 mb-4">{t('admin.questionnaireCompletion')}</h3>
        <div className="text-gray-500">{t('admin.noData')}</div>
      </div>
    );
  }

  // Prepare abandonment data for chart
  const abandonmentData = Object.entries(data.abandonmentBySection || {}).map(([section, rate]) => ({
    section,
    rate,
  }));

  // Format average completion time
  const avgMinutes = Math.round(data.avgCompletionTime / 60);

  // Determine color based on threshold
  const rateColor = data.warningThreshold ? 'text-red-600' : 'text-green-600';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 aria-level={2} className="text-lg font-semibold text-gray-900">{t('admin.questionnaireCompletion')}</h3>
        <div className={`text-3xl font-bold ${rateColor}`}>
          {data.rate.toFixed(1)}%
        </div>
      </div>

      {/* Warning Indicator */}
      {data.warningThreshold && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-red-800 font-medium">
              {t('admin.completionWarn')}
            </span>
          </div>
        </div>
      )}

      {/* Completion Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{t('admin.completionRate')}</span>
          <span className="text-sm font-medium text-gray-900">{data.rate.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all ${
              data.warningThreshold ? 'bg-red-600' : 'bg-green-600'
            }`}
            style={{ width: `${data.rate}%` }}
          />
        </div>
      </div>

      {/* Average Completion Time */}
      <div className="mb-6 bg-gray-50 rounded-lg p-4">
        <div className="text-sm text-gray-600">{t('admin.avgCompletionTime')}</div>
        <div className="text-2xl font-bold text-gray-900 mt-1">{t('admin.minutesLong', { count: avgMinutes })}</div>
      </div>

      {/* Abandonment by Section */}
      {abandonmentData.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">{t('admin.abandonBySection')}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={abandonmentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="section" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip 
                formatter={(value: TooltipValueType | undefined) => [`${Number(value).toFixed(1)}%`, t('admin.abandonmentRate')]}
              />
              <Legend />
              <Bar 
                dataKey="rate" 
                fill="#f59e0b" 
                name={t('admin.abandonmentRate')}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
