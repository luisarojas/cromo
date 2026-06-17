'use client';

import { useEffect, useRef, useState } from 'react';
import { submitReport, fetchTradeMessages, type TradeMessage } from '@/lib/api';
import { BottomSheet } from '@/components/BottomSheet';

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

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  userId: string;
  username: string;
  tradeId?: string;
  token: string;
  onClose: () => void;
}

interface AttachmentDraft {
  id: string;
  file: File;
  previewUrl: string;
}

export default function ReportUserModal({ userId, username, tradeId, token, onClose }: Props) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tradeId) return;
    let cancelled = false;
    setMessagesLoading(true);
    fetchTradeMessages(tradeId, { limit: 200 }, token)
      .then((res) => { if (!cancelled) setMessages(res.items); })
      .catch(() => { /* picker just stays empty; not fatal */ })
      .finally(() => { if (!cancelled) setMessagesLoading(false); });
    return () => { cancelled = true; };
  }, [tradeId, token]);

  // Object URLs for image previews — revoke on unmount or when the draft is removed.
  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
    };
  }, [attachments]);

  function toggleMessage(id: string) {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const incoming = Array.from(list);
    const accepted: AttachmentDraft[] = [];
    for (const file of incoming) {
      if (attachments.length + accepted.length >= MAX_ATTACHMENTS) {
        setError(`Up to ${MAX_ATTACHMENTS} attachments allowed.`);
        break;
      }
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setError('Only JPEG, PNG, and WebP images are accepted.');
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`Each attachment must be ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB or smaller.`);
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

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
      await submitReport(
        userId,
        {
          category,
          description,
          tradeId,
          messageIds: selectedMessageIds.size > 0 ? Array.from(selectedMessageIds) : undefined,
          attachments: attachments.map((a) => a.file),
        },
        token,
      );
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
    <BottomSheet open onClose={onClose} ariaLabel={`Report @${username}`}>
      <div>
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
              <svg className="h-6 w-6 text-[var(--cromo-success-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

            {tradeId && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--cromo-fg-muted)]">
                  Cite chat messages
                  <span className="ml-1 font-normal text-[var(--cromo-fg-subtle)]">
                    ({selectedMessageIds.size} selected)
                  </span>
                </label>
                {messagesLoading ? (
                  <div className="rounded-md border border-[var(--cromo-border-strong)] p-3 text-xs text-[var(--cromo-fg-subtle)]">Loading messages…</div>
                ) : messages.length === 0 ? (
                  <div className="rounded-md border border-[var(--cromo-border-strong)] p-3 text-xs text-[var(--cromo-fg-subtle)]">No messages on this trade yet.</div>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--cromo-border-strong)] divide-y divide-[var(--cromo-border)]">
                    {messages.map((m) => {
                      const selected = selectedMessageIds.has(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => toggleMessage(m.id)}
                          className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs transition-colors ${selected ? 'bg-[var(--cromo-accent-soft)]' : 'hover:bg-[var(--cromo-surface-2)]'}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            readOnly
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[var(--cromo-fg-muted)]">
                              <span className="font-medium text-[var(--cromo-fg)]">
                                {m.isSystem ? 'System' : (m.senderUsername ? `@${m.senderUsername}` : 'Unknown')}
                              </span>
                              <span className="ml-2 text-[var(--cromo-fg-subtle)]">
                                {new Date(m.sentAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="truncate text-[var(--cromo-fg)]">{m.body}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--cromo-fg-muted)]">
                Attach images
                <span className="ml-1 font-normal text-[var(--cromo-fg-subtle)]">
                  ({attachments.length}/{MAX_ATTACHMENTS}, max 5 MB each)
                </span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                className="block w-full text-xs text-[var(--cromo-fg-muted)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--cromo-surface-2)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--cromo-fg)] hover:file:bg-[var(--cromo-surface-2)] disabled:opacity-50"
              />
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachments.map((a) => (
                    <div key={a.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.previewUrl}
                        alt={a.file.name}
                        className="h-16 w-16 rounded-md border border-[var(--cromo-border)] object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--cromo-danger)] text-[var(--cromo-danger-fg)] text-xs shadow"
                        aria-label="Remove attachment"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)]">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-md bg-[var(--cromo-danger)] text-[var(--cromo-danger-fg)] py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
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
    </BottomSheet>
  );
}
