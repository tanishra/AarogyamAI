import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { TooltipValueType } from 'recharts';
import { useI18n } from '@/lib/i18n';

interface PreparationTimeData {
  average: number;
  distribution: Array<{ range: string; count: number }>;
  trend: Array<{ date: string; value: number }>;
  byDoctor: Record<string, number>;
}

interface PreparationTimeChartProps {
  data?: PreparationTimeData;
  period: 'daily' | 'weekly' | 'monthly';
}

export default function PreparationTimeChart({ data, period }: PreparationTimeChartProps) {
  const { t } = useI18n();
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.prepTime')}</h3>
        <div className="text-gray-500">{t('admin.noData')}</div>
      </div>
    );
  }

  // Format doctor data for table
  const doctorData = Object.entries(data.byDoctor || {}).map(([doctor, time]) => ({
    doctor,
    time: Math.round(time / 60), // Convert to minutes
  }));

  // Format average time
  const avgMinutes = Math.round(data.average / 60);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('admin.prepTime')}</h3>
        <div className="text-3xl font-bold text-purple-600">{t('admin.minutes', { count: avgMinutes })}</div>
      </div>

      {/* Distribution Histogram */}
      {data.distribution && data.distribution.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">{t('admin.timeDistribution')}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.distribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="range" 
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value: TooltipValueType | undefined) => [value, t('admin.consultations')]}
              />
              <Legend />
              <Bar 
                dataKey="count" 
                fill="#8b5cf6" 
                name={t('admin.consultations')}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trend Chart */}
      {data.trend && data.trend.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">{t('admin.trendOverTime')}</h4>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return period === 'monthly' 
                    ? date.toLocaleDateString('en-US', { month: 'short' })
                    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${Math.round(value / 60)}m`}
              />
              <Tooltip 
                labelFormatter={(value) => new Date(String(value)).toLocaleDateString()}
                formatter={(value: TooltipValueType | undefined) => [`${Math.round(Number(value) / 60)} min`, t('admin.avgTime')]}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                name={t('admin.avgPrepTime')}
                dot={{ fill: '#8b5cf6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Doctor Segmentation */}
      {doctorData.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">{t('admin.byDoctor')}</h4>
          <div className="space-y-2">
            {doctorData.map(({ doctor, time }) => (
              <div key={doctor} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{doctor}</span>
                <span className="text-sm font-medium text-gray-900">{t('admin.minutes', { count: time })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
