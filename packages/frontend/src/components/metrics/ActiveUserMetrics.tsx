import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface ActiveUserData {
  byRole: Record<string, number>;
  totalRegistered: Record<string, number>;
  growthTrend: Array<{ date: string; value: number }>;
  avgSessionDuration: Record<string, number>;
}

interface ActiveUserMetricsProps {
  data?: ActiveUserData;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ActiveUserMetrics({ data }: ActiveUserMetricsProps) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Active User Metrics</h3>
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  // Prepare data for pie chart
  const pieData = Object.entries(data.byRole || {}).map(([role, count]) => ({
    name: role,
    value: count,
  }));

  const totalActive = pieData.reduce((sum, item) => sum + item.value, 0);

  // Prepare registered users data
  const registeredData = Object.entries(data.totalRegistered || {}).map(([role, count]) => ({
    role,
    count,
  }));

  // Prepare session duration data
  const sessionData = Object.entries(data.avgSessionDuration || {}).map(([role, duration]) => ({
    role,
    duration: Math.round(duration / 60), // Convert to minutes
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Active Users</h3>
        <div className="text-3xl font-bold text-green-600">{totalActive}</div>
      </div>

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Active Users by Role</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Registered Users */}
      {registeredData.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Total Registered</h4>
          <div className="grid grid-cols-2 gap-3">
            {registeredData.map(({ role, count }) => (
              <div key={role} className="bg-gray-50 rounded p-3">
                <div className="text-xs text-gray-600">{role}</div>
                <div className="text-lg font-semibold text-gray-900">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Average Session Duration */}
      {sessionData.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Avg Session Duration</h4>
          <div className="space-y-2">
            {sessionData.map(({ role, duration }) => (
              <div key={role} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{role}</span>
                <span className="text-sm font-medium text-gray-900">{duration} min</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
