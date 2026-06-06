'use client';

import { useEffect, useState } from 'react';
import type { ExternalStickerRef } from '@/lib/api';

interface Props {
  title: string;
  /** Stickers the left-side party would receive. */
  leftReceives: ExternalStickerRef[];
  leftLabel: string;
  /** Stickers the right-side party would receive. */
  rightReceives: ExternalStickerRef[];
  rightLabel: string;
  mutualOverlap: number;
  unknownCodes: string[];
}

function refLine(r: ExternalStickerRef): string {
  const tag = r.stickerType === 'extra' ? ' (Extra)'
    : r.stickerType === 'coca_cola_special' ? ' (Coca-Cola)'
    : '';
  const player = r.playerName ?? 'Unknown';
  return `  ${r.albumCode.padEnd(6)} ${player}${tag}`;
}

function buildShareText(
  title: string,
  leftLabel: string,
  leftReceives: ExternalStickerRef[],
  rightLabel: string,
  rightReceives: ExternalStickerRef[],
): string {
  const lines: string[] = [title, ''];
  lines.push(`${leftLabel} receives (${leftReceives.length}):`);
  lines.push(...(leftReceives.length === 0 ? ['  —'] : leftReceives.map(refLine)));
  lines.push('');
  lines.push(`${rightLabel} receives (${rightReceives.length}):`);
  lines.push(...(rightReceives.length === 0 ? ['  —'] : rightReceives.map(refLine)));
  lines.push('');
  lines.push('Matched via cromotrade.ca');
  return lines.join('\n');
}

function StickerLine({ ref }: { ref: ExternalStickerRef }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span className="font-mono text-xs text-[var(--cromo-fg-muted)] w-16 shrink-0">
        {ref.albumCode}
      </span>
      <span className="text-[var(--cromo-fg)] truncate">
        {ref.playerName ?? <span className="italic text-[var(--cromo-fg-muted)]">Unknown player</span>}
      </span>
      {ref.stickerType === 'extra' && (
        <span className="text-xs text-[var(--cromo-accent)]">Extra</span>
      )}
      {ref.stickerType === 'coca_cola_special' && (
        <span className="text-xs text-[var(--cromo-accent)]">Coca-Cola</span>
      )}
    </li>
  );
}

export default function ExternalMatchResult({
  title, leftReceives, leftLabel, rightReceives, rightLabel, mutualOverlap, unknownCodes,
}: Props) {
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  async function handleShare() {
    const text = buildShareText(title, leftLabel, leftReceives, rightLabel, rightReceives);
    // navigator.share is gesture-bound; we're inside an onClick so it's safe.
    if (canNativeShare) {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        // user cancelled or platform rejected — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // browsers without clipboard API in insecure contexts — no fallback worth showing.
    }
  }

  if (mutualOverlap === 0 && unknownCodes.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--cromo-fg)] mb-1">{title}</h2>
        <p className="text-sm text-[var(--cromo-fg-muted)]">No mutual trade found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">{title}</h2>
          <p className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">
            <span className="text-[var(--cromo-accent)] font-medium">
              {mutualOverlap} mutual sticker{mutualOverlap === 1 ? '' : 's'}
            </span>
            {' '}({leftReceives.length} for {leftLabel.toLowerCase()}, {rightReceives.length} for {rightLabel.toLowerCase()})
          </p>
        </div>
        {mutualOverlap > 0 && (
          <button
            onClick={handleShare}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
            aria-label={canNativeShare ? 'Share match' : 'Copy match'}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {canNativeShare ? 'Share' : copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-[var(--cromo-fg-muted)] mb-2">
            {leftLabel} receives ({leftReceives.length})
          </p>
          {leftReceives.length === 0 ? (
            <p className="text-xs text-[var(--cromo-fg-subtle)]">Nothing.</p>
          ) : (
            <ul className="space-y-1.5">
              {leftReceives.map((r) => <StickerLine key={r.albumCode} ref={r} />)}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--cromo-fg-muted)] mb-2">
            {rightLabel} receives ({rightReceives.length})
          </p>
          {rightReceives.length === 0 ? (
            <p className="text-xs text-[var(--cromo-fg-subtle)]">Nothing.</p>
          ) : (
            <ul className="space-y-1.5">
              {rightReceives.map((r) => <StickerLine key={r.albumCode} ref={r} />)}
            </ul>
          )}
        </div>
      </div>

      {unknownCodes.length > 0 && (
        <div className="rounded-md bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 p-2.5">
          <p className="text-xs text-amber-800">
            <span className="font-medium">{unknownCodes.length} unknown code{unknownCodes.length === 1 ? '' : 's'}:</span>{' '}
            <span className="font-mono">{unknownCodes.join(', ')}</span>
          </p>
        </div>
      )}
    </div>
  );
}
