'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import type { User } from './types';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: User['role'][];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { role, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (role && !allowedRoles.includes(role)) {
      router.push('/unauthorized');
    }
  }, [isAuthenticated, role, allowedRoles, router]);

  if (!isAuthenticated || !role || !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
