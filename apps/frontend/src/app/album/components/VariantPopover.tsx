'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchStickerVariants, type Sticker, type StickerVariant } from '@/lib/api';
import { VARIANT_META, variantLabel, variantSwatch } from './variantMeta';

export interface OwnedVariantEntry {
  variantId: string;
  quantity: number;
}

interface Props {
  sticker: Sticker;
  ownedVariants: Map<string, OwnedVariantEntry>; // keyed by variant_type
  anchorRect: DOMRect;
  token: string;
  onClose: () => void;
  onAdjust: (variantId: string, variantType: string, delta: 1 | -1) => Promise<void>;
  onAddNew: (variantId: string, variantType: string) => Promise<void>;
}

const POPOVER_WIDTH = 280;

export default function VariantPopover({
  sticker,
  ownedVariants,
  anchorRect,
  token,
  onClose,
  onAdjust,
  onAddNew,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [allVariants, setAllVariants] = useState<StickerVariant[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // Position the popover near the anchor, clamped to the viewport
  const top = Math.min(
    anchorRect.bottom + 6,
    window.innerHeight - 8,
  );
  const left = Math.min(
    Math.max(8, anchorRect.left),
    window.innerWidth - POPOVER_WIDTH - 8,
  );

  const ownedEntries = Array.from(ownedVariants.entries()); // [variantType, entry]

  async function openAddPicker() {
    setShowAddPicker(true);
    if (allVariants !== null) return;
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

  const unownedVariants = (allVariants ?? []).filter(
    (v) => !ownedVariants.has(v.variant_type),
  );

  const node = (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Manage variants for sticker ${sticker.album_code}`}
      className="fixed z-50 rounded-xl border border-gray-200 bg-white shadow-xl p-3 flex flex-col gap-2"
      style={{ top, left, width: POPOVER_WIDTH }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-800">
            {sticker.album_code}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {sticker.player_name ?? sticker.team_name ?? '—'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="h-px bg-gray-100" />

      {/* Owned variants */}
      {ownedEntries.length === 0 ? (
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
      )}

      <div className="h-px bg-gray-100" />

      {/* Add other variant */}
      {!showAddPicker ? (
        <button
          onClick={openAddPicker}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 self-start"
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
                {v.availability}
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
