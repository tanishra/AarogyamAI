'use client';

import clsx from 'clsx';
import React from 'react';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'patient' | 'nurse' | 'doctor' | 'dpo';
}

export function AppShell({ children, className, tone = 'default' }: AppShellProps) {
  const toneClass =
    tone === 'patient'
      ? 'bg-gradient-to-br from-sky-100/45 via-white to-cyan-100/45 [&_.ui-surface]:border-cyan-200/70 [&_.ui-surface]:bg-white/78 [&_.ui-surface]:backdrop-blur-md'
      : tone === 'nurse'
        ? 'bg-gradient-to-br from-emerald-100/40 via-white to-cyan-100/40 [&_.ui-surface]:border-emerald-200/70 [&_.ui-surface]:bg-white/78 [&_.ui-surface]:backdrop-blur-md'
        : tone === 'doctor'
          ? 'bg-gradient-to-br from-indigo-100/40 via-white to-violet-100/35 [&_.ui-surface]:border-indigo-200/70 [&_.ui-surface]:bg-white/78 [&_.ui-surface]:backdrop-blur-md'
          : tone === 'dpo'
            ? 'bg-gradient-to-br from-emerald-100/35 via-white to-blue-100/35 [&_.ui-surface]:border-emerald-200/65 [&_.ui-surface]:bg-white/80 [&_.ui-surface]:backdrop-blur-md'
            : '';

  return (
    <div className={clsx('relative min-h-screen overflow-hidden px-4 py-7 sm:px-6 sm:py-8 lg:px-8 lg:py-9', toneClass, className)}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/40 blur-3xl" />
        <div className="absolute right-0 top-8 h-56 w-56 rounded-full bg-cyan-100/30 blur-3xl" />
      </div>
      <div className="mx-auto w-full max-w-7xl animate-fade-up">{children}</div>
    </div>
  );
}
