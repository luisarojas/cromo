'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ExternalStickerRef } from '@/lib/api';
import {
  computeScarcityBalance,
  suggestBalancingCashCents,
  variantCashValueCents,
  type ScarcityTotals,
  type VariantWeights,
} from '@cromo/shared';

export interface EditorState {
  selectedIGet: Set<string>;
  selectedTheyGet: Set<string>;
  /** Per-row copy-count overrides keyed by refKey, bounded [1, ref.quantity].
   *  Absent rows trade the ref's full quantity (the matcher already caps it
   *  to what the user can spare / the partner asked for). */
  quantities?: Record<string, number>;
  /** Cents the third party gives me on top of stickers. */
  iGetCashCents: number;
  /** Cents I give the third party on top of stickers. */
  theyGetCashCents: number;
}

/** Copies this row trades: the user's override, clamped to the pool max. */
function effectiveQty(state: EditorState, ref: ExternalStickerRef): number {
  const max = Math.max(1, ref.quantity);
  const override = state.quantities?.[refKey(ref)];
  if (override === undefined) return max;
  return Math.min(Math.max(1, Math.floor(override)), max);
}

/**
 * The selected refs with their effective (possibly reduced) quantities —
 * what the balance, the record call, and the text export must all agree on.
 */
export function effectiveSelectedRefs(
  candidates: ExternalStickerRef[],
  selected: Set<string>,
  state: EditorState,
): ExternalStickerRef[] {
  return candidates
    .filter((r) => selected.has(refKey(r)))
    .map((r) => ({ ...r, quantity: effectiveQty(state, r) }));
}

function copyCount(refs: ExternalStickerRef[]): number {
  return refs.reduce((s, r) => s + r.quantity, 0);
}

interface Props {
  title: string;
  /** Label for the side that receives — typically the logged-in user. */
  leftLabel: string;
  /** Label for the side that gives — typically the partner's name. */
  rightLabel: string;
  candidatesIGet: ExternalStickerRef[];
  candidatesTheyGet: ExternalStickerRef[];
  unknownCodes: string[];
  weights?: VariantWeights | null;
  /** Personalised cost per base sticker (cents). Every variant's displayed
   *  cash value and the balancing-cash suggestion scale off this. */
  baseStickerCents?: number;
  state: EditorState;
  onStateChange: (next: EditorState) => void;
  onCopy?: () => void;
  onSave?: () => void;
  onRecord?: () => void;
  saving?: boolean;
  recording?: boolean;
  /** Override the default "Save draft" label (e.g. "Update draft" when editing an existing one). */
  saveLabel?: string;
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

function isBaseToken(token: string | null): boolean {
  return token === 'base_border' || token === 'base_borderless';
}

// "You"/"Them"/"They" are pronoun fallbacks that read naturally lowercased
// mid-sentence ("3 for you, 2 for them"); a partner's typed name keeps the
// casing they entered ("3 for you, 2 for Alex").
const PRONOUN_LABELS = new Set(['You', 'Them', 'They']);
function inlineLabel(label: string): string {
  return PRONOUN_LABELS.has(label) ? label.toLowerCase() : label;
}

function refKey(ref: ExternalStickerRef): string {
  // stickerVariantId is the canonical identity; falls back to album_code +
  // variant only when the catalog couldn't resolve (which strips selectability
  // anyway, but keep the key stable so React doesn't reuse rows across renders).
  return ref.stickerVariantId ?? `${ref.albumCode}|${ref.variantToken ?? ''}`;
}

function groupRefs(
  refs: ExternalStickerRef[],
): Array<{ bucket: string; items: ExternalStickerRef[] }> {
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

function fmtScarcity(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
}

function fmtDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseCashCents(value: string): number {
  const num = parseFloat(value);
  if (!isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function balanceMessage(
  balance: ScarcityTotals,
  leftLabel: string,
): { tone: 'ok' | 'warn'; text: string } | null {
  if (balance.ratio === null) return null;
  if (balance.give === 0 && balance.get === 0) return null;
  if (balance.sameVariant) {
    if (!balance.lopsided) {
      return {
        tone: 'ok',
        text: `Same-variant trade — both sides exchange ${fmtScarcity(balance.give)} sticker${balance.give === 1 ? '' : 's'}.`,
      };
    }
    return {
      tone: 'warn',
      text: `Same-variant trades should be equal counts — ${leftLabel} would give ${fmtScarcity(balance.give)} and receive ${fmtScarcity(balance.get)}.`,
    };
  }
  if (!balance.lopsided) {
    return {
      tone: 'ok',
      text: `Roughly fair — ${leftLabel} gives ${fmtScarcity(balance.give)} value points and receives ${fmtScarcity(balance.get)}.`,
    };
  }
  if (balance.ratio < 1) {
    const multiple = (1 / balance.ratio).toFixed(1);
    return {
      tone: 'warn',
      text: `${leftLabel} gives ${fmtScarcity(balance.give)} and receives ${fmtScarcity(balance.get)} — about ${multiple}× off. Add cash or stickers to even it out.`,
    };
  }
  const multiple = balance.ratio.toFixed(1);
  return {
    tone: 'warn',
    text: `${leftLabel} receives ${fmtScarcity(balance.get)} and gives ${fmtScarcity(balance.give)} — about ${multiple}× off. The other side may push back.`,
  };
}

function SideColumn({
  label,
  candidates,
  selected,
  qtyOf,
  cashCents,
  totalCount,
  cashLabel,
  emptyText,
  onToggle,
  onQtyChange,
  onCashChange,
  starredHint,
  weights,
  baseStickerCents,
}: {
  label: string;
  candidates: ExternalStickerRef[];
  selected: Set<string>;
  /** Effective copy count for a row (override or pool max). */
  qtyOf: (ref: ExternalStickerRef) => number;
  cashCents: number;
  totalCount: number;
  cashLabel: string;
  emptyText: string;
  onToggle: (key: string, next: boolean) => void;
  onQtyChange: (key: string, next: number) => void;
  onCashChange: (cents: number) => void;
  starredHint: boolean;
  weights?: VariantWeights | null;
  baseStickerCents?: number;
}) {
  const groups = groupRefs(candidates);
  const [cashText, setCashText] = useState(cashCents > 0 ? fmtDollars(cashCents) : '');

  // Mirror external cash changes (parent reset, draft load) back into the
  // input. Skip when our typed value would parse to the same cents, otherwise
  // the user gets their keystrokes overwritten mid-edit.
  useEffect(() => {
    const typedCents = parseCashCents(cashText || '0');
    if (typedCents !== cashCents) {
      setCashText(cashCents > 0 ? fmtDollars(cashCents) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashCents]);

  return (
    // min-w-0 lets this grid column shrink below its content's intrinsic width
    // so the sticker-name `truncate` engages instead of overflowing on mobile.
    <div className="min-w-0">
      <p className="text-xs font-medium text-[var(--cromo-fg-muted)] mb-2">
        For {label} ({totalCount} sticker{totalCount === 1 ? '' : 's'}
        {cashCents > 0 && ` + $${fmtDollars(cashCents)}`})
      </p>
      {candidates.length === 0 ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)] mb-3">{emptyText}</p>
      ) : (
        <div className="space-y-3 mb-3">
          {groups.map((g, i) => (
            <div key={`${g.bucket}|${i}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cromo-fg-subtle)] mb-1">
                {g.bucket}
              </p>
              <ul className="space-y-1">
                {g.items.map((r) => {
                  const key = refKey(r);
                  const isSelected = selected.has(key);
                  const disabled = !r.stickerVariantId;
                  const maxQty = Math.max(1, r.quantity);
                  const qty = qtyOf(r);
                  return (
                    <li key={key}>
                      <label
                        className={`flex items-center gap-2 text-sm rounded px-1.5 py-1 ${
                          disabled
                            ? 'opacity-50 cursor-not-allowed'
                            : isSelected
                              ? 'bg-[var(--cromo-accent-soft)] cursor-pointer'
                              : 'hover:bg-[var(--cromo-surface-2)] cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={disabled}
                          onChange={(e) => onToggle(key, e.target.checked)}
                          className="h-4 w-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
                        />
                        <span className="font-mono text-xs text-[var(--cromo-fg-muted)] w-14 shrink-0">
                          {r.albumCode}
                        </span>
                        <span className="text-[var(--cromo-fg)] truncate min-w-0 flex-1">
                          {r.playerName ?? <span className="italic text-[var(--cromo-fg-muted)]">Unknown</span>}
                        </span>
                        {maxQty > 1 && (isSelected ? (
                          <span
                            className="flex items-center gap-0.5 shrink-0"
                            // Keep stepper taps from toggling the row checkbox.
                            onClick={(e) => e.preventDefault()}
                          >
                            <button
                              type="button"
                              aria-label="Fewer copies"
                              disabled={qty <= 1}
                              onClick={() => onQtyChange(key, qty - 1)}
                              className="h-5 w-5 rounded border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-xs leading-none text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              −
                            </button>
                            <span className="w-7 text-center text-xs tabular-nums font-medium text-[var(--cromo-fg)]">
                              ×{qty}
                            </span>
                            <button
                              type="button"
                              aria-label="More copies"
                              disabled={qty >= maxQty}
                              onClick={() => onQtyChange(key, qty + 1)}
                              className="h-5 w-5 rounded border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-xs leading-none text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                          </span>
                        ) : (
                          <span className="text-[10px] tabular-nums font-medium px-1.5 py-0.5 rounded bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] shrink-0">
                            ×{maxQty}
                          </span>
                        ))}
                        {starredHint && r.favourite && (
                          <span title="You favourited this" aria-label="Favourite" className="text-xs text-[var(--cromo-danger-text)]">♥</span>
                        )}
                        {starredHint && r.wanted && !r.favourite && (
                          <span title="You added this to your wanted list" aria-label="Wanted" className="text-xs text-[var(--cromo-warning-text)]">★</span>
                        )}
                        {r.variantLabel && !isBaseToken(r.variantToken) && (
                          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]">
                            {r.variantLabel}
                          </span>
                        )}
                        {!isBaseToken(r.variantToken) && (
                          <span
                            title="Approximate cash value: cost per base sticker scaled by variant scarcity"
                            className="text-[10px] tabular-nums text-[var(--cromo-fg-subtle)] shrink-0"
                          >
                            ≈ ${fmtDollars(variantCashValueCents(r.variantToken, weights, baseStickerCents))}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-[var(--cromo-border)]">
        <span className="text-xs text-[var(--cromo-fg-subtle)]">{cashLabel}</span>
        <span className="text-xs text-[var(--cromo-fg-subtle)]">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cashText}
          onChange={(e) => {
            setCashText(e.target.value);
            onCashChange(parseCashCents(e.target.value));
          }}
          placeholder="0.00"
          className="w-20 rounded border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
        />
      </div>
    </div>
  );
}

export default function ThirdPartyTradeEditor({
  title,
  leftLabel,
  rightLabel,
  candidatesIGet,
  candidatesTheyGet,
  unknownCodes,
  weights,
  baseStickerCents,
  state,
  onStateChange,
  onCopy,
  onSave,
  onRecord,
  saving,
  recording,
  saveLabel,
}: Props) {
  const totalSelectedIGet = useMemo(
    () => effectiveSelectedRefs(candidatesIGet, state.selectedIGet, state),
    [candidatesIGet, state],
  );
  const totalSelectedTheyGet = useMemo(
    () => effectiveSelectedRefs(candidatesTheyGet, state.selectedTheyGet, state),
    [candidatesTheyGet, state],
  );
  const iGetCopies = copyCount(totalSelectedIGet);
  const theyGetCopies = copyCount(totalSelectedTheyGet);

  // Balance from the user's perspective: give = theyGet (I give), get = iGet
  // (I receive). Cash mirrors: theyGetCashCents is what I give, iGetCashCents
  // is what I receive.
  const balance = useMemo(
    () =>
      computeScarcityBalance(totalSelectedTheyGet, totalSelectedIGet, {
        weights,
        giveCashCents: state.theyGetCashCents,
        getCashCents: state.iGetCashCents,
        baseCents: baseStickerCents,
      }),
    [totalSelectedTheyGet, totalSelectedIGet, weights, state.theyGetCashCents, state.iGetCashCents, baseStickerCents],
  );

  const balanceLine = balanceMessage(balance, leftLabel);
  // Only surface the cash suggestion when the trade has stickers on the
  // shortfall side — adding cash to a fully-empty side is technically valid
  // but reads as "buy the stickers from me", which isn't what the third-party
  // flow is for.
  const cashSuggestion = useMemo(() => {
    const s = suggestBalancingCashCents(balance, baseStickerCents);
    if (!s) return null;
    if (s.side === 'give' && totalSelectedTheyGet.length === 0 && state.theyGetCashCents === 0) return null;
    if (s.side === 'get' && totalSelectedIGet.length === 0 && state.iGetCashCents === 0) return null;
    return s;
  }, [balance, baseStickerCents, totalSelectedTheyGet.length, totalSelectedIGet.length, state.theyGetCashCents, state.iGetCashCents]);

  function toggleIGet(key: string, next: boolean): void {
    const set = new Set(state.selectedIGet);
    if (next) set.add(key); else set.delete(key);
    onStateChange({ ...state, selectedIGet: set });
  }
  function toggleTheyGet(key: string, next: boolean): void {
    const set = new Set(state.selectedTheyGet);
    if (next) set.add(key); else set.delete(key);
    onStateChange({ ...state, selectedTheyGet: set });
  }
  function changeQty(key: string, next: number): void {
    onStateChange({
      ...state,
      quantities: { ...state.quantities, [key]: next },
    });
  }

  const canRecord =
    !!onRecord &&
    (totalSelectedIGet.length > 0 || totalSelectedTheyGet.length > 0) &&
    !recording;
  const canSave = !!onSave && !saving;
  const canCopy =
    !!onCopy &&
    (totalSelectedIGet.length > 0 ||
      totalSelectedTheyGet.length > 0 ||
      state.iGetCashCents > 0 ||
      state.theyGetCashCents > 0);

  const empty =
    candidatesIGet.length === 0 &&
    candidatesTheyGet.length === 0 &&
    unknownCodes.length === 0;

  if (empty) {
    return (
      <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--cromo-fg)] mb-1">{title}</h2>
        <p className="text-sm text-[var(--cromo-fg-muted)]">No mutual trade found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">{title}</h2>
          <p className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">
            {iGetCopies} for {inlineLabel(leftLabel)}, {theyGetCopies} for{' '}
            {inlineLabel(rightLabel)}. Untick anything you don&apos;t want; tick more from the pool.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              disabled={!canCopy}
              className="rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Copy as text
            </button>
          )}
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : (saveLabel ?? 'Save draft')}
            </button>
          )}
          {onRecord && (
            <button
              type="button"
              onClick={onRecord}
              disabled={!canRecord}
              className="rounded-md bg-[var(--cromo-accent)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {recording ? 'Recording…' : 'I made this trade'}
            </button>
          )}
        </div>
      </div>

      {balanceLine && (
        <div
          className={`rounded-md p-2.5 text-xs ${
            balanceLine.tone === 'warn'
              ? 'bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 text-amber-800'
              : 'bg-[var(--cromo-success-soft)] border border-[var(--cromo-success)]/30 text-[var(--cromo-success-text)]'
          }`}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <span className="font-medium">
                {balanceLine.tone === 'warn' ? 'Lopsided — ' : 'Looks fair — '}
              </span>
              {balanceLine.text}
            </div>
            {cashSuggestion && (
              <button
                type="button"
                onClick={() => {
                  if (cashSuggestion.side === 'give') {
                    onStateChange({ ...state, theyGetCashCents: state.theyGetCashCents + cashSuggestion.cents });
                  } else {
                    onStateChange({ ...state, iGetCashCents: state.iGetCashCents + cashSuggestion.cents });
                  }
                }}
                className="shrink-0 rounded-md border border-[var(--cromo-warning)]/40 bg-[var(--cromo-surface)] px-2.5 py-1 text-xs font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
              >
                {cashSuggestion.side === 'give'
                  ? `Add $${fmtDollars(cashSuggestion.cents)} from you`
                  : `Add $${fmtDollars(cashSuggestion.cents)} from them`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <SideColumn
          label={leftLabel}
          candidates={candidatesIGet}
          selected={state.selectedIGet}
          qtyOf={(r) => effectiveQty(state, r)}
          cashCents={state.iGetCashCents}
          totalCount={iGetCopies}
          cashLabel="+ cash from them"
          emptyText="Nothing they have that you need."
          onToggle={toggleIGet}
          onQtyChange={changeQty}
          onCashChange={(c) => onStateChange({ ...state, iGetCashCents: c })}
          starredHint
          weights={weights}
          baseStickerCents={baseStickerCents}
        />
        <SideColumn
          label={rightLabel}
          candidates={candidatesTheyGet}
          selected={state.selectedTheyGet}
          qtyOf={(r) => effectiveQty(state, r)}
          cashCents={state.theyGetCashCents}
          totalCount={theyGetCopies}
          cashLabel="+ cash from you"
          emptyText="Nothing you have that they want."
          onToggle={toggleTheyGet}
          onQtyChange={changeQty}
          onCashChange={(c) => onStateChange({ ...state, theyGetCashCents: c })}
          starredHint={false}
          weights={weights}
          baseStickerCents={baseStickerCents}
        />
      </div>

      {unknownCodes.length > 0 && (
        <div className="rounded-md bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 p-2.5">
          <p className="text-xs text-amber-800">
            <span className="font-medium">
              {unknownCodes.length} unknown code{unknownCodes.length === 1 ? '' : 's'}:
            </span>{' '}
            <span className="font-mono">{unknownCodes.join(', ')}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export { refKey };
