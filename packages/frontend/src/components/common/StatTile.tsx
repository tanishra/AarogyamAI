'use client';

import clsx from 'clsx';
import React from 'react';

interface StatTileProps {
  label: string;
  value: string | number;
  trend?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export function StatTile({ label, value, trend, icon, tone = 'default' }: StatTileProps) {
  return (
    <div className="ui-surface ui-surface-hover animate-fade-in relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
      <div className="mb-3.5 flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        {icon ? (
          <span className="rounded-xl border border-sky-100 bg-sky-50 p-2 text-sky-600">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="text-[2rem] font-semibold leading-none tracking-[-0.03em] text-slate-900">{value}</p>
      {trend ? (
        <p
          className={clsx('mt-2 text-[12.5px] leading-snug', {
            'text-slate-500': tone === 'default',
            'text-green-600': tone === 'success',
            'text-amber-600': tone === 'warning',
            'text-red-600': tone === 'danger',
          })}
        >
          {trend}
        </p>
      ) : null}
    </div>
  );
}
