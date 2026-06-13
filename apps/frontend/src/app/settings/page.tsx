'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import CityAutocomplete from '@/components/CityAutocomplete';
import type { City, UserPreferences } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';
import { PageHeader } from '@/components/ui';

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--cromo-surface)] rounded-xl border border-[var(--cromo-border)] p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[var(--cromo-fg)]">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-[var(--cromo-fg-muted)]">{description}</p>}
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
          ? 'bg-[var(--cromo-success-soft)] border border-[var(--cromo-success)]/30 text-[var(--cromo-success-text)]'
          : 'bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 text-[var(--cromo-danger-text)]'
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
      className="rounded-md bg-[var(--cromo-accent)] px-4 py-2 text-sm font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50 transition-colors self-start"
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
          <label className="text-sm font-medium text-[var(--cromo-fg)]" htmlFor="displayName">
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
            className="rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] max-w-xs"
          />
          <p className="text-xs text-[var(--cromo-fg-subtle)]">Up to 100 characters. Leave blank to clear.</p>
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
          <label className="text-sm font-medium text-[var(--cromo-fg)]" htmlFor="username">
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
            className="rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] max-w-xs"
          />
          <p className="text-xs text-[var(--cromo-fg-subtle)]">3–30 characters. Letters, numbers, underscores, hyphens.</p>
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
          <label className="text-sm font-medium text-[var(--cromo-fg)]" htmlFor="email">
            New email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] max-w-xs"
          />
          <p className="text-xs text-[var(--cromo-fg-subtle)]">
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
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function validateNewPassword(value: string) {
    if (value.length > 0 && value.length < 8) {
      setNewPasswordError('Password must be at least 8 characters.');
    } else {
      setNewPasswordError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (newPassword.length < 8) {
      setNewPasswordError('Password must be at least 8 characters.');
      return;
    }
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
          <label className="text-sm font-medium text-[var(--cromo-fg)]" htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] max-w-xs"
            placeholder="••••••••"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--cromo-fg)]" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setNewPasswordError(null); }}
            onBlur={(e) => validateNewPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className="rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] max-w-xs"
            placeholder="••••••••"
          />
          {newPasswordError ? (
            <p className="text-xs text-[var(--cromo-danger-text)]">{newPasswordError}</p>
          ) : (
            <p className="text-xs text-[var(--cromo-fg-subtle)]">Minimum 8 characters.</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--cromo-fg)]" htmlFor="confirmPassword">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] max-w-xs"
            placeholder="••••••••"
          />
        </div>
        {status && <StatusMessage type={status.type} message={status.message} />}
        <SubmitButton loading={loading} label="Update password" loadingLabel="Updating…" />
      </form>
    </SectionCard>
  );
}

// ─── Location ────────────────────────────────────────────────────────────────

function LocationSection() {
  const token = useAuthStore((s) => s.token);
  const cities = usePreferencesStore((s) => s.cities);
  const setCities = usePreferencesStore((s) => s.setCities);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleCitiesChange(next: City[]) {
    if (!token) return;
    setCities(next);
    setSaving(true);
    setStatus(null);
    try {
      await patchUserPreferences({ cities: next }, token);
      setStatus({ type: 'success', message: 'Locations saved.' });
    } catch {
      setStatus({ type: 'error', message: 'Failed to save locations. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Your Locations"
      description="Add cities where you're based or frequently visit. Trade matches are ranked by overlap and proximity to your nearest city."
    >
      <div className="flex flex-col gap-3">
        <CityAutocomplete cities={cities} onChange={handleCitiesChange} />
        {saving && <p className="text-xs text-[var(--cromo-fg-subtle)]">Saving…</p>}
        {status && <StatusMessage type={status.type} message={status.message} />}
        <p className="text-xs text-[var(--cromo-fg-subtle)]">Up to 5 cities. Search and select from the dropdown.</p>
      </div>
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
    <div className="bg-[var(--cromo-surface)] rounded-xl border border-[var(--cromo-danger)]/30 p-6">
      <h2 className="text-base font-semibold text-[var(--cromo-danger-text)] mb-1">Delete Account</h2>
      <p className="text-sm text-[var(--cromo-fg-muted)] mb-4">
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
          className="rounded-md border border-[var(--cromo-danger)]/40 px-4 py-2 text-sm font-medium text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-danger-soft)] transition-colors"
        >
          Delete my account
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-[var(--cromo-fg)]">
            Are you sure? This will permanently deactivate your account.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="rounded-md bg-[var(--cromo-danger)] px-4 py-2 text-sm font-medium text-[var(--cromo-danger-fg)] hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Deleting…' : 'Yes, delete my account'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="rounded-md border border-[var(--cromo-border-strong)] px-4 py-2 text-sm font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Privacy & Trading tab ────────────────────────────────────────────────────

function PrivacySettingsTab() {
  const token = useAuthStore((s) => s.token);
  const profileVisibility = usePreferencesStore((s) => s.profileVisibility);
  const setProfileVisibility = usePreferencesStore((s) => s.setProfileVisibility);
  const tradeMatchingEnabled = usePreferencesStore((s) => s.tradeMatchingEnabled);
  const setTradeMatchingEnabled = usePreferencesStore((s) => s.setTradeMatchingEnabled);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handlePrivateChange(isPrivate: boolean) {
    if (!token) return;
    setSaveError(null);
    const previous = profileVisibility;
    const next = isPrivate ? 'private' : 'public';
    setProfileVisibility(next);
    try {
      await patchUserPreferences({ profileVisibility: next }, token);
    } catch {
      setProfileVisibility(previous);
      setSaveError('Failed to save preference. Please try again.');
    }
  }

  async function handleTradingOptOut(optedOut: boolean) {
    if (!token) return;
    setSaveError(null);
    const previous = tradeMatchingEnabled;
    const next = !optedOut;
    setTradeMatchingEnabled(next);
    try {
      await patchUserPreferences({ tradeMatchingEnabled: next }, token);
    } catch {
      setTradeMatchingEnabled(previous);
      setSaveError('Failed to save preference. Please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {saveError && <StatusMessage type="error" message={saveError} />}

      <SectionCard
        title="Profile visibility"
        description="Control whether other collectors can view your public profile."
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={profileVisibility === 'private'}
            onChange={(e) => handlePrivateChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--cromo-fg)]">Make my profile private</span>
            <span className="text-xs text-[var(--cromo-fg-muted)]">
              When enabled, your profile page can&apos;t be viewed by anyone — visitors see a
              &ldquo;profile not found&rdquo; message. Your collection and account remain fully
              accessible to you.
            </span>
          </div>
        </label>
      </SectionCard>

      <SectionCard
        title="Trading"
        description="Opt out of the trading feature entirely."
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!tradeMatchingEnabled}
            onChange={(e) => handleTradingOptOut(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--cromo-fg)]">Disable trading</span>
            <span className="text-xs text-[var(--cromo-fg-muted)]">
              When enabled, you won&apos;t appear as a trade match to anyone, can&apos;t receive new
              trade requests, and the Trade section is hidden from your menu. Existing trades are not
              affected.
            </span>
          </div>
        </label>
      </SectionCard>
    </div>
  );
}

// ─── Email tab ────────────────────────────────────────────────────────────────

function EmailSettingsTab() {
  const token = useAuthStore((s) => s.token);
  const emailTradeRequests = usePreferencesStore((s) => s.emailTradeRequests);
  const setEmailTradeRequests = usePreferencesStore((s) => s.setEmailTradeRequests);
  const emailTradeMessages = usePreferencesStore((s) => s.emailTradeMessages);
  const setEmailTradeMessages = usePreferencesStore((s) => s.setEmailTradeMessages);
  const emailMarketing = usePreferencesStore((s) => s.emailMarketing);
  const setEmailMarketing = usePreferencesStore((s) => s.setEmailMarketing);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function patch<K extends 'emailTradeRequests' | 'emailTradeMessages' | 'emailMarketing'>(
    key: K,
    setter: (v: boolean) => void,
    previous: boolean,
    next: boolean,
  ) {
    if (!token) return;
    setSaveError(null);
    setter(next);
    try {
      await patchUserPreferences({ [key]: next } as Partial<UserPreferences>, token);
    } catch {
      setter(previous);
      setSaveError('Failed to save preference. Please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {saveError && <StatusMessage type="error" message={saveError} />}

      <SectionCard
        title="Account security"
        description="Verification and password-reset emails are always sent — they're required for account security and cannot be disabled."
      >
        <p className="text-xs text-[var(--cromo-fg-muted)]">
          You will continue to receive these regardless of the settings below.
        </p>
      </SectionCard>

      <SectionCard
        title="Trade activity"
        description="Optional notifications related to your trade activity."
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={emailTradeRequests}
            onChange={(e) => patch('emailTradeRequests', setEmailTradeRequests, emailTradeRequests, e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--cromo-fg)]">Trade requests</span>
            <span className="text-xs text-[var(--cromo-fg-muted)]">
              Notify me by email when another collector opens or updates a trade with me.
            </span>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer mt-4">
          <input
            type="checkbox"
            checked={emailTradeMessages}
            onChange={(e) => patch('emailTradeMessages', setEmailTradeMessages, emailTradeMessages, e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--cromo-fg)]">Trade reminders</span>
            <span className="text-xs text-[var(--cromo-fg-muted)]">
              Periodic reminders to rate a recently completed trade. Disabling this also turns off
              the one-click unsubscribe link footer in those emails.
            </span>
          </div>
        </label>
      </SectionCard>

      <SectionCard
        title="Marketing"
        description="Occasional product announcements (off by default — turn on if you want them)."
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={emailMarketing}
            onChange={(e) => patch('emailMarketing', setEmailMarketing, emailMarketing, e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--cromo-fg)]">Product announcements</span>
            <span className="text-xs text-[var(--cromo-fg-muted)]">
              Email me when significant new features ship. Currently off; Cromo doesn&apos;t
              send marketing email unless you explicitly opt in.
            </span>
          </div>
        </label>
      </SectionCard>
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
            className="mt-0.5 h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--cromo-fg)]">
              Count all copies as duplicates, regardless of variant
            </span>
            <span className="text-xs text-[var(--cromo-fg-muted)]">
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

// ─── Appearance tab ───────────────────────────────────────────────────────────

function AppearanceSettingsTab() {
  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="Theme"
        description="Switch between dark and light mode. Saved per browser."
      >
        <ThemeToggle />
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
      <LocationSection />
      <DeleteAccountSection />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SettingsTab = 'account' | 'privacy' | 'email' | 'album' | 'appearance';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  if (hydrated && !user) {
    router.push('/login');
    return null;
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'account', label: t('tabs.account') },
    { id: 'privacy', label: t('tabs.privacy') },
    { id: 'email', label: 'Email' },
    { id: 'album', label: t('tabs.album') },
    { id: 'appearance', label: t('tabs.appearance') },
  ];

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />

        <div className="flex gap-1 border-b border-[var(--cromo-border)]">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
                  : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:border-[var(--cromo-border-strong)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'account' && <AccountSettingsTab />}
        {activeTab === 'privacy' && <PrivacySettingsTab />}
        {activeTab === 'email' && <EmailSettingsTab />}
        {activeTab === 'album' && <AlbumSettingsTab />}
        {activeTab === 'appearance' && <AppearanceSettingsTab />}
      </div>
    </div>
  );
}
