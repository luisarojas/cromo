'use client';

import type { Sticker } from '@/lib/api';

interface Props {
  sticker: Sticker;
  owned?: boolean;
  quantity?: number;
  onAdd?: () => void;
  onRemove?: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  player: 'bg-blue-100 text-blue-700',
  badge: 'bg-purple-100 text-purple-700',
  team_photo: 'bg-yellow-100 text-yellow-700',
  intro: 'bg-teal-100 text-teal-700',
  museum: 'bg-orange-100 text-orange-700',
};

export default function StickerCard({
  sticker,
  owned = false,
  quantity,
  onAdd,
  onRemove,
}: Props) {
  const typeColor =
    TYPE_COLORS[sticker.sticker_type] ?? 'bg-gray-100 text-gray-600';

  return (
    <div
      className={`
        group relative flex flex-col rounded-lg border p-2.5 text-sm
        transition-all duration-150 cursor-default select-none
        ${
          owned
            ? 'border-green-400 bg-green-50 shadow-sm'
            : 'border-gray-200 bg-white opacity-60 hover:opacity-100 hover:border-gray-400'
        }
      `}
    >
      {/* Foil indicator */}
      {sticker.is_foil && (
        <span
          className="absolute top-1.5 right-1.5 text-xs"
          title="Foil sticker"
        >
          ✨
        </span>
      )}

      {/* Quantity badge (owned) */}
      {owned && quantity !== undefined && quantity > 1 && (
        <span className="absolute top-1.5 left-1.5 rounded-full bg-green-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center">
          {quantity > 9 ? '9+' : quantity}
        </span>
      )}

      {/* Album code — large */}
      <div className="text-lg font-extrabold text-gray-800 leading-none mb-1 mt-0.5">
        {sticker.album_code}
      </div>

      {/* Player name */}
      <div className="text-xs font-medium text-gray-700 truncate leading-tight mb-1">
        {sticker.player_name ?? sticker.team_name ?? '—'}
      </div>

      {/* Team */}
      {sticker.team_name && sticker.player_name && (
        <div className="text-[10px] text-gray-500 truncate leading-tight mb-1">
          {sticker.fifa_code ?? sticker.team_name}
        </div>
      )}

      {/* Type badge */}
      <span
        className={`inline-block self-start rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColor}`}
      >
        {sticker.sticker_type.replace('_', ' ')}
      </span>

      {/* Action buttons — shown on hover */}
      <div className="mt-2 flex gap-1">
        {owned ? (
          <button
            onClick={onRemove}
            className="flex-1 rounded bg-red-100 text-red-600 text-xs py-0.5 font-medium hover:bg-red-200 transition-colors opacity-0 group-hover:opacity-100"
            title="Remove from collection"
          >
            Remove
          </button>
        ) : (
          <button
            onClick={onAdd}
            className="flex-1 rounded bg-blue-100 text-blue-600 text-xs py-0.5 font-medium hover:bg-blue-200 transition-colors opacity-0 group-hover:opacity-100"
            title="Add to collection"
          >
            + Add
          </button>
        )}
      </div>
    </div>
  );
}
