'use client';

import clsx from 'clsx';

export interface PanelTab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface PanelTabsProps<T extends string> {
  tabs: PanelTab<T>[];
  value: T;
  onChange: (tab: T) => void;
}

export function PanelTabs<T extends string>({ tabs, value, onChange }: PanelTabsProps<T>) {
  return (
    <div className="ui-surface mb-6 p-2.5">
      <div className="flex flex-wrap gap-2.5">
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={clsx(
                'ui-focus-ring inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-300',
                active
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/20'
                  : 'bg-white/85 text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' ? (
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-xs',
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
