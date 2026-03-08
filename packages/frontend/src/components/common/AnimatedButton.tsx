'use client';

import clsx from 'clsx';
import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function AnimatedButton({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}: AnimatedButtonProps) {
  return (
    <button
      className={clsx(
        'ui-focus-ring inline-flex items-center justify-center rounded-2xl font-semibold tracking-[-0.01em] transition-all duration-300',
        'ease-[cubic-bezier(0.22,1,0.36,1)]',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
        'hover:-translate-y-0.5 hover:shadow-lg',
        {
          'bg-gradient-to-r from-blue-600 via-blue-500 to-teal-500 text-white hover:from-blue-700 hover:via-blue-600 hover:to-teal-600':
            variant === 'primary',
          'border border-slate-200 bg-white/90 text-slate-700 hover:border-blue-200 hover:bg-blue-50':
            variant === 'secondary',
          'bg-transparent text-slate-700 hover:bg-sky-50 hover:text-blue-700': variant === 'ghost',
          'bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-700 hover:to-orange-600':
            variant === 'danger',
          'h-9 px-3.5 text-[13px]': size === 'sm',
          'h-11 px-4.5 text-sm': size === 'md',
          'h-12 px-5.5 text-[15px]': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
