'use client';

import React from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="ui-surface animate-fade-in p-8 text-center">
      {icon ? <div className="mx-auto mb-4 inline-flex rounded-xl bg-slate-100 p-3 text-slate-500">{icon}</div> : null}
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
