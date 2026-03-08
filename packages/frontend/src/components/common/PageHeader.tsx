'use client';

import clsx from 'clsx';
import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, badge, actions, className }: PageHeaderProps) {
  return (
    <header
      className={clsx(
        'ui-surface mb-7 flex flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div>
        <div className="flex items-center gap-3.5">
          <h1 className="ui-heading text-[clamp(1.45rem,2.2vw,1.95rem)] font-semibold tracking-[-0.03em]">{title}</h1>
          {badge ? (
            <span className="rounded-full border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-blue-700">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="ui-subtle mt-1.5 max-w-3xl text-[0.92rem] leading-relaxed">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
