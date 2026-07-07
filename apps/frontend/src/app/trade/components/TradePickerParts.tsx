'use client';

import * as React from 'react';
import { variantLabel, variantSwatch } from '@/app/collection/components/variantMeta';
import { flagUrl } from '@/lib/flags';
import CashInput from './CashInput';

/**
 * Presentational building blocks shared by the trade pickers.
 *
 * `PickerRow`    — a tap-to-select sticker card (variant swatch, country flag,
 *                  album code + player, secondary "variant · team · group" line).
 * `SummaryRow`   — the labelled selection tray with a trailing cash input.
 * `SelectedChip` — a compact selected-item chip with a copy-count stepper.
 *
 * Extracted verbatim from TradeStickerPicker so the third-party trade editor can
 * present the same look without duplicating the markup.
 */

export function PickerRow({
  accent,
  albumCode,
  playerName,
  teamName,
  fifaCode,
  groupName,
  variantType,
  quantity,
  rightBadge,
  isSuggested,
  suggestedTone = 'accent',
  suggestedLabel = 'they need',
  selected,
  muted,
  onClick,
  onHide,
  rightAction,
  stepper,
}: {
  accent: 'accent' | 'success';
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
  fifaCode: string | null;
  groupName: string | null;
  variantType: string;
  quantity?: number;
  rightBadge?: { tone: 'warning' | 'success' | 'accent' | 'danger'; text: string; icon?: React.ReactNode } | null;
  isSuggested: boolean;
  suggestedTone?: 'accent' | 'very-rare' | 'success';
  suggestedLabel?: string;
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
  onHide?: () => void;
  rightAction?: { label: string; onClick: () => void };
  /** Optional inline copy-count stepper (shown in place of the plain "×N"
   *  quantity badge). Buttons stop propagation so tapping them doesn't toggle
   *  the row's selection. */
  stepper?: { quantity: number; min: number; max: number; onIncrement: () => void; onDecrement: () => void } | null;
}) {
  const selectedBorder =
    accent === 'accent'
      ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)]'
      : 'border-[var(--cromo-success)] bg-[var(--cromo-success-soft)]';
  const idleHover =
    accent === 'accent'
      ? 'hover:border-[var(--cromo-accent)]/40 hover:bg-[var(--cromo-accent-soft)]/40'
      : 'hover:border-[var(--cromo-success)]/40 hover:bg-[var(--cromo-success-soft)]/40';

  const suggestedToneClass = {
    accent: 'text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] border-[var(--cromo-accent)]/30',
    'very-rare': 'text-[var(--cromo-tier-very-rare)] bg-[var(--cromo-tier-very-rare-soft)] border-[var(--cromo-tier-very-rare)]/30',
    success: 'text-[var(--cromo-success-text)] bg-[var(--cromo-success-soft)] border-[var(--cromo-success)]/30',
  }[suggestedTone];

  const badgeToneClass = rightBadge
    ? {
        warning: 'text-[var(--cromo-warning-text)] bg-[var(--cromo-warning-soft)] border-[var(--cromo-warning)]/30',
        success: 'text-[var(--cromo-success-text)] bg-[var(--cromo-success-soft)] border-[var(--cromo-success)]/30',
        accent: 'text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] border-[var(--cromo-accent)]/30',
        danger: 'text-[var(--cromo-danger-text)] bg-[var(--cromo-danger-soft)] border-[var(--cromo-danger)]/30',
      }[rightBadge.tone]
    : '';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? onClick() : undefined)}
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left w-full transition-colors cursor-pointer min-h-[56px] ${
        selected
          ? selectedBorder
          : muted
            ? 'border-[var(--cromo-border)] bg-[var(--cromo-surface)]/40 opacity-70'
            : `border-[var(--cromo-border)] bg-[var(--cromo-surface)] ${idleHover}`
      }`}
    >
      <span
        className={`shrink-0 w-3 h-3 rounded-full border ${variantSwatch(variantType)}`}
        title={variantLabel(variantType)}
      />

      {fifaCode && flagUrl(fifaCode) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagUrl(fifaCode)!}
          alt={fifaCode}
          className="shrink-0 w-5 h-3.5 object-cover rounded-sm border border-[var(--cromo-border)]"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-[var(--cromo-fg)] tabular-nums">
            {albumCode}
          </span>
          {playerName && (
            <span className="text-xs text-[var(--cromo-fg)] truncate">{playerName}</span>
          )}
          {isSuggested && (
            <span
              className={`shrink-0 text-[9px] font-medium border px-1 py-px rounded leading-none uppercase tracking-wider ${suggestedToneClass}`}
            >
              {suggestedLabel}
            </span>
          )}
        </div>
        <div className="text-[10px] text-[var(--cromo-fg-subtle)] truncate">
          {variantLabel(variantType)}
          {teamName ? ` · ${teamName}` : ''}
          {groupName ? ` · ${groupName}` : ''}
        </div>
      </div>

      {rightBadge && (
        <span
          className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium border px-1 py-px rounded leading-none uppercase tracking-wider ${badgeToneClass}`}
        >
          {rightBadge.icon}
          {rightBadge.text}
        </span>
      )}

      {stepper ? (
        <span className="shrink-0 flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="Fewer copies"
            disabled={stepper.quantity <= stepper.min}
            onClick={(e) => { e.stopPropagation(); stepper.onDecrement(); }}
            className="h-6 w-6 flex items-center justify-center rounded border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-sm leading-none text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            −
          </button>
          <span className="w-8 text-center text-xs tabular-nums font-semibold text-[var(--cromo-fg)]">
            ×{stepper.quantity}
          </span>
          <button
            type="button"
            aria-label="More copies"
            disabled={stepper.quantity >= stepper.max}
            onClick={(e) => { e.stopPropagation(); stepper.onIncrement(); }}
            className="h-6 w-6 flex items-center justify-center rounded border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-sm leading-none text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            +
          </button>
        </span>
      ) : quantity !== undefined && !rightBadge && quantity > 1 ? (
        <span className="shrink-0 text-xs text-[var(--cromo-fg-subtle)] tabular-nums">×{quantity}</span>
      ) : null}

      {onHide && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          aria-label="Hide from trades"
          title="Hide from trades"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-surface-2)] transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.515a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
          </svg>
        </button>
      )}

      {rightAction && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            rightAction.onClick();
          }}
          className="shrink-0 inline-flex items-center px-2 py-1 rounded-md border border-[var(--cromo-accent)]/40 bg-[var(--cromo-surface)] text-[11px] font-medium text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-soft)] transition-colors"
        >
          {rightAction.label}
        </button>
      )}

      {!rightAction && (
        <span
          className={`shrink-0 text-base font-medium transition-colors ${
            selected
              ? accent === 'accent'
                ? 'text-[var(--cromo-accent)]'
                : 'text-[var(--cromo-success-text)]'
              : 'text-[var(--cromo-fg-subtle)]'
          }`}
        >
          {selected ? '✓' : '+'}
        </span>
      )}
    </div>
  );
}

export function SummaryRow({
  label,
  accent,
  itemCount,
  cashInput,
  onCashChange,
  empty,
  children,
}: {
  label: string;
  accent: 'accent' | 'success';
  itemCount: number;
  cashInput: string;
  onCashChange: (v: string) => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  const color = accent === 'accent' ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-success-text)]';
  const badgeBg =
    accent === 'accent' ? 'bg-[var(--cromo-accent-soft)]' : 'bg-[var(--cromo-success-soft)]';
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
      <div className="flex items-center justify-between sm:w-20 sm:pt-1.5 shrink-0">
        <span className={`text-xs font-semibold ${color}`}>{label}</span>
        {itemCount > 0 && (
          <span
            className={`sm:hidden text-[10px] font-medium ${color} ${badgeBg} px-1.5 py-0.5 rounded-full tabular-nums`}
          >
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
      {/* Mobile: horizontal scroller — chips on a single line so the bar
          stays a fixed ~3.5rem regardless of selection count, leaving the
          picker list room to breathe. Desktop: keeps the wrapping layout
          since horizontal space is abundant and seeing every chip at once
          matters more than predictable height. */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0 overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {empty ? (
          <span className="text-xs text-[var(--cromo-fg-subtle)] italic">Nothing selected yet</span>
        ) : (
          children
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1.5 sm:pt-1">
        {itemCount > 0 && (
          <span
            className={`hidden sm:inline text-xs font-medium ${color} ${badgeBg} px-2 py-0.5 rounded-full tabular-nums`}
          >
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        )}
        <CashInput
          value={cashInput}
          onChange={onCashChange}
          accent={accent === 'accent' ? 'blue' : 'emerald'}
        />
      </div>
    </div>
  );
}

export function SelectedChip({
  albumCode,
  playerName,
  fifaCode,
  variantType,
  accent,
  suggested,
  quantity,
  minQty,
  maxQty,
  onIncrement,
  onDecrement,
  onRemove,
  variantSelect,
}: {
  albumCode: string;
  playerName: string | null;
  fifaCode: string | null;
  variantType: string;
  accent: 'accent' | 'success';
  suggested: string | null;
  quantity: number;
  minQty: number;
  maxQty: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  variantSelect?: {
    value: string;
    options: { id: string; type: string }[];
    onChange: (id: string) => void;
  };
}) {
  const border =
    accent === 'accent'
      ? 'border-[var(--cromo-accent)]/40'
      : 'border-[var(--cromo-success)]/40';
  const actionColor =
    accent === 'accent' ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-success-text)]';
  const actionHover =
    accent === 'accent' ? 'hover:bg-[var(--cromo-accent-soft)]' : 'hover:bg-[var(--cromo-success-soft)]';

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border ${border} bg-[var(--cromo-surface)] pl-1.5 pr-1 py-1 shrink-0 max-w-full`}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full border shrink-0 ${variantSwatch(variantType)}`}
        title={variantLabel(variantType)}
      />
      {fifaCode && flagUrl(fifaCode) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagUrl(fifaCode)!}
          alt={fifaCode}
          className="shrink-0 w-4 h-3 object-cover rounded-sm"
        />
      )}
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-xs font-semibold text-[var(--cromo-fg)] tabular-nums">
          {albumCode}
        </span>
        {playerName && (
          <span className="text-[10px] text-[var(--cromo-fg-muted)] truncate max-w-[7rem]">
            {playerName}
          </span>
        )}
      </div>

      {variantSelect && (
        <select
          value={variantSelect.value}
          onChange={(e) => variantSelect.onChange(e.target.value)}
          aria-label={`${albumCode} variant`}
          className="rounded border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-1 py-0.5 text-[10px] text-[var(--cromo-fg)] focus:outline-none max-w-[7rem]"
        >
          {variantSelect.options.map((v) => (
            <option key={v.id} value={v.id}>
              {variantLabel(v.type)}
            </option>
          ))}
        </select>
      )}

      {suggested && (
        <span
          className={`shrink-0 text-[9px] font-medium border px-1 py-px rounded leading-none uppercase tracking-wider ${
            accent === 'accent'
              ? 'text-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] border-[var(--cromo-accent)]/30'
              : 'text-[var(--cromo-tier-very-rare)] bg-[var(--cromo-tier-very-rare-soft)] border-[var(--cromo-tier-very-rare)]/30'
          }`}
        >
          {suggested}
        </span>
      )}

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onDecrement}
          disabled={quantity <= minQty}
          aria-label="Decrease quantity"
          className={`w-11 h-11 md:w-6 md:h-6 flex items-center justify-center rounded text-base md:text-sm font-bold ${actionColor} ${actionHover} disabled:opacity-30 transition-colors active:scale-95 md:active:scale-100`}
        >
          −
        </button>
        <span className="w-7 text-center text-xs font-semibold text-[var(--cromo-fg)] tabular-nums">
          ×{quantity}
        </span>
        <button
          onClick={onIncrement}
          disabled={quantity >= maxQty}
          aria-label="Increase quantity"
          className={`w-11 h-11 md:w-6 md:h-6 flex items-center justify-center rounded text-base md:text-sm font-bold ${actionColor} ${actionHover} disabled:opacity-30 transition-colors active:scale-95 md:active:scale-100`}
        >
          +
        </button>
      </div>

      <button
        onClick={onRemove}
        aria-label={`Remove ${albumCode}`}
        className="shrink-0 w-11 h-11 md:w-6 md:h-6 flex items-center justify-center rounded text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-surface-2)] transition-colors text-lg md:text-base leading-none"
      >
        ×
      </button>
    </div>
  );
}
