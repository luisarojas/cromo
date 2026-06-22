'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface ShareProfileButtonProps {
  username: string;
  /**
   * When set, the share URL points at the per-album route
   * (`/profile/<username>/<albumSlug>`) and an "Album / Profile" toggle is
   * shown so the user can broaden the scope back to the bare profile.
   * Omit when the active context has no specific album (no public
   * inventory yet, etc.).
   */
  albumSlug?: string;
  albumLabel?: string;
  getListText?: () => Promise<string>;
  /**
   * When set, the "Copy list as text" button renders but is disabled, with
   * this string shown as a native tooltip. Use to explain *why* copying is
   * unavailable (e.g. the profile has no public trading inventory yet).
   */
  listDisabledReason?: string;
}

type ShareScope = 'album' | 'profile';

export default function ShareProfileButton({
  username,
  albumSlug,
  albumLabel,
  getListText,
  listDisabledReason,
}: ShareProfileButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [listCopied, setListCopied] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [origin, setOrigin] = useState('');
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [scope, setScope] = useState<ShareScope>(albumSlug ? 'album' : 'profile');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator.share === 'function');
  }, []);

  // Default to album scope whenever an album is active; if the user
  // navigates to a different album the toggle re-pins to "album".
  useEffect(() => {
    setScope(albumSlug ? 'album' : 'profile');
  }, [albumSlug]);

  const shareUrl = useMemo(() => {
    if (!origin) return '';
    if (scope === 'album' && albumSlug) return `${origin}/profile/${username}/${albumSlug}`;
    return `${origin}/profile/${username}`;
  }, [origin, scope, albumSlug, username]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the input
    }
  }

  async function handleCopyList() {
    if (!getListText || listLoading) return;
    setListLoading(true);
    try {
      const text = await getListText();
      await navigator.clipboard.writeText(text);
      setListCopied(true);
      setTimeout(() => setListCopied(false), 2000);
    } catch {
      // silent fail
    } finally {
      setListLoading(false);
    }
  }

  async function handleNativeShare() {
    const title =
      scope === 'album' && albumLabel
        ? `@${username} — ${albumLabel}`
        : `@${username}'s trading inventory`;
    try {
      await navigator.share({ url: shareUrl, title });
    } catch {
      // user cancelled or not supported
    }
  }

  const showScopeToggle = !!albumSlug;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Share profile"
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div
            ref={modalRef}
            className="bg-[var(--cromo-surface)] rounded-xl shadow-cromo-lg border border-[var(--cromo-border)] w-full max-w-xs p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">
                {scope === 'album' && albumLabel ? `Share ${albumLabel}` : 'Share profile'}
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {showScopeToggle && (
              <div className="flex rounded-md border border-[var(--cromo-border-strong)] p-0.5 text-xs">
                <button
                  onClick={() => setScope('album')}
                  className={`flex-1 px-2 py-1 rounded transition-colors ${
                    scope === 'album'
                      ? 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] font-medium'
                      : 'text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
                  }`}
                >
                  This album
                </button>
                <button
                  onClick={() => setScope('profile')}
                  className={`flex-1 px-2 py-1 rounded transition-colors ${
                    scope === 'profile'
                      ? 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] font-medium'
                      : 'text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
                  }`}
                >
                  Whole profile
                </button>
              </div>
            )}

            {/* QR code */}
            <div className="flex justify-center py-2">
              <QRCodeSVG value={shareUrl || `https://cromo.app/profile/${username}`} size={160} />
            </div>

            {/* URL + copy */}
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-md border border-[var(--cromo-border-strong)] bg-transparent px-3 py-1.5 text-xs text-[var(--cromo-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
              />
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md bg-[var(--cromo-accent)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Copy list as text — always rendered; disabled with tooltip when no inventory */}
            {(getListText || listDisabledReason) && (
              <button
                onClick={() => void handleCopyList()}
                disabled={listLoading || !getListText}
                title={!getListText ? listDisabledReason : undefined}
                className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[var(--cromo-surface)]"
              >
                {listLoading ? 'Preparing…' : listCopied ? 'Copied!' : 'Copy list as text'}
              </button>
            )}

            {/* Native share */}
            {canNativeShare && (
              <button
                onClick={handleNativeShare}
                className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
              >
                Share via…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
