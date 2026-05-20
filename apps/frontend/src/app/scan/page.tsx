'use client';

import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  scanIdentify,
  scanBatch,
  fetchStickerByAlbumCode,
  fetchStickerVariants,
  addSticker,
  type ScanResult,
  type BatchScanEntry,
  type Sticker,
  type StickerVariant,
} from '@/lib/api';

// ─── Confidence helpers ───────────────────────────────────────────────────────

type ConfidenceTier = 'high' | 'medium' | 'low';

function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.60) return 'medium';
  return 'low';
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const tier = confidenceTier(confidence);
  const pct = Math.round(confidence * 100);
  const cls =
    tier === 'high' ? 'bg-green-100 text-green-700 border-green-200'
    : tier === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${cls}`}>
      {pct}% confidence
    </span>
  );
}

// ─── Single scan state ────────────────────────────────────────────────────────

interface ScanState {
  status: 'idle' | 'scanning' | 'done' | 'error';
  result?: ScanResult;
  sticker?: Sticker;
  variants?: StickerVariant[];
  selectedVariantId?: string;
  error?: string;
  added?: boolean;
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({
  onFiles,
  multiple,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFiles(Array.from(files));
    },
    [onFiles],
  );

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
        dragging
          ? 'border-blue-400 bg-blue-50'
          : disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          : 'border-gray-300 bg-white hover:border-blue-300 hover:bg-blue-50'
      }`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <div className="text-4xl mb-3">📷</div>
      <p className="text-sm font-medium text-gray-700">
        {multiple ? 'Drop sticker images here' : 'Drop a sticker image here'}
      </p>
      <p className="text-xs text-gray-400 mt-1">or click to browse — JPEG, PNG, or WebP, max 10 MB</p>
    </div>
  );
}

// ─── Single scan result panel ─────────────────────────────────────────────────

function ScanResultPanel({
  state,
  onVariantChange,
  onAddToCollection,
}: {
  state: ScanState;
  onVariantChange: (variantId: string) => void;
  onAddToCollection: () => void;
}) {
  if (state.status === 'scanning') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
        <span className="animate-spin">⏳</span> Identifying sticker…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-4">
        {state.error ?? 'Failed to identify sticker. Please try again.'}
      </div>
    );
  }

  if (state.status !== 'done' || !state.result) return null;

  const { result, sticker, variants, selectedVariantId, added } = state;
  const tier = confidenceTier(result.confidence);

  return (
    <div className="mt-4 space-y-4">
      {/* Identification result */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-sm">Identified Sticker</h3>
          <ConfidenceBadge confidence={result.confidence} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {result.albumCode && (
            <>
              <dt className="text-gray-500">Album code</dt>
              <dd className="font-mono font-medium text-gray-800">{result.albumCode}</dd>
            </>
          )}
          {result.stickerNumber !== null && (
            <>
              <dt className="text-gray-500">Sticker #</dt>
              <dd className="font-medium text-gray-800">{result.stickerNumber}</dd>
            </>
          )}
          {result.playerName && (
            <>
              <dt className="text-gray-500">Player</dt>
              <dd className="text-gray-800">{result.playerName}</dd>
            </>
          )}
          {result.teamFifaCode && (
            <>
              <dt className="text-gray-500">Team</dt>
              <dd className="font-mono text-gray-800">{result.teamFifaCode}</dd>
            </>
          )}
          {result.borderColor && (
            <>
              <dt className="text-gray-500">Border</dt>
              <dd className="capitalize text-gray-800">{result.borderColor}</dd>
            </>
          )}
        </dl>

        {result.reasoning && (
          <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2">
            {result.reasoning}
          </p>
        )}
      </div>

      {/* Low confidence warning */}
      {tier === 'low' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm p-3">
          Low confidence — please verify the sticker details before adding to your collection.
        </div>
      )}

      {/* Variant selector */}
      {sticker && variants && variants.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 block">
            Select variant
          </label>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedVariantId ?? ''}
            onChange={(e) => onVariantChange(e.target.value)}
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.variantType}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Album code not found */}
      {!sticker && result.albumCode && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-sm p-3">
          Could not find sticker <span className="font-mono font-medium">{result.albumCode}</span> in the catalog. Add it manually from your collection view.
        </div>
      )}

      {/* Add to collection */}
      {sticker && selectedVariantId && (
        <button
          onClick={onAddToCollection}
          disabled={added}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            added
              ? 'bg-green-600 text-white cursor-default'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {added ? '✓ Added to collection' : 'Add to collection'}
        </button>
      )}
    </div>
  );
}

// ─── Single scan mode ─────────────────────────────────────────────────────────

function SingleScanMode() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<ScanState>({ status: 'idle' });

  const handleFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file || !token) return;

      setState({ status: 'scanning' });

      let result: ScanResult;
      try {
        result = await scanIdentify(file, token);
      } catch (err) {
        const e = err as { message?: string };
        setState({ status: 'error', error: e.message });
        return;
      }

      // Try to look up the sticker in the catalog
      let sticker: Sticker | undefined;
      let variants: StickerVariant[] | undefined;
      let selectedVariantId: string | undefined;
      if (result.albumCode) {
        try {
          sticker = await fetchStickerByAlbumCode(result.albumCode, token);
          variants = await fetchStickerVariants(result.albumCode, token);
          selectedVariantId = variants[0]?.id;
        } catch {
          // Sticker not found in catalog — user will be told to add manually
        }
      }

      setState({
        status: 'done',
        result,
        sticker,
        variants,
        selectedVariantId,
      });
    },
    [token],
  );

  const handleVariantChange = (variantId: string) => {
    setState((s) => ({ ...s, selectedVariantId: variantId }));
  };

  const handleAdd = async () => {
    if (!user || !token || !state.selectedVariantId) return;
    try {
      await addSticker(user.id, state.selectedVariantId, 1, token);
      setState((s) => ({ ...s, added: true }));
    } catch (err) {
      const e = err as { message?: string };
      setState((s) => ({ ...s, error: e.message }));
    }
  };

  return (
    <div className="space-y-4">
      <DropZone onFiles={handleFile} disabled={state.status === 'scanning'} />
      <ScanResultPanel
        state={state}
        onVariantChange={handleVariantChange}
        onAddToCollection={handleAdd}
      />
      {state.status === 'done' && (
        <button
          onClick={() => setState({ status: 'idle' })}
          className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Scan another sticker
        </button>
      )}
    </div>
  );
}

// ─── Batch scan mode ──────────────────────────────────────────────────────────

interface BatchItemState {
  file: File;
  preview: string;
  entry?: BatchScanEntry;
  sticker?: Sticker;
  variants?: StickerVariant[];
  selectedVariantId?: string;
  added?: boolean;
}

function BatchScanMode() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<BatchItemState[]>([]);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const previews = files.map((f) => ({
        file: f,
        preview: URL.createObjectURL(f),
      }));
      setItems(previews.map((p) => ({ file: p.file, preview: p.preview })));
      setDone(false);
    },
    [],
  );

  const handleScan = async () => {
    if (!token || items.length === 0) return;
    setScanning(true);
    try {
      const entries = await scanBatch(items.map((i) => i.file), token);

      // Look up stickers for successful entries
      const updated = await Promise.all(
        items.map(async (item, idx) => {
          const entry = entries.find((e) => e.index === idx);
          if (!entry?.result?.albumCode) return { ...item, entry };
          try {
            const sticker = await fetchStickerByAlbumCode(entry.result.albumCode, token);
            const variants = await fetchStickerVariants(entry.result.albumCode, token);
            return {
              ...item,
              entry,
              sticker,
              variants,
              selectedVariantId: variants[0]?.id,
            };
          } catch {
            return { ...item, entry };
          }
        }),
      );

      setItems(updated);
      setDone(true);
    } finally {
      setScanning(false);
    }
  };

  const handleVariantChange = (idx: number, variantId: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, selectedVariantId: variantId } : item)),
    );
  };

  const handleAddItem = async (idx: number) => {
    const item = items[idx];
    if (!user || !token || !item?.selectedVariantId) return;
    try {
      await addSticker(user.id, item.selectedVariantId, 1, token);
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, added: true } : it)));
    } catch {
      // ignore per-item add errors silently
    }
  };

  const handleAddAll = async () => {
    if (!user || !token) return;
    await Promise.all(
      items.map(async (item, idx) => {
        if (item.selectedVariantId && !item.added) {
          await handleAddItem(idx);
        }
      }),
    );
  };

  return (
    <div className="space-y-4">
      <DropZone onFiles={handleFiles} multiple disabled={scanning} />

      {items.length > 0 && !done && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{items.length} image{items.length !== 1 ? 's' : ''} selected</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {items.map((item, i) => (
              <img
                key={i}
                src={item.preview}
                alt={`Sticker ${i + 1}`}
                className="rounded-lg object-cover w-full aspect-square border border-gray-200"
              />
            ))}
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {scanning ? 'Scanning…' : `Scan ${items.length} sticker${items.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {done && (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const entry = item.entry;
            return (
              <div key={idx} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex gap-3">
                  <img
                    src={item.preview}
                    alt={`Sticker ${idx + 1}`}
                    className="w-16 h-16 rounded-lg object-cover border border-gray-100 shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    {entry?.error && (
                      <p className="text-sm text-red-600">{entry.error}</p>
                    )}
                    {entry?.result && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-sm text-gray-900">
                            {entry.result.albumCode ?? '—'}
                          </span>
                          {entry.result.stickerNumber !== null && (
                            <span className="text-xs text-gray-500">#{entry.result.stickerNumber}</span>
                          )}
                          <ConfidenceBadge confidence={entry.result.confidence} />
                        </div>
                        {entry.result.playerName && (
                          <p className="text-sm text-gray-700">{entry.result.playerName}</p>
                        )}
                        {item.variants && item.variants.length > 0 && (
                          <select
                            className="text-xs rounded border border-gray-300 bg-white px-2 py-1"
                            value={item.selectedVariantId ?? ''}
                            onChange={(e) => handleVariantChange(idx, e.target.value)}
                          >
                            {item.variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.variantType}
                              </option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                  {item.sticker && item.selectedVariantId && (
                    <button
                      onClick={() => handleAddItem(idx)}
                      disabled={item.added}
                      className={`self-center shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        item.added
                          ? 'bg-green-600 text-white cursor-default'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {item.added ? '✓' : 'Add'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {items.some((i) => i.sticker && i.selectedVariantId && !i.added) && (
            <button
              onClick={handleAddAll}
              className="w-full rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700"
            >
              Add all identified stickers to collection
            </button>
          )}

          <button
            onClick={() => { setItems([]); setDone(false); }}
            className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScanPage() {
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-sm text-gray-500">
        Please log in to use the sticker scanner.
      </div>
    );
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Scan Stickers</h1>
      <p className="text-sm text-gray-500 mb-6">
        Upload a photo of a sticker and AI will identify it for you.
      </p>

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-6 text-sm font-medium">
        <button
          onClick={() => setMode('single')}
          className={`flex-1 py-2 transition-colors ${
            mode === 'single'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Single sticker
        </button>
        <button
          onClick={() => setMode('batch')}
          className={`flex-1 py-2 transition-colors ${
            mode === 'batch'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Batch scan
        </button>
      </div>

      {mode === 'single' ? <SingleScanMode /> : <BatchScanMode />}
    </main>
  );
}
