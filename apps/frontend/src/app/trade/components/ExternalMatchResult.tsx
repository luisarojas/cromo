'use client';

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
      <div>
        <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">{title}</h2>
        <p className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">
          <span className="text-[var(--cromo-accent)] font-medium">
            {mutualOverlap} mutual sticker{mutualOverlap === 1 ? '' : 's'}
          </span>
          {' '}({leftReceives.length} for {leftLabel.toLowerCase()}, {rightReceives.length} for {rightLabel.toLowerCase()})
        </p>
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
