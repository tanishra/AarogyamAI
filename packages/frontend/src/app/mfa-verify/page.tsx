'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatedButton, AuthScene } from '@/components/common';

export default function MFAVerificationPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Placeholder until full MFA backend flow is enabled.
      await new Promise((resolve) => setTimeout(resolve, 450));
      setError('MFA verification flow is not fully enabled yet. Contact administrator.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthScene
      title="Multi-Factor Verification"
      subtitle="Enter your 6-digit authenticator code to continue"
      icon={
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 .552-.448 1-1 1s-1-.448-1-1 .448-1 1-1 1 .448 1 1zm0 0v5m8-5A9 9 0 113 12a9 9 0 0118 0z" />
        </svg>
      }
      sideTitle="Layered security for sensitive clinical workflows"
      sideText="MFA is mandatory for privileged access and high-impact administrative actions."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Verification Code</span>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.45em] transition-all hover:border-slate-400"
            placeholder="000000"
            maxLength={6}
            pattern="[0-9]{6}"
          />
        </label>

        <AnimatedButton type="submit" size="lg" className="w-full" disabled={isLoading || code.length !== 6}>
          {isLoading ? 'Verifying...' : 'Verify'}
        </AnimatedButton>

        <AnimatedButton type="button" variant="secondary" size="lg" className="w-full" onClick={() => router.push('/login')}>
          Back to Login
        </AnimatedButton>
      </form>
    </AuthScene>
  );
}
