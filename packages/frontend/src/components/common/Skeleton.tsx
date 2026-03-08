'use client';

import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={clsx('animate-soft-pulse rounded-md bg-slate-200/80', className)} />;
}

interface SkeletonBlockProps {
  rows?: number;
}

export function SkeletonBlock({ rows = 4 }: SkeletonBlockProps) {
  return (
    <div className="ui-surface p-4">
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <Skeleton key={idx} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
