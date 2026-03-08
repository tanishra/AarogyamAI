'use client';

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ActiveUserMetricsProps {
  data: {
    byRole: { [role: string]: number };
    totalRegistered: { [role: string]: number };
    avgSessionDuration: { [role: string]: number };
  };
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function ActiveUserMetrics({ data }: ActiveUserMetricsProps) {
  const activeData = Object.entries(data.byRole || {}).map(([role, count]) => ({
    name: role,
    value: count,
  }));

  const registeredData = Object.entries(data.totalRegistered || {}).map(([role, count]) => ({
    role,
    registered: count,
    active: data.byRole[role] || 0,
  }));

  const sessionData = Object.entries(data.avgSessionDuration || {}).map(([role, duration]) => ({
    role,
    minutes: Math.round(duration / 60),
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Active Users</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Active Users by Role</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={activeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {activeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Registered vs Active</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={registeredData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="role" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="registered" fill="#94A3B8" name="Registered" />
              <Bar dataKey="active" fill="#3B82F6" name="Active" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Average Session Duration (minutes)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={sessionData} layout="horizontal">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis dataKey="role" type="category" tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="minutes" fill="#10B981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
