'use client';

import { useRef, useState } from 'react';
import type { Sticker } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { HeartIcon } from '@/components/HeartIcon';
import { compareVariantTypes, variantRarity, variantShort, variantSwatch } from './variantMeta';
import type { OwnedVariantEntry } from './VariantPopover';

interface Props {
  sticker: Sticker;
  ownedVariants?: Map<string, OwnedVariantEntry>;
  // album names that are missing this sticker (need it)
  crossAlbumNeededBy?: string[];
  // album names that have extras of this sticker (can give)
  crossAlbumAvailableIn?: string[];
  isFavourited?: boolean;
  onToggleFavourite?: () => void;
  onOpenPopover: (anchor: HTMLElement) => void;
  // Horizontal swipe shortcut. Right = +1 default Base, Left = -1 first owned.
  // Undefined when the parent doesn't want gestures (e.g. selection mode).
  onSwipeAdjust?: (direction: 'left' | 'right') => void;
  // Fires after a sustained press (~500ms) with no significant movement.
  // Caller decides what it means in context — entering selection mode for an
  // owned sticker, adding to wishlist for an unowned one.
  onLongPress?: () => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (shiftKey: boolean) => void;
}

const LONG_PRESS_MS = 480;
const LONG_PRESS_TOLERANCE_PX = 8;

// Pixels of horizontal travel before a swipe commits. Below threshold the
// card snaps back without firing — keeps accidental drags inert.
const SWIPE_THRESHOLD = 60;
// Cap the visual translate so the card doesn't fly across the grid.
const SWIPE_MAX = 90;

const TYPE_COLORS: Record<string, string> = {
  player: 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]',
  badge: 'bg-[var(--cromo-tier-very-rare-soft)] text-[var(--cromo-tier-very-rare)]',
  team_photo: 'bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)]',
  intro: 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]',
  coca_cola_special: 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)]',
  extra: 'bg-pink-100 text-pink-600',
};

export default function StickerCard({
  sticker,
  ownedVariants,
  crossAlbumNeededBy,
  crossAlbumAvailableIn,
  isFavourited,
  onToggleFavourite,
  onOpenPopover,
  onSwipeAdjust,
  onLongPress,
  selectionMode,
  isSelected,
  onToggleSelect,
}: Props) {
  const typeColor =
    TYPE_COLORS[sticker.stickerType] ?? 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]';

  const ownedEntries = ownedVariants
    ? Array.from(ownedVariants.entries()).sort(([a], [b]) => compareVariantTypes(a, b))
    : [];
  const owned = ownedEntries.length > 0;
  const totalQuantity = ownedEntries.reduce((sum, [, e]) => sum + e.quantity, 0);

  // Touch-driven swipe. We capture the start X on touchstart, track dx while
  // moving, suppress the synthetic click if the gesture commits, and hand the
  // direction back to the parent. Vertical drags (|dy| > |dx|) bail out so the
  // user can still scroll the list past a card without accidentally toggling.
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const committedRef = useRef(false);
  // A long-press timer that's armed on touchstart and disarmed by movement,
  // touchend, or commit. We treat the fire as the click-suppressing event
  // (same channel as a committed swipe) so the popover doesn't *also* open.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragX, setDragX] = useState(0);
  const gesturesEnabled = !!onSwipeAdjust && !selectionMode;
  const longPressEnabled = !!onLongPress && !selectionMode;

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]!;
    if (gesturesEnabled || longPressEnabled) {
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      committedRef.current = false;
    }
    if (longPressEnabled) {
      cancelLongPress();
      longPressTimerRef.current = setTimeout(() => {
        committedRef.current = true;
        onLongPress?.();
      }, LONG_PRESS_MS);
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!startRef.current) return;
    const t = e.touches[0]!;
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    // Any meaningful movement cancels a pending long-press.
    if (Math.abs(dx) > LONG_PRESS_TOLERANCE_PX || Math.abs(dy) > LONG_PRESS_TOLERANCE_PX) {
      cancelLongPress();
    }
    if (!gesturesEnabled) return;
    if (Math.abs(dy) > Math.abs(dx)) {
      // vertical scroll wins — abandon the swipe.
      startRef.current = null;
      setDragX(0);
      return;
    }
    setDragX(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx)));
  }
  function onTouchEnd() {
    cancelLongPress();
    if (!startRef.current) {
      setDragX(0);
      return;
    }
    if (gesturesEnabled && dragX >= SWIPE_THRESHOLD) {
      committedRef.current = true;
      onSwipeAdjust?.('right');
    } else if (gesturesEnabled && dragX <= -SWIPE_THRESHOLD) {
      committedRef.current = true;
      onSwipeAdjust?.('left');
    }
    startRef.current = null;
    setDragX(0);
  }

  const swipeIntent = dragX > 10 ? 'add' : dragX < -10 ? 'remove' : null;

  return (
    <button
      type="button"
      onClick={(e) => {
        // If a swipe just committed, swallow the click so the popover doesn't open.
        if (committedRef.current) {
          committedRef.current = false;
          e.preventDefault();
          return;
        }
        if (selectionMode && onToggleSelect) {
          onToggleSelect(e.shiftKey);
        } else {
          onOpenPopover(e.currentTarget);
        }
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { cancelLongPress(); startRef.current = null; setDragX(0); }}
      style={dragX !== 0 ? { transform: `translateX(${dragX}px)`, transition: 'none' } : undefined}
      className={`
        group relative flex flex-col rounded-lg border p-2.5 text-sm text-left
        transition-all duration-150 select-none w-full touch-pan-y
        ${
          selectionMode && isSelected
            ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] ring-2 ring-blue-200'
            : swipeIntent === 'add'
              ? 'border-[var(--cromo-success)] bg-[var(--cromo-success-soft)]'
              : swipeIntent === 'remove'
                ? 'border-[var(--cromo-danger)] bg-[var(--cromo-danger-soft)]'
                : owned
                  ? 'border-green-400 bg-[var(--cromo-success-soft)] hover:border-[var(--cromo-border-strong)]'
                  : 'border-[var(--cromo-border)] bg-[var(--cromo-surface)] opacity-70 hover:opacity-100 hover:border-[var(--cromo-border-strong)]'
        }
      `}
    >
      {/* Swipe affordance: subtle arrow on the inactive edge once a swipe is underway. */}
      {swipeIntent === 'add' && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1 flex items-center text-[var(--cromo-success-text)] text-base font-bold">+1</span>
      )}
      {swipeIntent === 'remove' && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[var(--cromo-danger-text)] text-base font-bold">−1</span>
      )}
      {sticker.isFoil && (
        <span
          className="absolute top-1.5 right-1.5 text-xs"
          title="Foil sticker"
        >
          ✨
        </span>
      )}

      {/* Selection checkbox (selection mode) */}
      {selectionMode ? (
        <span
          className={`absolute top-1.5 left-1.5 flex items-center justify-center w-4.5 h-4.5 rounded border-2 transition-colors ${
            isSelected ? 'bg-[var(--cromo-accent)] border-[var(--cromo-accent)]' : 'bg-[var(--cromo-surface)] border-[var(--cromo-border-strong)]'
          }`}
          style={{ width: '18px', height: '18px' }}
        >
          {isSelected && (
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      ) : (
        /* Total quantity badge */
        owned && totalQuantity > 1 && (
          <span
            className="absolute top-1.5 left-1.5 rounded-full bg-[var(--cromo-success)] text-[var(--cromo-success-fg)] text-[10px] font-bold w-4 h-4 flex items-center justify-center"
            title={`${totalQuantity} total across variants`}
          >
            {totalQuantity > 9 ? '9+' : totalQuantity}
          </span>
        )
      )}

      <div
        className={`flex items-center gap-1.5 mt-0.5 ${
          sticker.playerName && sticker.teamName ? '' : 'mb-1'
        }`}
      >
        <span className="text-lg font-extrabold text-[var(--cromo-fg)] leading-none">
          {sticker.albumCode}
        </span>
        {sticker.fifaCode && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flagUrl(sticker.fifaCode) ?? undefined}
            alt={sticker.fifaCode}
            width={20}
            height={14}
            className="rounded-[2px] object-cover flex-shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>

      {sticker.playerName && sticker.teamName && (
        <div className="text-[10px] text-[var(--cromo-fg-subtle)] truncate leading-tight mb-1">
          {sticker.teamName}
        </div>
      )}
      <div className="text-xs font-medium text-[var(--cromo-fg)] truncate leading-tight mb-1">
        {sticker.playerName ?? sticker.teamName ?? '—'}
      </div>

      <span
        className={`mt-2 inline-block self-start rounded-full px-1.5 py-px text-[9px] font-medium uppercase ${typeColor}`}
      >
        {(sticker.stickerType ?? '').replace('_', ' ')}
      </span>

      {/* Owned-variant chips */}
      {owned && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ownedEntries.map(([variantType, entry]) => (
            <span
              key={variantType}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--cromo-surface)] border border-[var(--cromo-border)] px-1.5 py-0.5 text-[10px] text-[var(--cromo-fg)]"
              title={variantRarity(variantType)}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full border border-[var(--cromo-border-strong)] ${variantSwatch(variantType)}`}
                aria-hidden
              />
              <span>
                {variantShort(variantType)}
                {entry.quantity > 1 && ` ×${entry.quantity}`}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Cross-album indicators */}
      {(crossAlbumNeededBy?.length || crossAlbumAvailableIn?.length) ? (
        <div className="mt-1.5 flex gap-1 flex-wrap">
          {crossAlbumNeededBy?.map((name) => (
            <span
              key={`need-${name}`}
              title={`"${name}" needs this sticker`}
              className="inline-block rounded-full bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)] text-[9px] font-semibold px-1.5 py-0.5 leading-none"
            >
              ↓ {name}
            </span>
          ))}
          {crossAlbumAvailableIn?.map((name) => (
            <span
              key={`avail-${name}`}
              title={`"${name}" has extra copies`}
              className="inline-block rounded-full bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)] text-[9px] font-semibold px-1.5 py-0.5 leading-none"
            >
              ↑ {name}
            </span>
          ))}
        </div>
      ) : null}

      {/* Action hint */}
      <div className="mt-2 text-[10px] text-[var(--cromo-fg-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
        {owned ? 'Click to manage variants' : 'Click to add'}
      </div>

      {/* Favourite button — hidden in selection mode */}
      {onToggleFavourite && !selectionMode && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavourite();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onToggleFavourite();
            }
          }}
          className={`absolute bottom-1.5 right-1.5 transition-all cursor-pointer ${
            isFavourited
              ? 'text-[var(--cromo-danger-text)] opacity-100'
              : 'text-[var(--cromo-fg-subtle)] opacity-0 group-hover:opacity-100 hover:text-[var(--cromo-danger-text)]'
          }`}
          title={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          aria-pressed={isFavourited}
        >
          <HeartIcon filled={isFavourited} className="w-3.5 h-3.5" />
        </span>
      )}
    </button>
  );
}
