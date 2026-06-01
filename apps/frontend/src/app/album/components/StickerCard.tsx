'use client';

import type { Sticker } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
import { HeartIcon } from '@/components/HeartIcon';
import { variantRarity, variantShort, variantSwatch } from './variantMeta';
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
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (shiftKey: boolean) => void;
}

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
  selectionMode,
  isSelected,
  onToggleSelect,
}: Props) {
  const typeColor =
    TYPE_COLORS[sticker.stickerType] ?? 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]';

  const ownedEntries = ownedVariants ? Array.from(ownedVariants.entries()) : [];
  const owned = ownedEntries.length > 0;
  const totalQuantity = ownedEntries.reduce((sum, [, e]) => sum + e.quantity, 0);

  return (
    <button
      type="button"
      onClick={(e) => {
        if (selectionMode && onToggleSelect) {
          onToggleSelect(e.shiftKey);
        } else {
          onOpenPopover(e.currentTarget);
        }
      }}
      className={`
        group relative flex flex-col rounded-lg border p-2.5 text-sm text-left
        transition-all duration-150 select-none w-full
        ${
          selectionMode && isSelected
            ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] ring-2 ring-blue-200'
            : owned
              ? 'border-green-400 bg-[var(--cromo-success-soft)] hover:border-[var(--cromo-border-strong)]'
              : 'border-[var(--cromo-border)] bg-[var(--cromo-surface)] opacity-70 hover:opacity-100 hover:border-[var(--cromo-border-strong)]'
        }
      `}
    >
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
