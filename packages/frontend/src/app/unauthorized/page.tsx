'use client';

import Link from 'next/link';
import { AnimatedButton, AuthScene } from '@/components/common';

export default function UnauthorizedPage() {
  return (
    <AuthScene
      title="Access Denied"
      subtitle="Your account does not have permission to view this route"
      icon={
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.93 19h12.14c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L4.198 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      }
      sideTitle="Role-based boundaries protect sensitive records"
      sideText="If this looks wrong, request the correct role assignment from an administrator."
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Error code: 403. This route is blocked for your current role.
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/dashboard" className="flex-1 min-w-[180px]">
          <AnimatedButton size="lg" className="w-full">Go to Dashboard</AnimatedButton>
        </Link>
        <Link href="/login" className="flex-1 min-w-[180px]">
          <AnimatedButton size="lg" variant="secondary" className="w-full">Switch Account</AnimatedButton>
        </Link>
      </div>
    </AuthScene>
  );
}
