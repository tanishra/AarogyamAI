import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'small' | 'medium' | 'large';
  className?: string;
  label?: string;
}

export function LoadingSpinner({ size = 'md', className = '', label }: LoadingSpinnerProps) {
  const normalizedSize =
    size === 'small' ? 'sm' : size === 'medium' ? 'md' : size === 'large' ? 'lg' : size;

  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`${sizeClasses[normalizedSize]} border-blue-600 border-t-transparent rounded-full animate-spin`}
        role="status"
        aria-label={label || 'Loading'}
      />
      {label && <span className="mt-2 text-sm text-gray-600">{label}</span>}
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message = 'Loading...' }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 shadow-xl">
        <LoadingSpinner size="lg" label={message} />
      </div>
    </div>
  );
}

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
}

export function LoadingButton({ loading, children, disabled, className = '', ...props }: LoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`relative ${className} ${loading || disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      {loading && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <LoadingSpinner size="sm" />
        </span>
      )}
      <span className={loading ? 'invisible' : ''}>{children}</span>
    </button>
  );
}
