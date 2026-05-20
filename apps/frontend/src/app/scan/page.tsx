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
  type BatchScanEntry,
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
  onTeamSelect,
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
  onTeamSelect: (fifaCode: string) => void;
  onBorderSelect: (variantType: string) => void;
  onAlbumChange: (albumId: string) => void;
  onAdd: () => void;
}) {
  const filteredCatalog = form.teamFifaCode
    ? catalog.filter((s) => s.fifaCode === form.teamFifaCode)
    : catalog;

  const albumCodeOptions: ComboOption[] = filteredCatalog.map((s) => ({
    value: s.albumCode,
    label: s.playerName ? `${s.albumCode} — ${s.playerName}` : s.albumCode,
  }));

  const playerOptions: ComboOption[] = filteredCatalog
    .filter((s) => s.playerName)
    .map((s) => ({ value: s.albumCode, label: s.playerName! }));

  const teamOptions: ComboOption[] = Array.from(
    new Map(
      catalog
        .filter((s) => s.fifaCode && s.teamName)
        .map((s) => [s.fifaCode!, s] as [string, Sticker])
    ).values()
  )
    .map((s) => ({ value: s.fifaCode!, label: `${s.teamName} (${s.fifaCode})` }))
    .sort((a, b) => a.label.localeCompare(b.label));

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
          <ComboBox
            value={teamDisplayValue}
            options={teamOptions}
            onSelect={(opt) => onTeamSelect(opt.value)}
            placeholder="Search team…"
            disabled={form.added}
          />
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

// ─── Single scan mode ─────────────────────────────────────────────────────────

function SingleScanMode() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [scanError, setScanError] = useState<string | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Sticker[]>([]);
  const [albums, setAlbums] = useState<UserAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>();
  const [form, setForm] = useState<ScanForm | null>(null);

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

  const handleFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file || !token) return;

      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
      setScanStatus('scanning');
      setForm(null);
      setScanError(undefined);

      let result: ScanResult;
      try {
        result = await scanIdentify(file, token);
      } catch (err) {
        setScanError((err as { message?: string }).message);
        setScanStatus('error');
        return;
      }

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
      setScanStatus('done');
    },
    [token, catalog],
  );

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

  const handleTeamSelect = useCallback(
    (fifaCode: string) => {
      const teamName = catalog.find((s) => s.fifaCode === fifaCode)?.teamName ?? fifaCode;
      setForm((f) => {
        if (!f) return f;
        const playerBelongsToTeam = catalog.find((c) => c.albumCode === f.albumCode)?.fifaCode === fifaCode;
        return {
          ...f,
          teamFifaCode: fifaCode,
          teamName,
          ...(playerBelongsToTeam ? {} : {
            albumCode: '',
            playerName: '',
            stickerNumber: null,
            sticker: undefined,
            variants: [],
            selectedVariantId: '',
          }),
        };
      });
    },
    [catalog],
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

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setScanStatus('idle');
    setForm(null);
    setScanError(undefined);
  };

  return (
    <div className="space-y-4">
      {scanStatus === 'idle' ? (
        <DropZone onFiles={handleFile} />
      ) : (
        <>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Scanned sticker"
              className="w-full rounded-xl object-contain max-h-72 border border-gray-200 bg-gray-50"
            />
          )}

          {scanStatus === 'scanning' && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <span className="animate-spin">⏳</span> Identifying sticker…
            </div>
          )}

          {scanStatus === 'error' && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-4">
              {scanError ?? 'Failed to identify sticker. Please try again.'}
            </div>
          )}

          {scanStatus === 'done' && form && (
            <ScanResultForm
              form={form}
              catalog={catalog}
              albums={albums}
              selectedAlbumId={selectedAlbumId}
              onAlbumCodeSelect={handleAlbumCodeSelect}
              onPlayerSelect={handleAlbumCodeSelect}
              onTeamSelect={handleTeamSelect}
              onBorderSelect={handleBorderSelect}
              onAlbumChange={setSelectedAlbumId}
              onAdd={handleAdd}
            />
          )}

          {(scanStatus === 'done' || scanStatus === 'error') && (
            <button
              onClick={reset}
              className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
            >
              {form?.added ? 'Scan another sticker' : scanStatus === 'error' ? 'Try again' : 'Scan another sticker'}
            </button>
          )}
        </>
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
  const [albums, setAlbums] = useState<UserAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>();

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

      const updated = await Promise.all(
        items.map(async (item, idx) => {
          const entry = entries.find((e) => e.index === idx);
          if (!entry?.result?.albumCode) return { ...item, entry };
          try {
            const sticker = await fetchStickerByAlbumCode(entry.result.albumCode, token);
            const variants = await fetchStickerVariants(entry.result.albumCode, token);
            const selectedVariantId = (entry.result.borderColor
              ? variants.find((v) => v.variantType.toLowerCase().startsWith(entry.result!.borderColor!.toLowerCase()))
              : undefined
            )?.id ?? variants[0]?.id;
            return { ...item, entry, sticker, variants, selectedVariantId };
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
      await addSticker(user.id, item.selectedVariantId, 1, token, selectedAlbumId);
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, added: true } : it)));
    } catch { /* ignore per-item errors silently */ }
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
                                {variantLabel(v.variantType)}
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
                Add all identified stickers to collection
              </button>
            </div>
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
