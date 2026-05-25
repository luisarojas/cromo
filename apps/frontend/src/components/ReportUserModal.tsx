'use client';

import { useState } from 'react';
import { submitReport } from '@/lib/api';

const CATEGORIES = [
  { value: 'harassment',           label: 'Harassment' },
  { value: 'cancelled_after_accept', label: 'Cancelled after accepting' },
  { value: 'no_show',              label: 'No-show / did not trade' },
  { value: 'fake_stickers',        label: 'Fake stickers' },
  { value: 'damaged_stickers',     label: 'Damaged stickers' },
  { value: 'spam',                 label: 'Spam' },
  { value: 'underage',             label: 'Underage user' },
  { value: 'other',                label: 'Other' },
];

interface Props {
  userId: string;
  username: string;
  tradeId?: string;
  token: string;
  onClose: () => void;
}

export default function ReportUserModal({ userId, username, tradeId, token, onClose }: Props) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!category) {
      setError('Please select a category.');
      return;
    }
    if (description.length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await submitReport(userId, { category, description, tradeId }, token);
      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit report';
      if (msg.includes('409') || msg.toLowerCase().includes('already have')) {
        setError('You already have an open report for this user with the same category.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--cromo-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--cromo-fg)]">Report @{username}</h2>
          <button
            onClick={onClose}
            className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="px-5 py-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cromo-success-soft)]">
              <svg className="h-6 w-6 text-[var(--cromo-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-[var(--cromo-fg)] font-medium">Report submitted</p>
            <p className="text-xs text-[var(--cromo-fg-muted)]">Our moderation team will review your report.</p>
            <button
              onClick={onClose}
              className="mt-2 rounded-md bg-[var(--cromo-surface-2)] px-4 py-2 text-sm font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--cromo-fg-muted)]">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] bg-[var(--cromo-surface)]"
              >
                <option value="">Select a category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--cromo-fg-muted)]">
                Description
                <span className="ml-1 font-normal text-[var(--cromo-fg-subtle)]">({description.length}/2000)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="Describe the issue in detail…"
                className="w-full rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] resize-none"
              />
            </div>

            {error && (
              <div className="rounded-md bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger)]">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-md bg-[var(--cromo-danger)] text-white py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-md border border-[var(--cromo-border-strong)] px-4 py-2 text-sm text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
