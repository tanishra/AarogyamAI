'use client';

import { useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ConsultationMetricsProps {
  data: {
    total: number;
    daily: Array<{ date: string; value: number }>;
    weekly: Array<{ date: string; value: number }>;
    monthly: Array<{ date: string; value: number }>;
    byDoctor: { [key: string]: number };
  };
}

export default function ConsultationMetrics({ data }: ConsultationMetricsProps) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const chartData = data[period] || [];
  const doctorData = Object.entries(data.byDoctor || {}).map(([name, count]) => ({
    name: name.replace('doctor-', 'Dr. '),
    consultations: count,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Consultation Metrics</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod('daily')}
            className={`px-3 py-1 rounded ${period === 'daily' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Daily
          </button>
          <button
            onClick={() => setPeriod('weekly')}
            className={`px-3 py-1 rounded ${period === 'weekly' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Weekly
          </button>
          <button
            onClick={() => setPeriod('monthly')}
            className={`px-3 py-1 rounded ${period === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-3xl font-bold text-gray-900">{data.total}</p>
        <p className="text-sm text-gray-600">Total Consultations</p>
      </div>

      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Trend Over Time</h4>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#3B82F6" name="Consultations" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">By Doctor</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={doctorData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="consultations" fill="#3B82F6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
