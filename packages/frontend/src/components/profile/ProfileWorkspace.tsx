'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AnimatedButton, EmptyState, Skeleton } from '@/components/common';
import { SessionsSection } from './SessionsSection';

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

interface ActivityItem {
  id?: string | number;
  patient_name?: string;
  status?: string;
  priority?: string;
  updated_at?: string;
  started_at?: string;
  startedAt?: string;
}

interface ActivityPayload {
  role: string;
  stats: Record<string, number | string>;
  recent: ActivityItem[];
}

const fieldClass =
  'ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm transition-all hover:border-cyan-300';

const EMPTY_FORM_STATE: Record<string, string> = {
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
};

function formStateFromProfile(data: ProfilePayload): Record<string, string> {
  const state: Record<string, string> = { ...EMPTY_FORM_STATE, name: data.name || '' };
  for (const key of Object.keys(EMPTY_FORM_STATE)) {
    if (key === 'name') continue;
    const value = data.profile[key as keyof ProfilePayload['profile']];
    state[key] = value == null ? '' : String(value);
  }
  return state;
}

export function ProfileWorkspace({ role }: ProfileWorkspaceProps) {
  const { token } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState<Record<string, string>>(EMPTY_FORM_STATE);

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

  // Displayed (non-editing) values come straight from the fetched profile so
  // they stay fresh after invalidations; formState is populated when the user
  // enters edit mode.
  const profileValue = (key: string): string => {
    if (!profileData) return '';
    if (key === 'name') return profileData.name || '';
    const value = profileData.profile[key as keyof ProfilePayload['profile']];
    return value == null ? '' : String(value);
  };

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
        throw new Error(err?.message || t('profile.updateFailed'));
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

  const statLabel = (key: string): string => {
    const i18nKey = `profile.stats.${key}`;
    const translated = t(i18nKey);
    return translated === i18nKey ? key.replace(/([A-Z])/g, ' $1') : translated;
  };

  if (profileLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 w-full lg:col-span-2" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!profileData) {
    return <EmptyState title={t('profile.unavailable')} description={t('profile.unavailableDesc')} />;
  }

  const showClinicalFields = role === 'Nurse' || role === 'Doctor';

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <section className="ui-surface ui-surface-hover p-5 lg:col-span-2">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{t('profile.title')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('profile.subtitle')}</p>
          </div>
          {!isEditing ? (
            <AnimatedButton
              variant="secondary"
              onClick={() => {
                setFormState(formStateFromProfile(profileData));
                setIsEditing(true);
              }}
            >
              {t('profile.edit')}
            </AnimatedButton>
          ) : (
            <div className="flex items-center gap-2">
              <AnimatedButton variant="ghost" onClick={() => setIsEditing(false)} disabled={updateMutation.isPending}>
                {t('common.cancel')}
              </AnimatedButton>
              <AnimatedButton onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t('common.saving') : t('profile.saveChanges')}
              </AnimatedButton>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ['name', t('profile.fullName'), 'text'],
            ['phone', t('profile.phone'), 'text'],
            ['dateOfBirth', t('profile.dob'), 'date'],
            ['gender', t('profile.gender'), 'text'],
            ['organization', t('profile.organization'), 'text'],
            ['department', t('profile.department'), 'text'],
            ['preferredLanguage', t('profile.preferredLanguage'), 'text'],
            ['timezone', t('profile.timezone'), 'text'],
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
                  {profileValue(key) || t('profile.notProvided')}
                </div>
              )}
            </label>
          ))}

          {showClinicalFields ? (
            <>
              {[
                ['specialization', t('profile.specialization')],
                ['licenseNumber', t('profile.licenseNumber')],
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
                      {profileValue(key) || t('profile.notProvided')}
                    </div>
                  )}
                </label>
              ))}
            </>
          ) : (
            <>
              {[
                ['emergencyContactName', t('profile.emergencyName')],
                ['emergencyContactPhone', t('profile.emergencyPhone')],
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
                      {profileValue(key) || 'Not provided'}
                    </div>
                  )}
                </label>
              ))}
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('profile.address')}</span>
            {isEditing ? (
              <input
                type="text"
                value={formState.addressLine1 || ''}
                onChange={(event) => setFormState((prev) => ({ ...prev, addressLine1: event.target.value }))}
                className={fieldClass}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {profileValue('addressLine1') || t('profile.notProvided')}
              </div>
            )}
          </label>

          {([
            ['city', t('profile.city')],
            ['state', t('profile.state')],
            ['country', t('profile.country')],
            ['postalCode', t('profile.postalCode')],
          ] as const).map(([key, label]) => (
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
                  {profileValue(key) || t('profile.notProvided')}
                </div>
              )}
            </label>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('profile.bio')}</span>
          {isEditing ? (
            <textarea
              rows={4}
              value={formState.bio || ''}
              onChange={(event) => setFormState((prev) => ({ ...prev, bio: event.target.value }))}
              className={fieldClass}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {profileValue('bio') || t('profile.noBio')}
            </div>
          )}
        </label>

        {updateMutation.error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {(updateMutation.error as Error).message}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="ui-surface ui-surface-hover p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('profile.accountSummary')}</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>
              {t('common.role')}: <span className="font-semibold text-slate-900">{profileData.role}</span>
            </p>
            <p>
              {t('common.email')}: <span className="font-semibold text-slate-900">{profileData.email}</span>
            </p>
            <p>
              {t('common.status')}: <span className="font-semibold text-slate-900">{profileData.isActive ? t('common.active') : t('common.inactive')}</span>
            </p>
            <p>
              {t('profile.joined')}: <span className="font-semibold text-slate-900">{new Date(profileData.createdAt).toLocaleDateString()}</span>
            </p>
          </div>
        </div>

        <SessionsSection />

        <div className="ui-surface ui-surface-hover p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('profile.myActivity')}</h3>
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
                    <span className="capitalize text-slate-600">{statLabel(label)}:</span>{' '}
                    <span className="font-semibold text-slate-900">{String(value)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('profile.recentItems')}</p>
                <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {(activityData?.recent || []).length === 0 ? (
                    <p className="text-xs text-slate-500">{t('profile.noRecent')}</p>
                  ) : (
                    (activityData?.recent || []).map((item, index) => (
                      <div key={item.id || index} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                        {item.patient_name ? <p className="font-semibold text-slate-900">{item.patient_name}</p> : null}
                        <p>
                          {item.status || t('profile.record')}
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
