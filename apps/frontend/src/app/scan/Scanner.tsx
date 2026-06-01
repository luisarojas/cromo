'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  scanIdentify,
  scanBatchStream,
  fetchStickerByAlbumCode,
  fetchStickerVariants,
  fetchAllStickers,
  addSticker,
  patchSticker,
  albumDisplayName,
  type ScanResult,
  type Sticker,
  type StickerVariant,
  type UserAlbum,
} from '@/lib/api';
import { variantLabel } from '@/app/album/components/variantMeta';

// ─── Match badge ──────────────────────────────────────────────────────────────

type MatchType = 'code' | 'name' | 'manual' | 'none';

function MatchBadge({ matchType }: { matchType: MatchType }) {
  const config = {
    code:   { label: '✓ Matched',                    cls: 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)] border-[var(--cromo-success)]/30' },
    name:   { label: 'Partial match — please verify', cls: 'bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)] border-[var(--cromo-warning)]/30' },
    manual: { label: '✓ Selected',                   cls: 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)] border-[var(--cromo-success)]/30' },
    none:   { label: 'Not found in this album',      cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  }[matchType];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${config.cls}`}>
      {config.label}
    </span>
  );
}

// ─── Camera modal ─────────────────────────────────────────────────────────────

function CameraModal({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => setReady(true));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Camera access denied');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--cromo-surface)] rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cromo-border)]">
          <span className="font-medium text-sm text-[var(--cromo-fg)]">Take a photo</span>
          <button
            onClick={onClose}
            className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] text-xl leading-none"
            aria-label="Close camera"
          >
            ✕
          </button>
        </div>
        {error ? (
          <div className="p-6 text-center text-sm text-[var(--cromo-danger-text)]">{error}</div>
        ) : (
          <div className="bg-black">
            <video ref={videoRef} className="w-full" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
        {ready && !error && (
          <div className="p-4">
            <button
              onClick={capture}
              className="w-full rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--cromo-accent-strong)]"
            >
              Capture
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFiles(Array.from(files));
    },
    [onFiles],
  );

  return (
    <>
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)]'
            : disabled
            ? 'border-[var(--cromo-border)] bg-transparent cursor-not-allowed opacity-60'
            : 'border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] hover:border-[var(--cromo-accent)]/40 hover:bg-[var(--cromo-accent-soft)]'
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
        <p className="text-sm font-medium text-[var(--cromo-fg)]">
          {multiple ? 'Drop sticker images here' : 'Drop a sticker image here'}
        </p>
        <p className="text-xs text-[var(--cromo-fg-subtle)] mt-1">or click to browse — JPEG, PNG, or WebP, max 10 MB</p>

        <div className="mt-4 flex items-center gap-2 px-2">
          <div className="flex-1 h-px bg-[var(--cromo-surface-2)]" />
          <span className="text-xs text-[var(--cromo-fg-subtle)]">or</span>
          <div className="flex-1 h-px bg-[var(--cromo-surface-2)]" />
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!disabled) setCameraOpen(true); }}
          disabled={disabled}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-4 py-2 text-sm text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Use camera
        </button>
      </div>

      {cameraOpen && (
        <CameraModal
          onCapture={(file) => { setCameraOpen(false); onFiles([file]); }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}

// ─── ComboBox ─────────────────────────────────────────────────────────────────

interface ComboOption {
  value: string;
  label: string;
}

function ComboBox({
  value,
  options,
  onSelect,
  placeholder = 'Search…',
  disabled = false,
}: {
  value: string;
  options: ComboOption[];
  onSelect: (opt: ComboOption) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : value}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {open && !disabled && filtered.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 max-h-48 overflow-auto rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg text-sm">
          {filtered.slice(0, 100).map((opt) => (
            <li
              key={opt.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(opt); setQuery(''); setOpen(false); }}
              className="px-3 py-2 cursor-pointer hover:bg-[var(--cromo-accent-soft)] truncate"
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

interface ScanCard {
  sourcePreview: string;
  errorMessage?: string;
  // Set when the scan succeeded but the AI couldn't identify any sticker in
  // the image (e.g. random object photo). Rendered with informational styling
  // alongside the source preview so the user knows which image was the dud.
  noMatchMessage?: string;
  albumCode: string;
  teamFifaCode: string;
  teamName: string;
  stickerNumber: number | null;
  borderVariantType: string;
  sticker?: Sticker;
  variants: StickerVariant[];
  selectedVariantId: string;
  matchType: MatchType;
  added: boolean;
  reasoning?: string;
  // Snapshot of the state at the moment of the most recent successful add, so
  // the Undo button can restore exactly that. Cleared once the card transitions
  // back to unadded.
  lastAdd?: {
    variantId: string;
    previousQuantity: number;
  };
}

// Pre-selects the best variant for a sticker. The AI's explicit pick wins whenever
// it returned one — including base_border or base_borderless. Only when the AI
// returned a null variantToken do we fall back to the album's configured default
// Base. This preserves the model's specific identifications (colored borders,
// crumple, extras) while filling the uncertain case with the user's preference.
function pickVariantId(
  variants: StickerVariant[],
  borderHint: string | null,
  defaultBaseVariant: 'base_border' | 'base_borderless',
): string {
  if (borderHint) {
    const exact = variants.find((v) => v.variantType === borderHint);
    if (exact) return exact.id;
    const partial = variants.find((v) =>
      v.variantType.toLowerCase().startsWith(borderHint.toLowerCase()),
    );
    if (partial) return partial.id;
  }

  // AI returned no variantToken — use the album-level default. Falls through
  // to base_borderless then variants[0] for Coca-Cola stickers, which only
  // ever carry base_borderless regardless of the album's default.
  return variants.find((v) => v.variantType === defaultBaseVariant)?.id
    ?? variants.find((v) => v.variantType === 'base_borderless')?.id
    ?? variants[0]?.id
    ?? '';
}

function emptyScanCard(sourcePreview: string): ScanCard {
  return {
    sourcePreview,
    noMatchMessage: "We couldn't identify any stickers in this image. Try a clearer, well-lit photo of the front or back of a sticker.",
    albumCode: '',
    teamFifaCode: '',
    teamName: '',
    stickerNumber: null,
    borderVariantType: '',
    variants: [],
    selectedVariantId: '',
    matchType: 'none',
    added: false,
  };
}

async function buildScanCard(
  sourcePreview: string,
  result: ScanResult,
  token: string,
  catalog: Sticker[],
  defaultBaseVariant: 'base_border' | 'base_borderless',
): Promise<ScanCard> {
  let sticker: Sticker | undefined;
  let variants: StickerVariant[] = [];
  let selectedVariantId = '';
  let matchType: ScanCard['matchType'] = 'none';

  if (result.albumCode) {
    try {
      sticker = await fetchStickerByAlbumCode(result.albumCode, token);
      variants = await fetchStickerVariants(result.albumCode, token);
      selectedVariantId = pickVariantId(variants, result.variantToken, defaultBaseVariant);
      matchType = 'code';
    } catch { /* sticker not in catalog */ }
  }

  if (!sticker && result.playerName) {
    const matches = catalog.filter(
      (s) => s.playerName?.toLowerCase() === result.playerName!.toLowerCase()
        && (result.stickerType !== null
          ? s.stickerType === result.stickerType
          : s.stickerType !== 'extra' && s.stickerType !== 'coca_cola_special'),
    );
    if (matches.length === 1) {
      try {
        sticker = await fetchStickerByAlbumCode(matches[0]!.albumCode, token);
        variants = await fetchStickerVariants(matches[0]!.albumCode, token);
        selectedVariantId = pickVariantId(variants, result.variantToken, defaultBaseVariant);
        matchType = 'name';
      } catch { /* ignore */ }
    }
  }

  return {
    sourcePreview,
    albumCode: sticker?.albumCode ?? result.albumCode ?? '',
    teamFifaCode: sticker?.fifaCode ?? result.teamFifaCode ?? '',
    teamName: sticker?.teamName ?? '',
    stickerNumber: sticker?.number ?? result.stickerNumber,
    borderVariantType: result.variantToken ?? '',
    sticker,
    variants,
    selectedVariantId,
    matchType,
    added: false,
    reasoning: result.reasoning || undefined,
  };
}

interface ScannerProps {
  album: UserAlbum;
  // Fires after any add/undo. Album page uses this to refresh its view.
  onChange?: () => void;
  // When provided, a Close button is rendered in the header.
  onClose?: () => void;
  // When provided, a "Change album" button is rendered in the header.
  onChangeAlbum?: () => void;
}

export default function Scanner({ album, onChange, onClose, onChangeAlbum }: ScannerProps) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<'idle' | 'previewing' | 'scanning' | 'done' | 'error'>('idle');
  const [scanError, setScanError] = useState<string | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Sticker[]>([]);
  const [staged, setStaged] = useState<{ file: File; preview: string }[]>([]);
  const [resultCards, setResultCards] = useState<ScanCard[]>([]);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchAllStickers(token, album.albumTypeKey).then(setCatalog).catch(() => {});
  }, [token, album.albumTypeKey]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!token) return;
      setScanError(undefined);
      setResultCards([]);

      if (files.length === 1) {
        const file = files[0]!;
        const url = URL.createObjectURL(file);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        setStaged([]);
        setStatus('scanning');

        let results: ScanResult[];
        try {
          results = await scanIdentify(file, token, album.albumTypeKey);
        } catch (err) {
          setScanError((err as { message?: string }).message);
          setStatus('error');
          return;
        }

        const cards = results.length === 0
          ? [emptyScanCard(url)]
          : await Promise.all(results.map((r) => buildScanCard(url, r, token, catalog, album.settings.defaultBaseVariant)));
        setResultCards(cards);
        setStatus('done');
      } else {
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
        setStaged(files.map((f) => ({ file: f, preview: URL.createObjectURL(f) })));
        setStatus('previewing');
      }
    },
    [token, catalog, album.albumTypeKey],
  );

  const handleBatchScan = async () => {
    if (!token || staged.length === 0) return;
    setStatus('scanning');
    setResultCards([]);
    setScanProgress({ done: 0, total: staged.length });
    let eventsReceived = 0;
    try {
      await scanBatchStream(
        staged.map((i) => i.file),
        token,
        async (entry) => {
          eventsReceived++;
          const preview = staged[entry.index]?.preview ?? '';
          if (entry.error) {
            setResultCards((prev) => [...prev, {
              sourcePreview: preview,
              errorMessage: entry.error,
              albumCode: '',
              teamFifaCode: '',
              teamName: '',
              stickerNumber: null,
              borderVariantType: '',
              variants: [],
              selectedVariantId: '',
              matchType: 'none' as const,
              added: false,
            }]);
          } else {
            const results = entry.results ?? [];
            const newCards = results.length === 0
              ? [emptyScanCard(preview)]
              : await Promise.all(results.map((r) => buildScanCard(preview, r, token, catalog, album.settings.defaultBaseVariant)));
            setResultCards((prev) => [...prev, ...newCards]);
          }
          setScanProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null);
        },
        album.albumTypeKey,
      );
      if (eventsReceived === 0) {
        setScanError('No images were processed. Please try again.');
        setStatus('error');
      } else {
        setStatus('done');
      }
    } catch (err) {
      setScanError((err as { message?: string }).message);
      setStatus('error');
    }
  };

  const handleCardAlbumCodeSelect = useCallback(
    async (idx: number, albumCode: string) => {
      if (!token) return;
      const s = catalog.find((c) => c.albumCode === albumCode);
      if (!s) return;
      try {
        const variants = await fetchStickerVariants(albumCode, token);
        setResultCards((prev) => prev.map((card, i) => {
          if (i !== idx) return card;
          const selectedVariantId = pickVariantId(variants, card.borderVariantType || null, album.settings.defaultBaseVariant);
          return {
            ...card,
            albumCode: s.albumCode,
            teamFifaCode: s.fifaCode ?? '',
            teamName: s.teamName ?? '',
            stickerNumber: s.number,
            sticker: s,
            variants,
            selectedVariantId,
            matchType: 'manual' as const,
          };
        }));
      } catch { /* ignore */ }
    },
    [catalog, token],
  );

  const handleCardBorderSelect = useCallback(
    (idx: number, variantType: string) => {
      setResultCards((prev) => prev.map((card, i) => {
        if (i !== idx) return card;
        const variant = card.variants.find((v) => v.variantType === variantType);
        if (!variant) return card;
        return { ...card, borderVariantType: variantType, selectedVariantId: variant.id };
      }));
    },
    [],
  );

  const handleAddItem = async (idx: number) => {
    const card = resultCards[idx];
    if (!user || !token || !card?.selectedVariantId) return;
    try {
      const { quantity } = await addSticker(
        user.id, card.selectedVariantId, 1, token, album.id,
      );
      const variantId = card.selectedVariantId;
      setResultCards((prev) => prev.map((c, i) => (i === idx
        ? { ...c, added: true, lastAdd: { variantId, previousQuantity: quantity - 1 } }
        : c)));
      onChange?.();
    } catch { /* ignore per-item errors silently */ }
  };

  const handleUndoAdd = async (idx: number) => {
    const card = resultCards[idx];
    if (!user || !token || !card?.lastAdd) return;
    const { variantId, previousQuantity } = card.lastAdd;
    try {
      await patchSticker(user.id, variantId, previousQuantity, token, album.id);
      setResultCards((prev) => prev.map((c, i) => (i === idx
        ? { ...c, added: false, lastAdd: undefined }
        : c)));
      onChange?.();
    } catch { /* ignore per-item errors silently */ }
  };

  const handleAddAll = async () => {
    if (!user || !token) return;
    await Promise.all(
      resultCards.map(async (card, idx) => {
        if (card.selectedVariantId && !card.added) await handleAddItem(idx);
      }),
    );
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    staged.forEach((s) => URL.revokeObjectURL(s.preview));
    setPreviewUrl(null);
    setStaged([]);
    setResultCards([]);
    setScanProgress(null);
    setStatus('idle');
    setScanError(undefined);
  };

  const isBatch = staged.length > 0;

  const stickerOptions = useMemo<ComboOption[]>(
    () =>
      catalog.map((s) => {
        const typeSuffix =
          s.stickerType === 'coca_cola_special' ? ' (Coca-Cola)'
          : s.stickerType === 'extra' ? ' (Extra)'
          : '';
        const base = s.playerName ? `${s.albumCode} — ${s.playerName}` : s.albumCode;
        return { value: s.albumCode, label: `${base}${typeSuffix}` };
      }),
    [catalog],
  );

  return (
    <div className="space-y-4">
      {/* Header — always shows the target album */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-[var(--cromo-fg-subtle)]">Adding to</p>
          <p className="text-sm font-medium text-[var(--cromo-fg)] truncate">
            {albumDisplayName(album)}
            {album.isDefault && (
              <span className="ml-2 text-[11px] font-normal text-[var(--cromo-warning-text)]">· Default</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onChangeAlbum && (
            <button
              onClick={onChangeAlbum}
              className="text-xs text-[var(--cromo-accent)] hover:underline px-2 py-1"
            >
              Change
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] text-xl leading-none px-1"
              aria-label="Close scanner"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {status === 'idle' ? (
        <DropZone onFiles={handleFiles} multiple />
      ) : (
        <>
          {!isBatch && previewUrl && resultCards.length === 0 && (
            <img
              src={previewUrl}
              alt="Scanned sticker"
              className="w-full rounded-xl object-contain max-h-72 border border-[var(--cromo-border)] bg-transparent"
            />
          )}

          {isBatch && status === 'previewing' && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--cromo-fg-muted)]">
                {staged.length} image{staged.length !== 1 ? 's' : ''} selected
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {staged.map((item, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={item.preview}
                      alt={`Image ${i + 1}`}
                      className="rounded-lg object-cover w-full aspect-square border border-[var(--cromo-border)]"
                    />
                    <button
                      onClick={() => {
                        URL.revokeObjectURL(item.preview);
                        const next = staged.filter((_, j) => j !== i);
                        if (next.length === 0) {
                          reset();
                        } else {
                          setStaged(next);
                        }
                      }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none"
                      aria-label={`Remove image ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={handleBatchScan}
                className="w-full rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--cromo-accent-strong)]"
              >
                Scan {staged.length} image{staged.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {status === 'scanning' && (
            <div className="flex items-center gap-2 text-sm text-[var(--cromo-fg-muted)] py-4 justify-center">
              <span className="animate-spin">⏳</span>
              {isBatch && scanProgress
                ? scanProgress.done < scanProgress.total
                  ? `Scanning image ${scanProgress.done + 1} of ${scanProgress.total}…`
                  : 'Finalizing…'
                : 'Identifying sticker…'}
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 text-[var(--cromo-danger-text)] text-sm p-4 space-y-3">
              <p>{scanError ?? 'Failed to identify sticker. Please try again.'}</p>
              <button
                onClick={reset}
                className="w-full rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2 text-sm font-medium hover:bg-[var(--cromo-accent-strong)]"
              >
                Retry with a new photo
              </button>
            </div>
          )}

          {resultCards.length > 0 && (
            <div className="space-y-3">
              {resultCards.map((card, idx) => {
                if (card.noMatchMessage) {
                  return (
                    <div key={idx} className="rounded-xl border border-[var(--cromo-warning)]/30 bg-[var(--cromo-warning-soft)] p-4 flex items-start gap-3">
                      <img
                        src={card.sourcePreview}
                        alt={`Image ${idx + 1}`}
                        className="w-12 h-12 rounded-lg object-cover border border-[var(--cromo-warning)]/20 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--cromo-warning-text)]">No stickers identified</p>
                        <p className="text-xs text-[var(--cromo-warning-text)] mt-0.5 break-words">{card.noMatchMessage}</p>
                      </div>
                    </div>
                  );
                }
                if (card.errorMessage) {
                  return (
                    <div key={idx} className="rounded-xl border border-[var(--cromo-danger)]/30 bg-[var(--cromo-danger-soft)] p-4 flex items-start gap-3">
                      <img
                        src={card.sourcePreview}
                        alt={`Image ${idx + 1}`}
                        className="w-12 h-12 rounded-lg object-cover border border-[var(--cromo-danger)]/20 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--cromo-danger-text)]">Failed to identify</p>
                        <p className="text-xs text-[var(--cromo-danger-text)] mt-0.5 break-words">{card.errorMessage}</p>
                      </div>
                    </div>
                  );
                }

                const borderOptions: ComboOption[] = card.variants.map((v) => ({
                  value: v.variantType,
                  label: variantLabel(v.variantType),
                }));
                const selectedVariant = card.variants.find((v) => v.id === card.selectedVariantId);
                const borderDisplayValue = selectedVariant ? variantLabel(selectedVariant.variantType) : '';
                const teamDisplayValue = card.teamName
                  ? `${card.teamName} (${card.teamFifaCode})`
                  : card.teamFifaCode;
                const stickerDisplayValue = stickerOptions.find((o) => o.value === card.albumCode)?.label ?? '';

                return (
                  <div key={idx} className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4 space-y-3">
                    <img
                      src={card.sourcePreview}
                      alt={`Sticker ${idx + 1}`}
                      className="w-full rounded-lg object-contain max-h-64 border border-[var(--cromo-border)] bg-transparent"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <MatchBadge matchType={card.matchType} />
                    </div>

                    {card.reasoning && (
                      <details className="text-xs text-[var(--cromo-fg-subtle)]">
                        <summary className="cursor-pointer hover:text-[var(--cromo-fg-muted)] select-none">
                          Show reasoning
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[var(--cromo-fg-muted)]">
                          {card.reasoning}
                        </p>
                      </details>
                    )}

                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--cromo-fg-muted)] block">Sticker</label>
                        <ComboBox
                          value={stickerDisplayValue}
                          options={stickerOptions}
                          onSelect={(opt) => handleCardAlbumCodeSelect(idx, opt.value)}
                          placeholder="Search by album code or player name…"
                          disabled={card.added}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--cromo-fg-muted)] block">Team</label>
                          <div className="w-full rounded-lg border border-[var(--cromo-border)] bg-transparent px-3 py-2 text-sm text-[var(--cromo-fg)] truncate">
                            {teamDisplayValue || '—'}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--cromo-fg-muted)] block">Sticker #</label>
                          <div className="w-full rounded-lg border border-[var(--cromo-border)] bg-transparent px-3 py-2 text-sm text-[var(--cromo-fg)]">
                            {card.stickerNumber ?? '—'}
                          </div>
                        </div>
                      </div>

                      {card.variants.length > 0 && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--cromo-fg-muted)] block">Border</label>
                          <ComboBox
                            value={borderDisplayValue}
                            options={borderOptions}
                            onSelect={(opt) => handleCardBorderSelect(idx, opt.value)}
                            placeholder="Select border…"
                            disabled={card.added}
                          />
                        </div>
                      )}

                      {card.sticker && card.selectedVariantId && (
                        card.added ? (
                          <div className="flex items-stretch gap-2">
                            <div className="flex-1 rounded-lg bg-[var(--cromo-success)] text-[var(--cromo-success-fg)] px-4 py-2 text-sm font-medium flex items-center justify-center">
                              ✓ Added to collection
                            </div>
                            <button
                              onClick={() => handleUndoAdd(idx)}
                              className="rounded-lg border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] px-4 py-2 text-sm font-medium"
                            >
                              Undo
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddItem(idx)}
                            className="w-full rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] px-4 py-2 text-sm font-medium transition-colors"
                          >
                            Add to collection
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}

              {status === 'done' && resultCards.some((c) => c.sticker && c.selectedVariantId && !c.added) && (
                <button
                  onClick={handleAddAll}
                  className="w-full rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--cromo-accent-strong)]"
                >
                  Add all to collection
                </button>
              )}
            </div>
          )}

          {status === 'done' && (
            <button
              onClick={reset}
              className="w-full text-sm text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] underline"
            >
              Scan more stickers
            </button>
          )}
        </>
      )}
    </div>
  );
}
