'use client';

import React, { useState } from 'react';
import { RegistrationQueue } from '@/components/admin/RegistrationQueue';
import { UserList } from '@/components/admin/UserList';
import { UserDetail } from '@/components/admin/UserDetail';
import { Navigation } from '@/components/Navigation';
import { SessionManager } from '@/components/SessionManager';
import { AuthGuard } from '@/lib/auth';
import type { UserAccount } from '@/lib/api/types';
import { AppShell, PageHeader, PanelTabs } from '@/components/common';

type AdminTab = 'queue' | 'users';

function UsersPageContent() {
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('queue');

  return (
    <>
      <Navigation />
      <SessionManager />
      <AppShell>
        <div className="mb-6 overflow-hidden rounded-[22px] border border-fuchsia-300/45 bg-gradient-to-r from-fuchsia-700 via-violet-700 to-blue-700 px-6 py-6 text-white shadow-2xl shadow-violet-900/30">
          <p className="ui-chip border-white/30 bg-white/10 text-violet-100">Admin Workspace</p>
          <h1 className="mt-3 text-3xl font-bold">User Management</h1>
          <p className="mt-1 text-sm text-violet-100/90">Handle registration queue, user access, and role governance</p>
        </div>

        <div className="ui-surface mb-5 border-violet-200/70 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-3">
          <PanelTabs
            tabs={[
              { id: 'queue' as AdminTab, label: 'Registration Queue' },
              { id: 'users' as AdminTab, label: 'All Users' },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>

        <div className="ui-surface p-5 animate-fade-up">
          {activeTab === 'queue' && <RegistrationQueue />}
          {activeTab === 'users' && <UserList onSelectUser={setSelectedUser} />}
        </div>

        {selectedUser ? (
          <UserDetail
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            onUpdate={() => {
              // Refresh via query invalidation
            }}
          />
        ) : null}
      </AppShell>
    </>
  );
}

export default function UsersPage() {
  return (
    <AuthGuard>
      <UsersPageContent />
    </AuthGuard>
  );
}
