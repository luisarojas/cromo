'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchStickerVariants, type Sticker, type StickerVariant } from '@/lib/api';
import { VARIANT_META, variantLabel, variantRarity, variantSwatch } from './variantMeta';
import {
  getTeamPages,
  formatPageSpread,
  COCA_COLA_LOCATION,
  EDITION_LABELS,
  type AlbumEdition,
} from '@/lib/albumPages';
import { useAlbumsStore } from '@/store/albums';
import { albumDisplayName } from '@/lib/api';

export interface OwnedVariantEntry {
  variantId: string;
  quantity: number;
}

interface Props {
  sticker: Sticker;
  ownedVariants: Map<string, OwnedVariantEntry>; // keyed by variant_type
  anchorRect: DOMRect;
  albumId: string;
  token: string;
  onClose: () => void;
  onAdjust: (variantId: string, variantType: string, delta: 1 | -1) => Promise<void>;
  onAddNew: (variantId: string, variantType: string) => Promise<void>;
  onMove: (variantId: string, targetAlbumId: string, quantity: number) => Promise<void>;
  onMoveFrom: (variantId: string, sourceAlbumId: string, quantity: number) => Promise<void>;
  albumsWithSticker?: Array<{ id: string; name: string }>;
}

const POPOVER_WIDTH = 280;

export default function VariantPopover({
  sticker,
  ownedVariants,
  anchorRect,
  albumId,
  token,
  onClose,
  onAdjust,
  onAddNew,
  onMove,
  onMoveFrom,
  albumsWithSticker,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [allVariants, setAllVariants] = useState<StickerVariant[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [moveVariantId, setMoveVariantId] = useState<string | null>(null);
  const [moveTargetAlbumId, setMoveTargetAlbumId] = useState<string>('');
  const [moveQuantity, setMoveQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showMoveFromPicker, setShowMoveFromPicker] = useState(false);
  const [moveFromSourceAlbumId, setMoveFromSourceAlbumId] = useState<string>('');
  const [moveFromVariantId, setMoveFromVariantId] = useState<string>('');
  const [moveFromQuantity, setMoveFromQuantity] = useState(1);

  const albums = useAlbumsStore((s) => s.albums);
  const albumEdition = (albums.find((a) => a.id === albumId)?.edition ?? 'north_america') as AlbumEdition;
  const otherAlbums = albums.filter((a) => a.id !== albumId);

  const pageLocation = (() => {
    if (sticker.sticker_type === 'coca_cola') {
      const loc = COCA_COLA_LOCATION[albumEdition];
      return loc.type === 'numbered'
        ? formatPageSpread(loc.pages)
        : loc.description;
    }
    const spread = getTeamPages(sticker.team_name, albumEdition);
    return spread ? formatPageSpread(spread) : null;
  })();

  // Fetch all variants on mount so we can hide the "Add another variant" button
  // immediately when the user already owns every available variant.
  useEffect(() => {
    async function load() {
      setLoadingVariants(true);
      try {
        const items = await fetchStickerVariants(sticker.album_code, token);
        setAllVariants(items);
      } catch (err) {
        console.error('Failed to fetch variants', err);
      } finally {
        setLoadingVariants(false);
      }
    }
    load();
  }, [sticker.album_code, token]);

  // Close on outside click / Esc
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Position the popover near the anchor, flipping above when space below is tight
  const spaceBelow = window.innerHeight - anchorRect.bottom - 14;
  const spaceAbove = anchorRect.top - 14;
  const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
  const maxPopoverHeight = Math.max(showAbove ? spaceAbove : spaceBelow, 150);

  const posStyle = showAbove
    ? { bottom: window.innerHeight - anchorRect.top + 6, top: 'auto' as const }
    : { top: anchorRect.bottom + 6, bottom: 'auto' as const };

  const left = Math.min(
    Math.max(8, anchorRect.left),
    window.innerWidth - POPOVER_WIDTH - 8,
  );

  const ownedEntries = Array.from(ownedVariants.entries()); // [variantType, entry]

  function openAddPicker() {
    setShowAddPicker(true);
  }

  async function handleAdjust(variantId: string, variantType: string, delta: 1 | -1) {
    if (busy) return;
    setBusy(true);
    try {
      await onAdjust(variantId, variantType, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNew(variantId: string, variantType: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onAddNew(variantId, variantType);
      setShowAddPicker(false);
    } finally {
      setBusy(false);
    }
  }

  function openMovePicker(variantId: string) {
    setMoveVariantId(variantId);
    setMoveTargetAlbumId(otherAlbums[0]?.id ?? '');
    setMoveQuantity(1);
    setShowMovePicker(true);
  }

  async function handleMove() {
    if (!moveVariantId || !moveTargetAlbumId || busy) return;
    setBusy(true);
    try {
      await onMove(moveVariantId, moveTargetAlbumId, moveQuantity);
      setShowMovePicker(false);
      setMoveVariantId(null);
    } finally {
      setBusy(false);
    }
  }

  function openMoveFromPicker() {
    setMoveFromSourceAlbumId(albumsWithSticker?.[0]?.id ?? '');
    setMoveFromVariantId(allVariants?.[0]?.id ?? '');
    setMoveFromQuantity(1);
    setShowMoveFromPicker(true);
  }

  async function handleMoveFrom() {
    if (!moveFromVariantId || !moveFromSourceAlbumId || busy) return;
    setBusy(true);
    try {
      await onMoveFrom(moveFromVariantId, moveFromSourceAlbumId, moveFromQuantity);
      setShowMoveFromPicker(false);
    } finally {
      setBusy(false);
    }
  }

  const unownedVariants = (allVariants ?? []).filter(
    (v) => !ownedVariants.has(v.variant_type),
  );

  const node = (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Manage variants for sticker ${sticker.album_code}`}
      className="fixed z-50 rounded-xl border border-gray-200 bg-white shadow-xl p-3 flex flex-col gap-2 overflow-y-auto"
      style={{ ...posStyle, left, width: POPOVER_WIDTH, maxHeight: maxPopoverHeight }}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-800">
            {sticker.album_code}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {sticker.player_name ?? sticker.team_name ?? '—'}
          </div>
          {pageLocation && (
            <div className="mt-1 flex items-center gap-1">
              <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 tabular-nums">
                {pageLocation}
              </span>
              <span className="text-[10px] text-gray-400">
                {EDITION_LABELS[albumEdition]}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1 shrink-0 ml-2"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="h-px bg-gray-100" />

      {/* Owned variants */}
      {!showMovePicker && !showMoveFromPicker && (ownedEntries.length === 0 ? (
        <div className="text-xs text-gray-500 italic py-1">
          You don&apos;t own any variants of this sticker yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ownedEntries.map(([variantType, entry]) => (
            <li
              key={variantType}
              className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5"
            >
              <span
                className={`inline-block w-3 h-3 rounded-full border border-gray-300 ${variantSwatch(variantType)}`}
                aria-hidden
              />
              <span className="flex-1 text-xs font-medium text-gray-700 truncate">
                {variantLabel(variantType)}
              </span>
              <span className="text-xs font-semibold text-gray-800 tabular-nums w-5 text-right">
                ×{entry.quantity}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => handleAdjust(entry.variantId, variantType, -1)}
                  disabled={busy}
                  className="w-6 h-6 rounded bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 text-sm font-bold leading-none"
                  aria-label={`Remove one ${variantLabel(variantType)}`}
                  title="Remove one"
                >
                  −
                </button>
                <button
                  onClick={() => handleAdjust(entry.variantId, variantType, 1)}
                  disabled={busy}
                  className="w-6 h-6 rounded bg-blue-100 text-blue-600 hover:bg-blue-200 disabled:opacity-50 text-sm font-bold leading-none"
                  aria-label={`Add one ${variantLabel(variantType)}`}
                  title="Add one"
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
      ))}

      {!showMovePicker && !showMoveFromPicker && <div className="h-px bg-gray-100" />}

      {/* Move to / from another album */}
      {otherAlbums.length > 0 && (ownedEntries.length > 0 || (albumsWithSticker && albumsWithSticker.length > 0)) && (
        <>
          {showMovePicker ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-gray-700">Move to another album</div>

              {ownedEntries.length > 1 && (
                <select
                  value={moveVariantId ?? ''}
                  onChange={(e) => setMoveVariantId(e.target.value)}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none"
                >
                  {ownedEntries.map(([vt, entry]) => (
                    <option key={entry.variantId} value={entry.variantId}>
                      {variantLabel(vt)} (×{entry.quantity})
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 shrink-0">To</label>
                <select
                  value={moveTargetAlbumId}
                  onChange={(e) => setMoveTargetAlbumId(e.target.value)}
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none"
                >
                  {otherAlbums.map((a) => (
                    <option key={a.id} value={a.id}>{albumDisplayName(a)}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 shrink-0">Qty</label>
                <input
                  type="number"
                  min={1}
                  max={
                    ownedEntries.find(([, e]) => e.variantId === moveVariantId)?.[1].quantity ?? 1
                  }
                  value={moveQuantity}
                  onChange={(e) => setMoveQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleMove}
                  disabled={busy || !moveTargetAlbumId}
                  className="flex-1 rounded-md bg-violet-600 text-white text-xs font-medium py-1.5 hover:bg-violet-700 disabled:opacity-50"
                >
                  {busy ? 'Moving…' : 'Move'}
                </button>
                <button
                  onClick={() => setShowMovePicker(false)}
                  disabled={busy}
                  className="px-3 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : showMoveFromPicker ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-gray-700">Move from another album</div>

              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 shrink-0">From</label>
                <select
                  value={moveFromSourceAlbumId}
                  onChange={(e) => setMoveFromSourceAlbumId(e.target.value)}
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none"
                >
                  {(albumsWithSticker ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {allVariants && allVariants.length > 1 && (
                <select
                  value={moveFromVariantId}
                  onChange={(e) => setMoveFromVariantId(e.target.value)}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none"
                >
                  {allVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {variantLabel(v.variant_type)}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 shrink-0">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={moveFromQuantity}
                  onChange={(e) => setMoveFromQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleMoveFrom}
                  disabled={busy || !moveFromSourceAlbumId || !moveFromVariantId}
                  className="flex-1 rounded-md bg-violet-600 text-white text-xs font-medium py-1.5 hover:bg-violet-700 disabled:opacity-50"
                >
                  {busy ? 'Moving…' : 'Move'}
                </button>
                <button
                  onClick={() => setShowMoveFromPicker(false)}
                  disabled={busy}
                  className="px-3 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {ownedEntries.length > 0 && (
                <button
                  onClick={() => openMovePicker(ownedEntries[0]![1].variantId)}
                  className="text-xs font-medium text-violet-600 hover:text-violet-700 self-start"
                >
                  ↗ Move to another album
                </button>
              )}
              {albumsWithSticker && albumsWithSticker.length > 0 && (
                <button
                  onClick={openMoveFromPicker}
                  disabled={loadingVariants}
                  className="text-xs font-medium text-violet-600 hover:text-violet-700 self-start disabled:opacity-50"
                >
                  ↙ Move from another album
                </button>
              )}
            </div>
          )}
          <div className="h-px bg-gray-100" />
        </>
      )}

      {/* Add other variant */}
      {!showAddPicker && !loadingVariants && unownedVariants.length === 0 ? null :
      !showAddPicker ? (
        <button
          onClick={openAddPicker}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 self-start"
          disabled={loadingVariants}
        >
          + Add other variant
        </button>
      ) : loadingVariants ? (
        <div className="text-xs text-gray-400">Loading variants…</div>
      ) : unownedVariants.length === 0 ? (
        <div className="text-xs text-gray-500 italic">
          You already own every variant of this sticker.
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {unownedVariants.map((v) => (
            <button
              key={v.id}
              onClick={() => handleAddNew(v.id, v.variant_type)}
              disabled={busy}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-blue-50 disabled:opacity-50 text-left"
            >
              <span
                className={`inline-block w-3 h-3 rounded-full border border-gray-300 ${variantSwatch(v.variant_type)}`}
                aria-hidden
              />
              <span className="flex-1 text-xs text-gray-700 truncate">
                {VARIANT_META[v.variant_type]?.label ?? v.variant_type}
              </span>
              <span className="text-[10px] text-gray-400">
                {variantRarity(v.variant_type)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
