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
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-800">Report @{username}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="px-5 py-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-gray-700 font-medium">Report submitted</p>
            <p className="text-xs text-gray-500">Our moderation team will review your report.</p>
            <button
              onClick={onClose}
              className="mt-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              >
                <option value="">Select a category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">
                Description
                <span className="ml-1 font-normal text-gray-400">({description.length}/2000)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="Describe the issue in detail…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-md bg-red-600 text-white py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
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
