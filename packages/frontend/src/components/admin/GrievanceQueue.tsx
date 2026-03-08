'use client';

import { useState } from 'react';

interface Grievance {
  id: number;
  patient_name: string;
  submission_date: string;
  status: 'pending' | 'investigating' | 'resolved' | 'escalated';
  description: string;
  affected_data: string;
  resolution_timeline: string;
  dpo_notes: string | null;
  resolved_at: string | null;
}

interface GrievanceQueueProps {
  grievances: Grievance[];
  onUpdateStatus: (id: number, status: string, notes: string) => Promise<void>;
}

export default function GrievanceQueue({ grievances, onUpdateStatus }: GrievanceQueueProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'investigating' | 'resolved' | 'escalated'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredGrievances = grievances.filter(
    (g) => filter === 'all' || g.status === filter
  );

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    investigating: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
    escalated: 'bg-red-100 text-red-800',
  };

  const handleUpdate = async (id: number) => {
    if (!newStatus) return;
    setLoading(true);
    try {
      await onUpdateStatus(id, newStatus, notes);
      setEditingId(null);
      setNewStatus('');
      setNotes('');
    } catch (error) {
      console.error('Failed to update grievance:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Grievances</h3>
          <div className="flex gap-2">
            {(['all', 'pending', 'investigating', 'resolved', 'escalated'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1 rounded capitalize ${filter === status ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {filteredGrievances.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No grievances found
          </div>
        ) : (
          filteredGrievances.map((grievance) => (
            <div key={grievance.id} className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-base font-medium text-gray-900">
                      {grievance.patient_name}
                    </h4>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[grievance.status]}`}>
                      {grievance.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">
                    Submitted: {new Date(grievance.submission_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600 mb-2">
                    Timeline: {grievance.resolution_timeline}
                  </p>
                </div>
                <button
                  onClick={() => setExpandedId(expandedId === grievance.id ? null : grievance.id)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {expandedId === grievance.id ? 'Hide' : 'Show'} Details
                </button>
              </div>

              {expandedId === grievance.id && (
                <div className="mt-3 space-y-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium text-gray-700 mb-1">Description:</p>
                    <p className="text-sm text-gray-600">{grievance.description}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium text-gray-700 mb-1">Affected Data:</p>
                    <p className="text-sm text-gray-600">{grievance.affected_data}</p>
                  </div>
                  {grievance.dpo_notes && (
                    <div className="p-3 bg-blue-50 rounded">
                      <p className="text-sm font-medium text-gray-700 mb-1">DPO Notes:</p>
                      <p className="text-sm text-gray-600">{grievance.dpo_notes}</p>
                    </div>
                  )}
                  {grievance.resolved_at && (
                    <p className="text-sm text-green-600">
                      Resolved: {new Date(grievance.resolved_at).toLocaleDateString()}
                    </p>
                  )}

                  {editingId === grievance.id ? (
                    <div className="p-3 bg-gray-50 rounded space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Update Status
                        </label>
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                          <option value="">Select status</option>
                          <option value="investigating">Investigating</option>
                          <option value="resolved">Resolved</option>
                          <option value="escalated">Escalated</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          DPO Notes
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Add notes..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdate(grievance.id)}
                          disabled={loading || !newStatus}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {loading ? 'Updating...' : 'Update'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setNewStatus('');
                            setNotes('');
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(grievance.id);
                        setNewStatus(grievance.status);
                        setNotes(grievance.dpo_notes || '');
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Update Status
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
