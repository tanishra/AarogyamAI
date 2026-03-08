'use client';

import clsx from 'clsx';
import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  emptyState?: React.ReactNode;
}

export function DataTable<T>({ columns, data, rowKey, emptyState }: DataTableProps<T>) {
  if (!data.length && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="ui-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50/90">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={clsx(
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {data.map((row, index) => (
              <tr key={rowKey(row, index)} className="transition-colors hover:bg-slate-50/80">
                {columns.map((column) => (
                  <td key={column.key} className={clsx('px-4 py-3 text-sm text-slate-700', column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
