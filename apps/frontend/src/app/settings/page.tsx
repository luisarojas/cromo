'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { patchUserPreferences } from '@/lib/api';
import {
  updateDisplayNameApi,
  updateUsernameApi,
  updateEmailApi,
  updatePasswordApi,
  deleteAccountApi,
  logoutApi,
} from '@/lib/api';

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function StatusMessage({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div
      className={`rounded-md px-3 py-2 text-sm ${
        type === 'success'
          ? 'bg-green-50 border border-green-200 text-green-700'
          : 'bg-red-50 border border-red-200 text-red-700'
      }`}
    >
      {message}
    </div>
  );
}

function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors self-start"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

// ─── Change Display Name ──────────────────────────────────────────────────────

function ChangeDisplayNameSection() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setStatus(null);
    try {
      const { displayName: updated } = await updateDisplayNameApi(displayName.trim() || null, token);
      updateUser({ displayName: updated });
      setDisplayName(updated ?? '');
      setStatus({ type: 'success', message: 'Display name updated.' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update display name.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Display Name" description="Shown in the navbar in place of your username. Leave blank to show your username instead.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="displayName">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder={`e.g. ${user?.username ?? 'Your Name'}`}
            autoComplete="name"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs"
          />
          <p className="text-xs text-gray-400">Up to 100 characters. Leave blank to clear.</p>
        </div>
        {status && <StatusMessage type={status.type} message={status.message} />}
        <SubmitButton loading={loading} label="Save display name" loadingLabel="Saving…" />
      </form>
    </SectionCard>
  );
}

// ─── Change Username ──────────────────────────────────────────────────────────

function ChangeUsernameSection() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [username, setUsername] = useState(user?.username ?? '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setStatus(null);
    try {
      const { username: updated } = await updateUsernameApi(username, token);
      updateUser({ username: updated });
      setUsername(updated);
      setStatus({ type: 'success', message: 'Username updated successfully.' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update username.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Username">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="username">
            New username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={30}
            pattern="^[a-zA-Z0-9_-]+$"
            title="Letters, numbers, underscores, hyphens only"
            autoComplete="username"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs"
          />
          <p className="text-xs text-gray-400">3–30 characters. Letters, numbers, underscores, hyphens.</p>
        </div>
        {status && <StatusMessage type={status.type} message={status.message} />}
        <SubmitButton loading={loading} label="Save username" loadingLabel="Saving…" />
      </form>
    </SectionCard>
  );
}

// ─── Change Email ─────────────────────────────────────────────────────────────

function ChangeEmailSection() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [email, setEmail] = useState(user?.email ?? '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setStatus(null);
    try {
      const { email: updated } = await updateEmailApi(email, token);
      updateUser({ email: updated, emailVerifiedAt: null });
      setEmail(updated);
      setStatus({
        type: 'success',
        message: 'Email updated. A verification link has been sent to your new address.',
      });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update email.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Email Address">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="email">
            New email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs"
          />
          <p className="text-xs text-gray-400">
            You will need to verify your new email address before it is active.
          </p>
        </div>
        {status && <StatusMessage type={status.type} message={status.message} />}
        <SubmitButton loading={loading} label="Save email" loadingLabel="Saving…" />
      </form>
    </SectionCard>
  );
}

// ─── Change Password ──────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const token = useAuthStore((s) => s.token);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      await updatePasswordApi(currentPassword, newPassword, token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatus({ type: 'success', message: 'Password updated successfully.' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update password.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Password">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs"
            placeholder="••••••••"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs"
            placeholder="••••••••"
          />
          <p className="text-xs text-gray-400">Minimum 8 characters.</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="confirmPassword">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs"
            placeholder="••••••••"
          />
        </div>
        {status && <StatusMessage type={status.type} message={status.message} />}
        <SubmitButton loading={loading} label="Update password" loadingLabel="Updating…" />
      </form>
    </SectionCard>
  );
}

// ─── Delete Account ───────────────────────────────────────────────────────────

function DeleteAccountSection() {
  const token = useAuthStore((s) => s.token);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const resetPreferences = usePreferencesStore((s) => s.reset);
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await deleteAccountApi(token);
      await logoutApi();
      clearAuth();
      resetPreferences();
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account.');
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
      <h2 className="text-base font-semibold text-red-700 mb-1">Delete Account</h2>
      <p className="text-sm text-gray-500 mb-4">
        Permanently deactivates your account. This action cannot be undone.
      </p>

      {error && (
        <div className="mb-4">
          <StatusMessage type="error" message={error} />
        </div>
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          Delete my account
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-800">
            Are you sure? This will permanently deactivate your account.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Deleting…' : 'Yes, delete my account'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Album tab ────────────────────────────────────────────────────────────────

function AlbumSettingsTab() {
  const token = useAuthStore((s) => s.token);
  const duplicatesCountAllVariants = usePreferencesStore((s) => s.duplicatesCountAllVariants);
  const setDuplicatesCountAllVariants = usePreferencesStore((s) => s.setDuplicatesCountAllVariants);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleDuplicatesChange(value: boolean) {
    if (!token) return;
    setSaveError(null);
    setDuplicatesCountAllVariants(value);
    try {
      await patchUserPreferences({ duplicatesCountAllVariants: value }, token);
    } catch {
      setSaveError('Failed to save preference. Please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {saveError && <StatusMessage type="error" message={saveError} />}

      <SectionCard
        title="Duplicates"
        description="Control how duplicate stickers are counted in your collection."
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={duplicatesCountAllVariants}
            onChange={(e) => handleDuplicatesChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-gray-800">
              Count all copies as duplicates, regardless of variant
            </span>
            <span className="text-xs text-gray-500">
              When enabled, owning the same sticker in different variants (e.g. base + foil)
              counts as a duplicate. When disabled, only multiple copies of the same variant
              are considered duplicates.
            </span>
          </div>
        </label>
      </SectionCard>
    </div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────

function AccountSettingsTab() {
  return (
    <div className="flex flex-col gap-6">
      <ChangeDisplayNameSection />
      <ChangeUsernameSection />
      <ChangeEmailSection />
      <ChangePasswordSection />
      <DeleteAccountSection />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SettingsTab = 'account' | 'album';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'album', label: 'Album Defaults' },
];

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  if (hydrated && !user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'account' && <AccountSettingsTab />}
        {activeTab === 'album' && <AlbumSettingsTab />}
      </div>
    </div>
  );
}
