'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { AnimatedButton, EmptyState, Skeleton } from '@/components/common';

type ProfileRole = 'Patient' | 'Nurse' | 'Doctor';

interface ProfileWorkspaceProps {
  role: ProfileRole;
}

interface ProfilePayload {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  profile: {
    phone: string;
    dateOfBirth: string | null;
    gender: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    organization: string;
    department: string;
    specialization: string;
    licenseNumber: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    preferredLanguage: string;
    timezone: string;
    bio: string;
    updatedAt: string | null;
  };
}

interface ActivityPayload {
  role: string;
  stats: Record<string, number | string>;
  recent: Array<Record<string, any>>;
}

const fieldClass =
  'ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm transition-all hover:border-cyan-300';

export function ProfileWorkspace({ role }: ProfileWorkspaceProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState<Record<string, string>>({
    name: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    organization: '',
    department: '',
    specialization: '',
    licenseNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    preferredLanguage: '',
    timezone: '',
    bio: '',
  });

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['self-profile'],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch('/api/profile/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load profile');
      const payload = await response.json();
      return payload?.data as ProfilePayload;
    },
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['self-activity', role],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch('/api/profile/me/activity', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load activity');
      const payload = await response.json();
      return payload?.data as ActivityPayload;
    },
  });

  useEffect(() => {
    if (!profileData) return;
    setFormState({
      name: profileData.name || '',
      phone: profileData.profile.phone || '',
      dateOfBirth: profileData.profile.dateOfBirth || '',
      gender: profileData.profile.gender || '',
      addressLine1: profileData.profile.addressLine1 || '',
      addressLine2: profileData.profile.addressLine2 || '',
      city: profileData.profile.city || '',
      state: profileData.profile.state || '',
      country: profileData.profile.country || '',
      postalCode: profileData.profile.postalCode || '',
      organization: profileData.profile.organization || '',
      department: profileData.profile.department || '',
      specialization: profileData.profile.specialization || '',
      licenseNumber: profileData.profile.licenseNumber || '',
      emergencyContactName: profileData.profile.emergencyContactName || '',
      emergencyContactPhone: profileData.profile.emergencyContactPhone || '',
      preferredLanguage: profileData.profile.preferredLanguage || '',
      timezone: profileData.profile.timezone || '',
      bio: profileData.profile.bio || '',
    });
  }, [profileData]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/profile/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formState),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to update profile');
      }

      return response.json();
    },
    onSuccess: async () => {
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['self-profile'] });

      const stored = localStorage.getItem('user');
      if (stored) {
        const current = JSON.parse(stored);
        localStorage.setItem('user', JSON.stringify({ ...current, name: formState.name }));
      }
    },
  });

  const stats = useMemo(() => {
    if (!activityData?.stats) return [];
    return Object.entries(activityData.stats);
  }, [activityData]);

  if (profileLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 w-full lg:col-span-2" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!profileData) {
    return <EmptyState title="Profile unavailable" description="Unable to load your profile right now." />;
  }

  const showClinicalFields = role === 'Nurse' || role === 'Doctor';

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <section className="ui-surface ui-surface-hover p-5 lg:col-span-2">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">My Profile</h2>
            <p className="mt-1 text-sm text-slate-600">Keep your personal and professional details up to date.</p>
          </div>
          {!isEditing ? (
            <AnimatedButton variant="secondary" onClick={() => setIsEditing(true)}>
              Edit Profile
            </AnimatedButton>
          ) : (
            <div className="flex items-center gap-2">
              <AnimatedButton variant="ghost" onClick={() => setIsEditing(false)} disabled={updateMutation.isPending}>
                Cancel
              </AnimatedButton>
              <AnimatedButton onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </AnimatedButton>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ['name', 'Full Name', 'text'],
            ['phone', 'Phone', 'text'],
            ['dateOfBirth', 'Date of Birth', 'date'],
            ['gender', 'Gender', 'text'],
            ['organization', 'Organization', 'text'],
            ['department', 'Department', 'text'],
            ['preferredLanguage', 'Preferred Language', 'text'],
            ['timezone', 'Timezone', 'text'],
          ].map(([key, label, type]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              {isEditing ? (
                <input
                  type={type}
                  value={formState[key] || ''}
                  onChange={(event) => setFormState((prev) => ({ ...prev, [key]: event.target.value }))}
                  className={fieldClass}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  {formState[key] || 'Not provided'}
                </div>
              )}
            </label>
          ))}

          {showClinicalFields ? (
            <>
              {[
                ['specialization', 'Specialization'],
                ['licenseNumber', 'License Number'],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formState[key] || ''}
                      onChange={(event) => setFormState((prev) => ({ ...prev, [key]: event.target.value }))}
                      className={fieldClass}
                    />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      {formState[key] || 'Not provided'}
                    </div>
                  )}
                </label>
              ))}
            </>
          ) : (
            <>
              {[
                ['emergencyContactName', 'Emergency Contact Name'],
                ['emergencyContactPhone', 'Emergency Contact Phone'],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formState[key] || ''}
                      onChange={(event) => setFormState((prev) => ({ ...prev, [key]: event.target.value }))}
                      className={fieldClass}
                    />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      {formState[key] || 'Not provided'}
                    </div>
                  )}
                </label>
              ))}
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</span>
            {isEditing ? (
              <input
                type="text"
                value={formState.addressLine1 || ''}
                onChange={(event) => setFormState((prev) => ({ ...prev, addressLine1: event.target.value }))}
                className={fieldClass}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {formState.addressLine1 || 'Not provided'}
              </div>
            )}
          </label>

          {['city', 'state', 'country', 'postalCode'].map((key) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</span>
              {isEditing ? (
                <input
                  type="text"
                  value={formState[key] || ''}
                  onChange={(event) => setFormState((prev) => ({ ...prev, [key]: event.target.value }))}
                  className={fieldClass}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  {formState[key] || 'Not provided'}
                </div>
              )}
            </label>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Bio</span>
          {isEditing ? (
            <textarea
              rows={4}
              value={formState.bio || ''}
              onChange={(event) => setFormState((prev) => ({ ...prev, bio: event.target.value }))}
              className={fieldClass}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {formState.bio || 'No bio added yet'}
            </div>
          )}
        </label>

        {updateMutation.error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {(updateMutation.error as Error).message}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="ui-surface ui-surface-hover p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account Summary</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>
              Role: <span className="font-semibold text-slate-900">{profileData.role}</span>
            </p>
            <p>
              Email: <span className="font-semibold text-slate-900">{profileData.email}</span>
            </p>
            <p>
              Status: <span className="font-semibold text-slate-900">{profileData.isActive ? 'Active' : 'Inactive'}</span>
            </p>
            <p>
              Joined: <span className="font-semibold text-slate-900">{new Date(profileData.createdAt).toLocaleDateString()}</span>
            </p>
          </div>
        </div>

        <div className="ui-surface ui-surface-hover p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">My Activity</h3>
          {activityLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="mt-3 space-y-2">
                {stats.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span className="capitalize text-slate-600">{label.replace(/([A-Z])/g, ' $1')}:</span>{' '}
                    <span className="font-semibold text-slate-900">{String(value)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Items</p>
                <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {(activityData?.recent || []).length === 0 ? (
                    <p className="text-xs text-slate-500">No recent records.</p>
                  ) : (
                    (activityData?.recent || []).map((item, index) => (
                      <div key={item.id || index} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                        {item.patient_name ? <p className="font-semibold text-slate-900">{item.patient_name}</p> : null}
                        <p>
                          {item.status || 'record'}
                          {item.priority ? ` • ${item.priority}` : ''}
                        </p>
                        <p className="text-slate-500">
                          {item.updated_at
                            ? new Date(item.updated_at).toLocaleString()
                            : item.started_at
                              ? new Date(item.started_at).toLocaleString()
                              : item.startedAt
                                ? new Date(item.startedAt).toLocaleString()
                                : ''}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
