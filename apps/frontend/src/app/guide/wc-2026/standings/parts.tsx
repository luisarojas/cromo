'use client';

import { useTranslations } from 'next-intl';
import type { GroupQualification } from '@/lib/api';
import { flagUrl } from '@/lib/flags';

/**
 * Country flag for a FIFA code — the SAME flagcdn.com images the album sticker
 * tiles use (`@/lib/flags`), so the two surfaces stay visually consistent.
 * Renders nothing if the code has no mapping; hides on image load error.
 */
export function Flag({ code, className = 'h-3.5 w-5' }: { code: string; className?: string }) {
  const url = flagUrl(code);
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden
      className={`shrink-0 rounded-[2px] object-cover opacity-90 ${className}`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

// Small shared building blocks for the standings views — kept here so the
// three tab views stay focused on layout.

export function QualBadge({ status }: { status: GroupQualification }) {
  const t = useTranslations('wc2026Standings');
  const cfg = {
    CLINCHED: { glyph: '✓', cls: 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)]', label: 'clinched', hint: 'clinchedHint' },
    ELIMINATED: { glyph: '✗', cls: 'bg-[var(--cromo-danger)]/15 text-[var(--cromo-danger)]', label: 'eliminated', hint: 'eliminatedHint' },
    ALIVE: { glyph: '•', cls: 'bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)]', label: 'undecided', hint: 'undecidedHint' },
  }[status];
  return (
    <span
      title={t(cfg.hint)}
      aria-label={t(cfg.label)}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${cfg.cls}`}
    >
      {cfg.glyph}
    </span>
  );
}

/** A compact horizontal probability bar with a label. An exact 0 shows an empty
 * bar and "0%" (no minimum sliver) so eliminated teams read as no chance. */
export function ProbBar({ value, label }: { value: number; label: string }) {
  const exactZero = value <= 0;
  const pctValue = Math.min(100, Math.round(value * 100));
  const width = exactZero ? 0 : Math.max(2, pctValue);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[var(--cromo-fg-muted)]">{label}</span>
        <span className="font-semibold text-[var(--cromo-fg)] tabular-nums">{pctValue}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--cromo-surface-2)]">
        <div className="h-full rounded-full cromo-chrome-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

/**
 * Localized team name for a FIFA code, falling back to the API/provider name
 * when no translation exists. Use everywhere a team name is shown so EN/ES stay
 * consistent regardless of the language the data source returns.
 */
export function TeamName({ code, fallback }: { code: string; fallback?: string | null }) {
  const tn = useTranslations('teamNames');
  return <>{tn.has(code) ? tn(code) : (fallback ?? code)}</>;
}

/** Resolve a localized team name imperatively (for option labels, titles…). */
export function useTeamName() {
  const tn = useTranslations('teamNames');
  return (code: string, fallback?: string | null) => (tn.has(code) ? tn(code) : (fallback ?? code));
}

/** Small accent badge shown when a team's final group position is mathematically
 * locked — the number is its guaranteed rank. */
export function RankLock({ rank }: { rank: number }) {
  const t = useTranslations('wc2026Standings');
  return (
    <span
      title={t('guaranteedRankHint', { rank })}
      aria-label={t('guaranteedRankHint', { rank })}
      className="inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full border border-[var(--cromo-accent)] px-1 text-[9px] font-bold text-[var(--cromo-accent)]"
    >
      {rank}
    </span>
  );
}

/** A team's 3-letter code in a monospace chip. */
export function TeamChip({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center rounded bg-[var(--cromo-surface-2)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--cromo-fg)]">
      {code}
    </span>
  );
}
