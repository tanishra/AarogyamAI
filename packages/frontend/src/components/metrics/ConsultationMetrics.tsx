import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ConsultationData {
  total: number;
  daily: Array<{ date: string; value: number }>;
  weekly: Array<{ date: string; value: number }>;
  monthly: Array<{ date: string; value: number }>;
  byDoctor: Record<string, number>;
}

interface ConsultationMetricsProps {
  data?: ConsultationData;
  period: 'daily' | 'weekly' | 'monthly';
}

export default function ConsultationMetrics({ data, period }: ConsultationMetricsProps) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Consultation Metrics</h3>
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  // Select data based on period
  const chartData = data[period] || [];
  
  // Format doctor data for table
  const doctorData = Object.entries(data.byDoctor || {}).map(([doctor, count]) => ({
    doctor,
    count,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Consultation Metrics</h3>
        <div className="text-3xl font-bold text-blue-600">{data.total}</div>
      </div>

      {/* Trend Chart */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Consultation Trend</h4>
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
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: number) => [value, 'Consultations']}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Consultations"
              dot={{ fill: '#3b82f6' }}
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
                    Consultations
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {doctorData.map(({ doctor, count }) => (
                  <tr key={doctor}>
                    <td className="px-3 py-2 text-sm text-gray-900">{doctor}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">
                      {count}
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
