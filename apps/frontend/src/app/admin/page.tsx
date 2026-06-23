'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchAdminFeatureFlags } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import StickersSection from './components/StickersSection';
import UsersSection from './components/UsersSection';
import TrustSafetySection from './components/TrustSafetySection';

type Tab = 'stickers' | 'users' | 'trust-safety';

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === 'users' ? 'users' : tabParam === 'trust-safety' ? 'trust-safety' : 'stickers'
  );
  const [trustSafetyEnabled, setTrustSafetyEnabled] = useState<boolean | null>(null);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`/admin?tab=${tab}`, { scroll: false });
  };

  useEffect(() => {
    if (!token) return;
    fetchAdminFeatureFlags(token)
      .then(({ flags }) => setTrustSafetyEnabled(flags.FEATURE_TRUST_SAFETY === true))
      .catch(() => setTrustSafetyEnabled(false));
  }, [token]);

  useEffect(() => {
    if (trustSafetyEnabled === false && activeTab === 'trust-safety') {
      switchTab('stickers');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trustSafetyEnabled]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [hydrated, token, user, router]);

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
        Loading…
      </div>
    );
  }

  if (!token || !user) return null;

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--cromo-fg)] mb-6">Admin</h1>

        <div className="flex gap-1 mb-6 border-b border-[var(--cromo-border)]">
          <button
            onClick={() => switchTab('stickers')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'stickers'
                ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
                : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
            }`}
          >
            Stickers
          </button>
          <button
            onClick={() => switchTab('users')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'users'
                ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
                : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
            }`}
          >
            Users
          </button>
          {trustSafetyEnabled && (
            <button
              onClick={() => switchTab('trust-safety')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'trust-safety'
                  ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
                  : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
              }`}
            >
              Trust & Safety
            </button>
          )}
        </div>

        {activeTab === 'stickers' && <StickersSection token={token} />}
        {activeTab === 'users' && <UsersSection token={token} currentUserId={user.id} />}
        {activeTab === 'trust-safety' && trustSafetyEnabled && <TrustSafetySection token={token} />}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageInner />
    </Suspense>
  );
}
