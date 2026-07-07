'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ExternalStickerRef } from '@/lib/api';
import { foldAccents } from '@/lib/normalize';
import { PickerRow } from './TradePickerParts';
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

function isBaseToken(token: string | null): boolean {
  return token === 'base_border' || token === 'base_borderless';
}

/** Team stickers encode their country in the album-code prefix (MEX1 → MEX);
 *  FWC / Coca-Cola / Extras carry no team, so no flag. flagUrl() returns null
 *  for any prefix that isn't a real country, so this never renders a bad flag. */
function fifaCodeOf(ref: ExternalStickerRef): string | null {
  if (!ref.teamName) return null;
  const m = ref.albumCode.match(/^([A-Za-z]{3})\d+$/);
  return m ? m[1].toUpperCase() : null;
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

function fmtScarcity(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
}

function fmtDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function centsToInput(cents: number): string {
  return cents > 0 ? fmtDollars(cents) : '';
}

function parseCashCents(value: string): number {
  const num = parseFloat(value);
  if (!isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

/** Filter a candidate pool by a free-text query over album code + player name. */
function filterBySearch(refs: ExternalStickerRef[], query: string): ExternalStickerRef[] {
  const q = foldAccents(query.trim().toLowerCase());
  if (!q) return refs;
  return refs.filter((r) => {
    const code = r.albumCode.toLowerCase();
    const name = foldAccents((r.playerName ?? '').toLowerCase());
    return code.includes(q) || name.includes(q);
  });
}

function bySortableNumber(a: ExternalStickerRef, b: ExternalStickerRef): number {
  return (a.number ?? 0) - (b.number ?? 0);
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

/**
 * One selectable side of the trade — a searchable list of PickerRow cards
 * (tap to toggle) with an inline copy-count stepper on the selected cards and
 * a slim cash footer, mirroring the registered-user TradeStickerPicker's look.
 * Selection and copy counts stay ON the sticker, so there's no separate tray to
 * flood when the whole optimised plan is selected.
 */
function PickPanel({
  accent,
  candidates,
  selected,
  onToggle,
  qtyOf,
  onQtyChange,
  cashCents,
  onCashChange,
  cashLabel,
  starredHint,
  weights,
  baseStickerCents,
  emptyText,
}: {
  accent: 'accent' | 'success';
  candidates: ExternalStickerRef[];
  selected: Set<string>;
  onToggle: (key: string, next: boolean) => void;
  qtyOf: (ref: ExternalStickerRef) => number;
  onQtyChange: (key: string, next: number) => void;
  cashCents: number;
  onCashChange: (cents: number) => void;
  cashLabel: string;
  starredHint: boolean;
  weights?: VariantWeights | null;
  baseStickerCents?: number;
  emptyText: string;
}) {
  const [search, setSearch] = useState('');
  const [cashText, setCashText] = useState(() => centsToInput(cashCents));
  const filtered = useMemo(
    () => filterBySearch(candidates, search).sort(bySortableNumber),
    [candidates, search],
  );
  const showSearch = candidates.length > 5;

  // Sync the local cash text when the parent resets it (draft load, new match,
  // "add cash" suggestion) without stomping a mid-typing "1.".
  useEffect(() => {
    if (parseCashCents(cashText || '0') !== cashCents) {
      setCashText(centsToInput(cashCents));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashCents]);

  return (
    <div className="min-w-0 flex flex-col gap-2">
      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or player…"
          className="w-full rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
        />
      )}
      {candidates.length === 0 ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)] py-2">{emptyText}</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-[var(--cromo-fg-subtle)] py-2">No matches for “{search}”.</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[26rem] overflow-y-auto pr-0.5 -mr-0.5">
          {filtered.map((r) => {
            const key = refKey(r);
            const isSel = selected.has(key);
            const maxQty = Math.max(1, r.quantity);
            const qty = qtyOf(r);
            const fav = starredHint && r.favourite;
            const want = starredHint && r.wanted && !r.favourite;
            const nonBase = !isBaseToken(r.variantToken);
            const cashBadge = nonBase
              ? `≈ $${fmtDollars(variantCashValueCents(r.variantToken, weights, baseStickerCents))}`
              : null;
            return (
              <PickerRow
                key={key}
                accent={accent}
                albumCode={r.albumCode}
                playerName={r.playerName}
                teamName={r.teamName}
                fifaCode={fifaCodeOf(r)}
                groupName={null}
                variantType={r.variantToken ?? ''}
                quantity={r.quantity}
                rightBadge={cashBadge ? { tone: accent, text: cashBadge } : null}
                isSuggested={!!(fav || want)}
                suggestedTone={fav ? 'very-rare' : 'accent'}
                suggestedLabel={fav ? '♥ favourite' : '★ wanted'}
                selected={isSel}
                onClick={() => onToggle(key, !isSel)}
                stepper={
                  isSel && maxQty > 1
                    ? {
                        quantity: qty,
                        min: 1,
                        max: maxQty,
                        onIncrement: () => onQtyChange(key, qty + 1),
                        onDecrement: () => onQtyChange(key, qty - 1),
                      }
                    : null
                }
              />
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 mt-1 border-t border-[var(--cromo-border)]">
        <span className="text-xs text-[var(--cromo-fg-subtle)]">{cashLabel}</span>
        <span className="text-xs text-[var(--cromo-fg-subtle)]">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cashText}
          onChange={(e) => { setCashText(e.target.value); onCashChange(parseCashCents(e.target.value)); }}
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
            {inlineLabel(rightLabel)}. Tap to add or remove; adjust copies below.
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

      {/* Selectable pools — two columns on md+, stacked on mobile. Selection,
          copy steppers, and cash all live on the column, so there's no separate
          tray to flood when the whole plan is selected. */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--cromo-accent)] mb-1.5">
            For {inlineLabel(leftLabel)} ({iGetCopies} sticker{iGetCopies === 1 ? '' : 's'})
          </p>
          <PickPanel
            accent="accent"
            candidates={candidatesIGet}
            selected={state.selectedIGet}
            onToggle={toggleIGet}
            qtyOf={(r) => effectiveQty(state, r)}
            onQtyChange={changeQty}
            cashCents={state.iGetCashCents}
            onCashChange={(c) => onStateChange({ ...state, iGetCashCents: c })}
            cashLabel="+ cash from them"
            starredHint
            weights={weights}
            baseStickerCents={baseStickerCents}
            emptyText="Nothing they have that you need."
          />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--cromo-success-text)] mb-1.5">
            For {inlineLabel(rightLabel)} ({theyGetCopies} sticker{theyGetCopies === 1 ? '' : 's'})
          </p>
          <PickPanel
            accent="success"
            candidates={candidatesTheyGet}
            selected={state.selectedTheyGet}
            onToggle={toggleTheyGet}
            qtyOf={(r) => effectiveQty(state, r)}
            onQtyChange={changeQty}
            cashCents={state.theyGetCashCents}
            onCashChange={(c) => onStateChange({ ...state, theyGetCashCents: c })}
            cashLabel="+ cash from you"
            starredHint={false}
            weights={weights}
            baseStickerCents={baseStickerCents}
            emptyText="Nothing you have that they want."
          />
        </div>
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
