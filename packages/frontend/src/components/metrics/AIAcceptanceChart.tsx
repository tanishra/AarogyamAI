import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AIAcceptanceData {
  overallRate: number;
  daily: Array<{ date: string; value: number }>;
  weekly: Array<{ date: string; value: number }>;
  monthly: Array<{ date: string; value: number }>;
  byDoctor: Record<string, number>;
  warningThreshold: boolean;
}

interface AIAcceptanceChartProps {
  data?: AIAcceptanceData;
  period: 'daily' | 'weekly' | 'monthly';
}

export default function AIAcceptanceChart({ data, period }: AIAcceptanceChartProps) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Acceptance Rate</h3>
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  // Select data based on period
  const chartData = data[period] || [];
  
  // Format doctor data for table
  const doctorData = Object.entries(data.byDoctor || {}).map(([doctor, rate]) => ({
    doctor,
    rate,
  }));

  // Determine color based on threshold
  const rateColor = data.warningThreshold ? 'text-red-600' : 'text-green-600';
  const chartColor = data.warningThreshold ? '#ef4444' : '#10b981';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">AI Acceptance Rate</h3>
        <div className={`text-3xl font-bold ${rateColor}`}>
          {data.overallRate.toFixed(1)}%
        </div>
      </div>

      {/* Warning Indicator */}
      {data.warningThreshold && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-red-800 font-medium">
              Acceptance rate below 40% threshold
            </span>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Acceptance Trend</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
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
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Acceptance Rate']}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={chartColor}
              strokeWidth={2}
              name="Acceptance Rate"
              dot={{ fill: chartColor }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Doctor Segmentation */}
      {doctorData.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">By Doctor</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Doctor
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Acceptance Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {doctorData.map(({ doctor, rate }) => (
                  <tr key={doctor}>
                    <td className="px-3 py-2 text-sm text-gray-900">{doctor}</td>
                    <td className={`px-3 py-2 text-sm text-right font-medium ${
                      rate < 40 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
