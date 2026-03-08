import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Preparation Time</h3>
        <div className="text-gray-500">No data available</div>
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
        <h3 className="text-lg font-semibold text-gray-900">Preparation Time</h3>
        <div className="text-3xl font-bold text-purple-600">{avgMinutes} min</div>
      </div>

      {/* Distribution Histogram */}
      {data.distribution && data.distribution.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Time Distribution</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.distribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="range" 
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value: number) => [value, 'Consultations']}
              />
              <Legend />
              <Bar 
                dataKey="count" 
                fill="#8b5cf6" 
                name="Consultations"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trend Chart */}
      {data.trend && data.trend.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Trend Over Time</h4>
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
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value: number) => [`${Math.round(value / 60)} min`, 'Avg Time']}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                name="Avg Prep Time"
                dot={{ fill: '#8b5cf6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Doctor Segmentation */}
      {doctorData.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">By Doctor</h4>
          <div className="space-y-2">
            {doctorData.map(({ doctor, time }) => (
              <div key={doctor} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{doctor}</span>
                <span className="text-sm font-medium text-gray-900">{time} min</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
