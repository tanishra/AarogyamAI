'use client';

import { useState } from 'react';

interface ConsentRecord {
  id: number;
  patient_name: string;
  consent_type: string;
  data_categories: string[];
  granted_at: string;
  expires_at: string | null;
  status: 'active' | 'withdrawn' | 'expired';
  withdrawn_at: string | null;
}

interface ConsentRecordListProps {
  records: ConsentRecord[];
}

export default function ConsentRecordList({ records }: ConsentRecordListProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'withdrawn' | 'expired'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredRecords = records.filter(
    (record) => filter === 'all' || record.status === filter
  );

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    withdrawn: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Consent Records</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1 rounded ${filter === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Active
            </button>
            <button
              onClick={() => setFilter('withdrawn')}
              className={`px-3 py-1 rounded ${filter === 'withdrawn' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Withdrawn
            </button>
            <button
              onClick={() => setFilter('expired')}
              className={`px-3 py-1 rounded ${filter === 'expired' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Expired
            </button>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {filteredRecords.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No consent records found
          </div>
        ) : (
          filteredRecords.map((record) => (
            <div key={record.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-base font-medium text-gray-900">
                      {record.patient_name}
                    </h4>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[record.status]}`}>
                      {record.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">
                    Type: {record.consent_type}
                  </p>
                  <p className="text-sm text-gray-600 mb-1">
                    Granted: {new Date(record.granted_at).toLocaleDateString()}
                  </p>
                  {record.expires_at && (
                    <p className="text-sm text-gray-600 mb-1">
                      Expires: {new Date(record.expires_at).toLocaleDateString()}
                    </p>
                  )}
                  {record.withdrawn_at && (
                    <p className="text-sm text-red-600 mb-1">
                      Withdrawn: {new Date(record.withdrawn_at).toLocaleDateString()}
                    </p>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    className="text-sm text-blue-600 hover:text-blue-700 mt-2"
                  >
                    {expandedId === record.id ? 'Hide' : 'Show'} Details
                  </button>
                  {expandedId === record.id && (
                    <div className="mt-3 p-3 bg-gray-50 rounded">
                      <p className="text-sm font-medium text-gray-700 mb-1">Data Categories:</p>
                      <ul className="list-disc list-inside text-sm text-gray-600">
                        {record.data_categories.map((category, idx) => (
                          <li key={idx}>{category}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
