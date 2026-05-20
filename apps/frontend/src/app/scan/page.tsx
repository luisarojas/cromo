'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  scanIdentify,
  scanBatch,
  fetchStickerByAlbumCode,
  fetchStickerVariants,
  fetchUserAlbums,
  fetchAllStickers,
  addSticker,
  albumDisplayName,
  type ScanResult,
  type Sticker,
  type StickerVariant,
  type UserAlbum,
} from '@/lib/api';
import { variantLabel } from '@/app/album/components/variantMeta';

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
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="font-medium text-sm text-gray-900">Take a photo</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close camera"
          >
            ✕
          </button>
        </div>
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
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
              className="w-full rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700"
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

        <div className="mt-4 flex items-center gap-2 px-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!disabled) setCameraOpen(true); }}
          disabled={disabled}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
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
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {open && !disabled && filtered.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          {filtered.slice(0, 100).map((opt) => (
            <li
              key={opt.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(opt); setQuery(''); setOpen(false); }}
              className="px-3 py-2 cursor-pointer hover:bg-blue-50 truncate"
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Scan form state ──────────────────────────────────────────────────────────

interface ScanForm {
  albumCode: string;
  playerName: string;
  teamFifaCode: string;
  teamName: string;
  stickerNumber: number | null;
  borderVariantType: string;
  sticker: Sticker | undefined;
  variants: StickerVariant[];
  selectedVariantId: string;
  confidence: number;
  reasoning: string;
  added: boolean;
}

// ─── Scan result form ─────────────────────────────────────────────────────────

function ScanResultForm({
  form,
  catalog,
  albums,
  selectedAlbumId,
  onAlbumCodeSelect,
  onPlayerSelect,
  onBorderSelect,
  onAlbumChange,
  onAdd,
}: {
  form: ScanForm;
  catalog: Sticker[];
  albums: UserAlbum[];
  selectedAlbumId?: string;
  onAlbumCodeSelect: (albumCode: string) => void;
  onPlayerSelect: (albumCode: string) => void;
  onBorderSelect: (variantType: string) => void;
  onAlbumChange: (albumId: string) => void;
  onAdd: () => void;
}) {
  const filteredCatalog = catalog;

  const albumCodeOptions: ComboOption[] = filteredCatalog.map((s) => ({
    value: s.albumCode,
    label: s.playerName ? `${s.albumCode} — ${s.playerName}` : s.albumCode,
  }));

  const playerOptions: ComboOption[] = filteredCatalog
    .filter((s) => s.playerName)
    .map((s) => {
      const suffix =
        s.stickerType === 'coca_cola_special' ? ' · Coca-Cola'
        : s.stickerType === 'extra' ? ' · Extra'
        : '';
      return { value: s.albumCode, label: `${s.playerName!}${suffix}` };
    });

  const borderOptions: ComboOption[] = form.variants.map((v) => ({
    value: v.variantType,
    label: variantLabel(v.variantType),
  }));

  const selectedVariant = form.variants.find((v) => v.id === form.selectedVariantId);
  const borderDisplayValue = selectedVariant ? variantLabel(selectedVariant.variantType) : '';

  const teamDisplayValue = form.teamName
    ? `${form.teamName} (${form.teamFifaCode})`
    : form.teamFifaCode;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">Identified Sticker</span>
        <ConfidenceBadge confidence={form.confidence} />
      </div>

      {form.reasoning && (
        <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2">{form.reasoning}</p>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 block">Album code</label>
          <ComboBox
            value={form.albumCode}
            options={albumCodeOptions}
            onSelect={(opt) => onAlbumCodeSelect(opt.value)}
            placeholder="Search album code…"
            disabled={form.added}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 block">Player</label>
          <ComboBox
            value={form.playerName}
            options={playerOptions}
            onSelect={(opt) => onPlayerSelect(opt.value)}
            placeholder="Search player…"
            disabled={form.added}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 block">Team</label>
          <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {teamDisplayValue || '—'}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 block">Sticker #</label>
          <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {form.stickerNumber ?? '—'}
          </div>
        </div>

        {form.variants.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 block">Border</label>
            <ComboBox
              value={borderDisplayValue}
              options={borderOptions}
              onSelect={(opt) => onBorderSelect(opt.value)}
              placeholder="Select border…"
              disabled={form.added}
            />
          </div>
        )}
      </div>

      {form.albumCode && !form.sticker && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-sm p-3">
          Could not find sticker <span className="font-mono font-medium">{form.albumCode}</span> in the catalog.
        </div>
      )}

      {confidenceTier(form.confidence) === 'low' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm p-3">
          Low confidence — please verify the sticker details before adding to your collection.
        </div>
      )}

      {form.sticker && form.selectedVariantId && (
        <div className="space-y-2">
          {albums.length > 1 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 block">Add to album</label>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                value={selectedAlbumId ?? ''}
                onChange={(e) => onAlbumChange(e.target.value)}
                disabled={form.added}
              >
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {albumDisplayName(a)}{a.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={onAdd}
            disabled={form.added}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              form.added
                ? 'bg-green-600 text-white cursor-default'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {form.added ? '✓ Added to collection' : 'Add to collection'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Scan mode ───────────────────────────────────────────────────────────────

interface ScanCard {
  sourcePreview: string;
  albumCode: string;
  playerName: string;
  stickerNumber: number | null;
  sticker?: Sticker;
  variants: StickerVariant[];
  selectedVariantId: string;
  confidence: number;
  added: boolean;
}

async function buildScanCard(
  sourcePreview: string,
  result: ScanResult,
  token: string,
  catalog: Sticker[],
): Promise<ScanCard> {
  let sticker: Sticker | undefined;
  let variants: StickerVariant[] = [];
  let selectedVariantId = '';

  if (result.albumCode) {
    try {
      sticker = await fetchStickerByAlbumCode(result.albumCode, token);
      variants = await fetchStickerVariants(result.albumCode, token);
      selectedVariantId = (result.borderColor
        ? variants.find((v) => v.variantType.toLowerCase().startsWith(result.borderColor!.toLowerCase()))
        : undefined
      )?.id ?? variants[0]?.id ?? '';
    } catch { /* sticker not in catalog */ }
  }

  const catalogEntry = catalog.find((s) => s.albumCode === result.albumCode);

  return {
    sourcePreview,
    albumCode: result.albumCode ?? '',
    playerName: result.playerName ?? catalogEntry?.playerName ?? '',
    stickerNumber: result.stickerNumber,
    sticker,
    variants,
    selectedVariantId,
    confidence: result.confidence,
    added: false,
  };
}

function ScanMode() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<'idle' | 'previewing' | 'scanning' | 'done' | 'error'>('idle');
  const [scanError, setScanError] = useState<string | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Sticker[]>([]);
  const [albums, setAlbums] = useState<UserAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>();
  const [form, setForm] = useState<ScanForm | null>(null);
  const [staged, setStaged] = useState<{ file: File; preview: string }[]>([]);
  const [resultCards, setResultCards] = useState<ScanCard[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchAllStickers(token).then(setCatalog).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!user || !token) return;
    fetchUserAlbums(user.id, token)
      .then((list) => {
        setAlbums(list);
        const def = list.find((a) => a.isDefault) ?? list[0];
        if (def) setSelectedAlbumId(def.id);
      })
      .catch(() => {});
  }, [user, token]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!token) return;
      setScanError(undefined);
      setForm(null);
      setResultCards([]);

      if (files.length === 1) {
        const file = files[0]!;
        const url = URL.createObjectURL(file);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        setStaged([]);
        setStatus('scanning');

        let results: ScanResult[];
        try {
          results = await scanIdentify(file, token);
        } catch (err) {
          setScanError((err as { message?: string }).message);
          setStatus('error');
          return;
        }

        if (results.length === 1) {
          const result = results[0]!;
          let sticker: Sticker | undefined;
          let variants: StickerVariant[] = [];
          let selectedVariantId = '';
          if (result.albumCode) {
            try {
              sticker = await fetchStickerByAlbumCode(result.albumCode, token);
              variants = await fetchStickerVariants(result.albumCode, token);
              selectedVariantId = (result.borderColor
                ? variants.find((v) => v.variantType.toLowerCase().startsWith(result.borderColor!.toLowerCase()))
                : undefined
              )?.id ?? variants[0]?.id ?? '';
            } catch { /* sticker not in catalog */ }
          }
          const catalogEntry = catalog.find((s) => s.albumCode === result.albumCode);
          setForm({
            albumCode: result.albumCode ?? '',
            playerName: result.playerName ?? '',
            teamFifaCode: result.teamFifaCode ?? catalogEntry?.fifaCode ?? '',
            teamName: catalogEntry?.teamName ?? sticker?.teamName ?? '',
            stickerNumber: result.stickerNumber,
            borderVariantType: result.borderColor ?? '',
            sticker,
            variants,
            selectedVariantId,
            confidence: result.confidence,
            reasoning: result.reasoning,
            added: false,
          });
        } else {
          const cards = await Promise.all(results.map((r) => buildScanCard(url, r, token, catalog)));
          setResultCards(cards);
        }
        setStatus('done');
      } else {
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
        setStaged(files.map((f) => ({ file: f, preview: URL.createObjectURL(f) })));
        setStatus('previewing');
      }
    },
    [token, catalog],
  );

  const handleBatchScan = async () => {
    if (!token || staged.length === 0) return;
    setStatus('scanning');
    try {
      const entries = await scanBatch(staged.map((i) => i.file), token);
      const cards = await Promise.all(
        staged.flatMap(({ preview }, idx) => {
          const entry = entries.find((e) => e.index === idx);
          return (entry?.results ?? []).map((r) => buildScanCard(preview, r, token, catalog));
        }),
      );
      setResultCards(cards);
      setStatus('done');
    } catch (err) {
      setScanError((err as { message?: string }).message);
      setStatus('error');
    }
  };

  const handleAlbumCodeSelect = useCallback(
    async (albumCode: string) => {
      if (!token) return;
      const s = catalog.find((c) => c.albumCode === albumCode);
      if (!s) return;
      try {
        const variants = await fetchStickerVariants(albumCode, token);
        setForm((f) => {
          if (!f) return f;
          const selectedVariantId = (f.borderVariantType
            ? variants.find((v) => v.variantType.toLowerCase().startsWith(f.borderVariantType.toLowerCase()))
            : undefined
          )?.id ?? variants[0]?.id ?? '';
          return {
            ...f,
            albumCode: s.albumCode,
            playerName: s.playerName ?? '',
            teamFifaCode: s.fifaCode ?? '',
            teamName: s.teamName ?? '',
            stickerNumber: s.number,
            sticker: s,
            variants,
            selectedVariantId,
          };
        });
      } catch { /* ignore */ }
    },
    [catalog, token],
  );

  const handleBorderSelect = useCallback(
    (variantType: string) => {
      setForm((f) => {
        if (!f) return f;
        const variant = f.variants.find((v) => v.variantType === variantType);
        if (!variant) return f;
        return { ...f, borderVariantType: variantType, selectedVariantId: variant.id };
      });
    },
    [],
  );

  const handleAdd = async () => {
    if (!user || !token || !form?.selectedVariantId) return;
    try {
      await addSticker(user.id, form.selectedVariantId, 1, token, selectedAlbumId);
      setForm((f) => f ? { ...f, added: true } : f);
    } catch (err) {
      setScanError((err as { message?: string }).message);
    }
  };

  const handleVariantChange = (idx: number, variantId: string) => {
    setResultCards((prev) =>
      prev.map((card, i) => (i === idx ? { ...card, selectedVariantId: variantId } : card)),
    );
  };

  const handleAddItem = async (idx: number) => {
    const card = resultCards[idx];
    if (!user || !token || !card?.selectedVariantId) return;
    try {
      await addSticker(user.id, card.selectedVariantId, 1, token, selectedAlbumId);
      setResultCards((prev) => prev.map((c, i) => (i === idx ? { ...c, added: true } : c)));
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
    setStatus('idle');
    setForm(null);
    setScanError(undefined);
  };

  const isBatch = staged.length > 0;

  return (
    <div className="space-y-4">
      {status === 'idle' ? (
        <DropZone onFiles={handleFiles} multiple />
      ) : (
        <>
          {/* Single-file preview */}
          {!isBatch && previewUrl && (
            <img
              src={previewUrl}
              alt="Scanned sticker"
              className="w-full rounded-xl object-contain max-h-72 border border-gray-200 bg-gray-50"
            />
          )}

          {/* Multi-file previews + scan button */}
          {isBatch && status === 'previewing' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {staged.length} image{staged.length !== 1 ? 's' : ''} selected
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {staged.map((item, i) => (
                  <img
                    key={i}
                    src={item.preview}
                    alt={`Image ${i + 1}`}
                    className="rounded-lg object-cover w-full aspect-square border border-gray-200"
                  />
                ))}
              </div>
              <button
                onClick={handleBatchScan}
                className="w-full rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700"
              >
                Scan {staged.length} image{staged.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {status === 'scanning' && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <span className="animate-spin">⏳</span> Identifying sticker{isBatch ? 's' : ''}…
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-4">
              {scanError ?? 'Failed to identify sticker. Please try again.'}
            </div>
          )}

          {/* Single sticker result — rich combobox form */}
          {status === 'done' && form && resultCards.length === 0 && (
            <ScanResultForm
              form={form}
              catalog={catalog}
              albums={albums}
              selectedAlbumId={selectedAlbumId}
              onAlbumCodeSelect={handleAlbumCodeSelect}
              onPlayerSelect={handleAlbumCodeSelect}
              onBorderSelect={handleBorderSelect}
              onAlbumChange={setSelectedAlbumId}
              onAdd={handleAdd}
            />
          )}

          {/* Multi-sticker results (multi-sticker image or batch) */}
          {status === 'done' && resultCards.length > 0 && (
            <div className="space-y-3">
              {resultCards.map((card, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex gap-3">
                    <img
                      src={card.sourcePreview}
                      alt={`Sticker ${idx + 1}`}
                      className="w-16 h-16 rounded-lg object-cover border border-gray-100 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-gray-900">
                          {card.albumCode || '—'}
                        </span>
                        {card.stickerNumber !== null && (
                          <span className="text-xs text-gray-500">#{card.stickerNumber}</span>
                        )}
                        <ConfidenceBadge confidence={card.confidence} />
                      </div>
                      {card.playerName && (
                        <p className="text-sm text-gray-700">{card.playerName}</p>
                      )}
                      {card.variants.length > 0 && (
                        <select
                          className="text-xs rounded border border-gray-300 bg-white px-2 py-1"
                          value={card.selectedVariantId}
                          onChange={(e) => handleVariantChange(idx, e.target.value)}
                          disabled={card.added}
                        >
                          {card.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {variantLabel(v.variantType)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {card.sticker && card.selectedVariantId && (
                      <button
                        onClick={() => handleAddItem(idx)}
                        disabled={card.added}
                        className={`self-center shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          card.added
                            ? 'bg-green-600 text-white cursor-default'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {card.added ? '✓' : 'Add'}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {resultCards.some((c) => c.sticker && c.selectedVariantId && !c.added) && (
                <div className="space-y-2">
                  {albums.length > 1 && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600 block">Add to album</label>
                      <select
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedAlbumId ?? ''}
                        onChange={(e) => setSelectedAlbumId(e.target.value)}
                      >
                        {albums.map((a) => (
                          <option key={a.id} value={a.id}>
                            {albumDisplayName(a)}{a.isDefault ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={handleAddAll}
                    className="w-full rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700"
                  >
                    Add all to collection
                  </button>
                </div>
              )}
            </div>
          )}

          {(status === 'done' || status === 'error') && (
            <button
              onClick={reset}
              className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
            >
              {status === 'error' ? 'Try again' : 'Scan more stickers'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScanPage() {
  const user = useAuthStore((s) => s.user);

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
        Upload one or more sticker photos and AI will identify them for you.
      </p>
      <ScanMode />
    </main>
  );
}
