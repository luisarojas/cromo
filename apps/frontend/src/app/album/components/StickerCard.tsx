'use client';

import type { Sticker } from '@/lib/api';
import { flagUrl } from '@/lib/flags';
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
}

const TYPE_COLORS: Record<string, string> = {
  player: 'bg-blue-100 text-blue-700',
  badge: 'bg-purple-100 text-purple-700',
  team_photo: 'bg-yellow-100 text-yellow-700',
  intro: 'bg-teal-100 text-teal-700',
  museum: 'bg-orange-100 text-orange-700',
  coca_cola_special: 'bg-red-100 text-red-700',
  extra: 'bg-pink-100 text-pink-700',
};

export default function StickerCard({
  sticker,
  ownedVariants,
  crossAlbumNeededBy,
  crossAlbumAvailableIn,
  isFavourited,
  onToggleFavourite,
  onOpenPopover,
}: Props) {
  const typeColor =
    TYPE_COLORS[sticker.sticker_type] ?? 'bg-gray-100 text-gray-600';

  const ownedEntries = ownedVariants ? Array.from(ownedVariants.entries()) : [];
  const owned = ownedEntries.length > 0;
  const totalQuantity = ownedEntries.reduce((sum, [, e]) => sum + e.quantity, 0);

  return (
    <button
      type="button"
      onClick={(e) => onOpenPopover(e.currentTarget)}
      className={`
        group relative flex flex-col rounded-lg border p-2.5 text-sm text-left
        transition-all duration-150 select-none w-full
        ${
          owned
            ? 'border-green-400 bg-green-50 shadow-sm hover:shadow-md'
            : 'border-gray-200 bg-white opacity-70 hover:opacity-100 hover:border-gray-400'
        }
      `}
    >
      {sticker.is_foil && (
        <span
          className="absolute top-1.5 right-1.5 text-xs"
          title="Foil sticker"
        >
          ✨
        </span>
      )}

      {/* Total quantity badge */}
      {owned && totalQuantity > 1 && (
        <span
          className="absolute top-1.5 left-1.5 rounded-full bg-green-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center"
          title={`${totalQuantity} total across variants`}
        >
          {totalQuantity > 9 ? '9+' : totalQuantity}
        </span>
      )}

      <div className="text-lg font-extrabold text-gray-800 leading-none mb-1 mt-0.5">
        {sticker.album_code}
      </div>

      <div className="text-xs font-medium text-gray-700 truncate leading-tight mb-1">
        {sticker.player_name ?? sticker.team_name ?? '—'}
      </div>

      {sticker.fifa_code && (
        <div className="flex items-center gap-1 mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={flagUrl(sticker.fifa_code) ?? undefined}
            alt={sticker.fifa_code}
            width={20}
            height={14}
            className="rounded-[2px] object-cover flex-shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          {sticker.player_name && (
            <span className="text-[10px] text-gray-500 truncate leading-tight">
              {sticker.fifa_code}
            </span>
          )}
        </div>
      )}

      <span
        className={`inline-block self-start rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColor}`}
      >
        {(sticker.sticker_type ?? '').replace('_', ' ')}
      </span>

      {/* Owned-variant chips */}
      {owned && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ownedEntries.map(([variantType, entry]) => (
            <span
              key={variantType}
              className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700"
              title={variantRarity(variantType)}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full border border-gray-300 ${variantSwatch(variantType)}`}
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
              className="inline-block rounded-full bg-amber-100 text-amber-700 text-[9px] font-semibold px-1.5 py-0.5 leading-none"
            >
              ↓ {name}
            </span>
          ))}
          {crossAlbumAvailableIn?.map((name) => (
            <span
              key={`avail-${name}`}
              title={`"${name}" has extra copies`}
              className="inline-block rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold px-1.5 py-0.5 leading-none"
            >
              ↑ {name}
            </span>
          ))}
        </div>
      ) : null}

      {/* Action hint */}
      <div className="mt-2 text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        {owned ? 'Click to manage variants' : 'Click to add'}
      </div>

      {/* Favourite button */}
      {onToggleFavourite && (
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
              ? 'text-red-500 opacity-100'
              : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-400'
          }`}
          title={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          aria-pressed={isFavourited}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill={isFavourited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isFavourited ? 0 : 1.5}>
            <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
          </svg>
        </span>
      )}
    </button>
  );
}
