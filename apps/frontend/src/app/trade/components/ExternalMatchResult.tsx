'use client';

import { useEffect, useState } from 'react';
import type { ExternalStickerRef } from '@/lib/api';
import type { ScarcityTotals } from '@cromo/shared';

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
  /** Scarcity balance from the left side's perspective (their give vs. get). */
  balance?: ScarcityTotals;
}

const BUCKET_BY_TYPE: Record<string, string> = {
  intro: 'FWC',
  coca_cola_special: 'Coca-Cola',
  extra: 'Extras',
};

function bucketFor(ref: ExternalStickerRef): string {
  if (ref.stickerType && BUCKET_BY_TYPE[ref.stickerType]) {
    return BUCKET_BY_TYPE[ref.stickerType]!;
  }
  return ref.teamName ?? 'Other';
}

function groupRefs(refs: ExternalStickerRef[]): Array<{ bucket: string; items: ExternalStickerRef[] }> {
  // Walk refs in album order (by sticker number) and emit a fresh bucket each
  // time the section changes. Mirrors the album page's StickerGrid: FWC
  // stickers split into head (FWC1–FWC8) and tail (FWC9+) runs surrounding the
  // team pages, so the panel reads as FWC → teams → FWC → Coca-Cola → Extras.
  const sorted = [...refs].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const out: Array<{ bucket: string; items: ExternalStickerRef[] }> = [];
  for (const r of sorted) {
    const key = bucketFor(r);
    const last = out[out.length - 1];
    if (last && last.bucket === key) {
      last.items.push(r);
    } else {
      out.push({ bucket: key, items: [r] });
    }
  }
  return out;
}

function refLine(r: ExternalStickerRef): string {
  const player = r.playerName ?? 'Unknown';
  const variantSuffix = r.variantLabel && r.variantToken !== 'base_borderless' && r.variantToken !== 'base_border'
    ? ` (${r.variantLabel})` : '';
  const qty = r.quantity > 1 ? ` ×${r.quantity}` : '';
  return `  ${r.albumCode.padEnd(6)} ${player}${variantSuffix}${qty}`;
}

function sectionLines(refs: ExternalStickerRef[]): string[] {
  if (refs.length === 0) return ['  —'];
  const groups = groupRefs(refs);
  const lines: string[] = [];
  groups.forEach((g, i) => {
    if (i > 0) lines.push('');
    lines.push(`${g.bucket}:`);
    lines.push(...g.items.map(refLine));
  });
  return lines;
}

function buildShareText(
  title: string,
  leftLabel: string,
  leftReceives: ExternalStickerRef[],
  rightLabel: string,
  rightReceives: ExternalStickerRef[],
): string {
  const lines: string[] = [title, ''];
  lines.push(`For ${leftLabel} (${leftReceives.length}):`);
  lines.push(...sectionLines(leftReceives));
  lines.push('');
  lines.push(`For ${rightLabel} (${rightReceives.length}):`);
  lines.push(...sectionLines(rightReceives));
  lines.push('');
  lines.push('Matched via cromotrade.ca');
  return lines.join('\n');
}

function isBaseToken(token: string | null): boolean {
  return token === 'base_border' || token === 'base_borderless';
}

function ReceivedColumn({ label, refs }: { label: string; refs: ExternalStickerRef[] }) {
  const groups = groupRefs(refs);
  return (
    <div>
      <p className="text-xs font-medium text-[var(--cromo-fg-muted)] mb-2">
        For {label} ({refs.length})
      </p>
      {refs.length === 0 ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)]">Nothing.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g, i) => (
            <div key={`${g.bucket}|${i}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cromo-fg-subtle)] mb-1">
                {g.bucket}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((r) => (
                  <StickerLine key={`${r.albumCode}|${r.variantToken ?? ''}`} ref={r} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
      {ref.variantLabel && !isBaseToken(ref.variantToken) && (
        <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]">
          {ref.variantLabel}
        </span>
      )}
      {ref.quantity > 1 && (
        <span className="text-xs text-[var(--cromo-fg-muted)]">×{ref.quantity}</span>
      )}
    </li>
  );
}

/**
 * Format the balance summary line. Returns null when there's nothing to say
 * (one side gives nothing or both sides are empty).
 */
function balanceMessage(balance: ScarcityTotals, leftLabel: string): {
  tone: 'ok' | 'warn';
  text: string;
} | null {
  if (balance.ratio === null) return null;
  if (balance.give === 0 && balance.get === 0) return null;
  const fmt = (n: number) => n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
  const ratio = balance.ratio;
  // Single-variant trades collapse the band to "equal counts" — scarcity-
  // weighted math is meaningless when both sides are the same lane.
  if (balance.sameVariant) {
    if (!balance.lopsided) {
      return {
        tone: 'ok',
        text: `Same-variant trade — both sides exchange ${fmt(balance.give)} sticker${balance.give === 1 ? '' : 's'}.`,
      };
    }
    return {
      tone: 'warn',
      text: `Same-variant trades should be equal counts — ${leftLabel} would give ${fmt(balance.give)} and receive ${fmt(balance.get)}. Even up the piles before sealing.`,
    };
  }
  if (!balance.lopsided) {
    return {
      tone: 'ok',
      text: `Roughly fair trade — ${leftLabel} would give ${fmt(balance.give)} scarcity points and receive ${fmt(balance.get)}.`,
    };
  }
  if (ratio < 1) {
    // leftLabel side gives more than they get.
    const multiple = (1 / ratio).toFixed(1);
    return {
      tone: 'warn',
      text: `${leftLabel} would give ${fmt(balance.give)} scarcity points and receive only ${fmt(balance.get)} — about ${multiple}× off. Worth a second look before sealing.`,
    };
  }
  const multiple = ratio.toFixed(1);
  return {
    tone: 'warn',
    text: `${leftLabel} would receive ${fmt(balance.get)} scarcity points and give only ${fmt(balance.give)} — about ${multiple}× off. The other side may push back.`,
  };
}

export default function ExternalMatchResult({
  title, leftReceives, leftLabel, rightReceives, rightLabel, mutualOverlap, unknownCodes, balance,
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

  const balanceLine = balance ? balanceMessage(balance, leftLabel) : null;

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

      {balanceLine && (
        <div
          className={`rounded-md p-2.5 text-xs ${
            balanceLine.tone === 'warn'
              ? 'bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 text-amber-800'
              : 'bg-[var(--cromo-success-soft)] border border-[var(--cromo-success)]/30 text-[var(--cromo-success-text)]'
          }`}
        >
          <span className="font-medium">
            {balanceLine.tone === 'warn' ? 'Lopsided trade — ' : 'Looks fair — '}
          </span>
          {balanceLine.text}
          {balanceLine.tone === 'warn' && (
            <span className="block mt-1 text-[11px] opacity-80">
              This is just guidance. Scarcity is approximated from Panini pack odds; collectors set the actual price.
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ReceivedColumn label={leftLabel} refs={leftReceives} />
        <ReceivedColumn label={rightLabel} refs={rightReceives} />
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
