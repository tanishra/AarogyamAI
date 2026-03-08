'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AIAcceptanceChartProps {
  data: {
    overallRate: number;
    daily: Array<{ date: string; value: number }>;
    weekly: Array<{ date: string; value: number }>;
    monthly: Array<{ date: string; value: number }>;
    byDoctor: { [key: string]: number };
    warningThreshold: boolean;
  };
}

export default function AIAcceptanceChart({ data }: AIAcceptanceChartProps) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const chartData = data[period] || [];

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${data.warningThreshold ? 'border-2 border-yellow-500' : ''}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">AI Acceptance Rate</h3>
          {data.warningThreshold && (
            <p className="text-sm text-yellow-600 mt-1">⚠️ Below 40% threshold</p>
          )}
        </div>
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
        <p className="text-3xl font-bold text-gray-900">{data.overallRate.toFixed(1)}%</p>
        <p className="text-sm text-gray-600">Overall Acceptance Rate</p>
      </div>

      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Trend Over Time</h4>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#10B981" name="Acceptance Rate (%)" />
            <Line type="monotone" dataKey={() => 40} stroke="#EF4444" strokeDasharray="5 5" name="Threshold (40%)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">By Doctor</h4>
        <div className="space-y-2">
          {Object.entries(data.byDoctor || {}).map(([doctor, rate]) => (
            <div key={doctor} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{doctor.replace('doctor-', 'Dr. ')}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${rate < 40 ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900 w-12 text-right">{rate.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
