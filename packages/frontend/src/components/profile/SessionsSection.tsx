'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSessions, revokeOtherSessions, revokeSession } from '@/lib/api/services/sessions';

/**
 * Active-sessions management — list own sessions, revoke any of them.
 * Backend enforces ownership server-side; UI is convenience only.
 */
export function SessionsSection() {
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: getSessions,
  });

  const revoke = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const revokeOthers = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const otherCount = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <div className="ui-surface ui-surface-hover p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Active Sessions</h3>
        {otherCount > 0 && (
          <button
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Sign out other devices ({otherCount})
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Devices currently signed in. Revoke anything you don&apos;t recognize.
      </p>
      <div className="mt-3 space-y-2">
        {isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : !sessions?.length ? (
          <p className="text-xs text-slate-500">No active sessions.</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.sessionId}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">
                  {s.userAgent || 'Unknown device'}
                  {s.current && (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-slate-500">
                  {s.ipAddress} · since {new Date(s.createdAt).toLocaleString()}
                </p>
              </div>
              {!s.current && (
                <button
                  onClick={() => revoke.mutate(s.sessionId)}
                  disabled={revoke.isPending}
                  className="ml-3 shrink-0 rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
