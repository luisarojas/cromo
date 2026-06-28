'use client';

import { useEffect, useState } from 'react';
import type { VariantWeights } from '@cromo/shared';
import { BASE_STICKER_CASH_CENTS, VARIANT_SCARCITY } from '@cromo/shared';
import { compareVariantTypes, variantLabel } from '../../collection/components/variantMeta';

interface Props {
  /** Variant tokens present on either side of the current trade. Drives which
   *  rows the editor shows — there's no point letting the user negotiate a
   *  weight for a variant that's not in the trade. */
  presentVariants: string[];
  /** Current per-trade overrides. Keys not in the map fall back to the global
   *  VARIANT_SCARCITY default. */
  weights: VariantWeights;
  /** Called when the user commits a new weight table. The parent is expected
   *  to re-run the match request — empty object = "use defaults". */
  onCommit: (weights: VariantWeights) => void;
  /** Disable inputs while a match is in flight so a mid-typing submit can't
   *  race a pending response. */
  busy?: boolean;
  /** Override label for the proposer affordance — e.g. "Propose" inside the
   *  live-trade session (the change isn't local). Defaults to "Apply". */
  commitLabel?: string;
  /** Extra explanatory line below the heading — used by the live-trade flow
   *  to explain the proposal/accept handshake. */
  hint?: string;
  /** Personalised cost per base sticker (cents). Drives every variant's
   *  derived cash value. Omit to hide the base-price field entirely (e.g. the
   *  live-trade flow, where pricing is scarcity-only). */
  baseStickerCents?: number;
  /** Called when the user edits the base-sticker price. Unlike `onCommit`,
   *  this applies immediately — base price is display-only and never needs a
   *  backend re-match. */
  onBaseStickerCentsChange?: (cents: number) => void;
}

function fmtCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(value: string): number {
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) return BASE_STICKER_CASH_CENTS;
  return Math.round(num * 100);
}

function fmtDefault(token: string): string {
  const v = VARIANT_SCARCITY[token] ?? 1;
  return v >= 100 ? Math.round(v).toLocaleString() : String(v);
}

export default function WeightsEditor({
  presentVariants, weights, onCommit, busy, commitLabel, hint,
  baseStickerCents, onBaseStickerCentsChange,
}: Props) {
  // Base-price editing is local + immediate (it only rescales the displayed
  // dollar values), so it has its own text-draft separate from the weights
  // draft below. Mirror external resets back into the field.
  const showBasePrice = baseStickerCents !== undefined && !!onBaseStickerCentsChange;
  const [baseText, setBaseText] = useState(
    fmtCents(baseStickerCents ?? BASE_STICKER_CASH_CENTS),
  );
  useEffect(() => {
    if (baseStickerCents === undefined) return;
    if (parseDollarsToCents(baseText) !== baseStickerCents) {
      setBaseText(fmtCents(baseStickerCents));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseStickerCents]);

  // Editing happens against a local draft keyed by variant token. Empty string
  // means "no override" — committing strips empty entries before sending.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      presentVariants.map((t) => [t, weights[t] !== undefined ? String(weights[t]) : '']),
    ),
  );

  // Keep the draft in sync when the parent commits or the trade's variant set
  // changes (e.g. user edited the lists and re-matched).
  useEffect(() => {
    setDraft(Object.fromEntries(
      presentVariants.map((t) => [t, weights[t] !== undefined ? String(weights[t]) : '']),
    ));
  }, [presentVariants, weights]);

  if (presentVariants.length === 0) return null;

  const sorted = [...presentVariants].sort(compareVariantTypes);
  const dirty = sorted.some((t) => {
    const raw = draft[t] ?? '';
    const current = weights[t];
    if (raw.trim() === '') return current !== undefined;
    const n = Number(raw);
    return !Number.isNaN(n) && n !== current;
  });
  const hasAnyOverride = sorted.some((t) => (draft[t] ?? '').trim() !== '');

  function buildCommit(): VariantWeights {
    const out: VariantWeights = {};
    for (const t of sorted) {
      const raw = draft[t] ?? '';
      if (raw.trim() === '') continue;
      const n = Number(raw);
      // Same bounds the backend re-validates against — keep the UI honest so
      // the user sees the same rejection here as on the wire.
      if (!Number.isFinite(n) || n <= 0 || n > 100_000) continue;
      out[t] = Math.round(n * 100) / 100;
    }
    return out;
  }

  return (
    <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">Variant weights</h3>
        <p className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">
          {hint ?? 'Override the default scarcity ratio for any variant in this trade. Blank means "use the default".'}
        </p>
      </div>
      {showBasePrice && (
        <div className="flex items-center gap-2 rounded-md bg-[var(--cromo-surface-2)] px-2.5 py-2">
          <span className="flex-1 text-sm text-[var(--cromo-fg)]">Cost per base sticker</span>
          <span className="text-xs text-[var(--cromo-fg-muted)]">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            disabled={busy}
            value={baseText}
            placeholder={fmtCents(BASE_STICKER_CASH_CENTS)}
            onChange={(e) => {
              setBaseText(e.target.value);
              onBaseStickerCentsChange?.(parseDollarsToCents(e.target.value));
            }}
            aria-label="Cost per base sticker"
            className="w-24 rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2 py-1 text-sm text-[var(--cromo-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
          />
        </div>
      )}
      {showBasePrice && (
        <p className="-mt-1 text-[11px] text-[var(--cromo-fg-subtle)]">
          Every other variant&apos;s value is this price scaled by its scarcity ratio.
        </p>
      )}
      <ul className="space-y-1.5">
        {sorted.map((t) => {
          const placeholder = fmtDefault(t);
          const value = draft[t] ?? '';
          const isOverride = value.trim() !== '';
          return (
            <li key={t} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-[var(--cromo-fg)]">{variantLabel(t)}</span>
              <span className="text-[10px] text-[var(--cromo-fg-muted)] uppercase tracking-wider">
                default {placeholder}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                disabled={busy}
                value={value}
                placeholder={placeholder}
                onChange={(e) => setDraft((d) => ({ ...d, [t]: e.target.value }))}
                aria-label={`${variantLabel(t)} weight override`}
                className={`w-24 rounded-md border px-2 py-1 text-sm text-[var(--cromo-fg)] bg-[var(--cromo-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] ${
                  isOverride ? 'border-[var(--cromo-accent)]' : 'border-[var(--cromo-border)]'
                }`}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={busy || !hasAnyOverride}
          onClick={() => {
            setDraft(Object.fromEntries(sorted.map((t) => [t, ''])));
            onCommit({});
          }}
          className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset to defaults
        </button>
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => onCommit(buildCommit())}
          className="rounded-md bg-[var(--cromo-accent)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {commitLabel ?? 'Apply'}
        </button>
      </div>
    </div>
  );
}
