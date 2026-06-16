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
import { variantLabel } from '@/app/collection/components/variantMeta';
import { pickVariantId } from '@/app/scan/pickVariantId';
import { rememberLastScan, recordScanDay } from '@/lib/lastScan';
import { publishSync } from '@/lib/syncBus';
import { isSpeechSupported, isSpeechMuted, setSpeechMuted, speak } from '@/lib/speech';
import PackShareCard, { type PackEntry } from '@/components/PackShareCard';

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

// Has this device/profile already been through the priming screen? Once the
// user has granted camera permission at least once, we don't need to keep
// explaining what we're about to ask for.
const CAMERA_PRIMED_KEY = 'cromo:cameraPrimed';
function isCameraPrimed(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(CAMERA_PRIMED_KEY) === '1'; } catch { return false; }
}
function markCameraPrimed(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CAMERA_PRIMED_KEY, '1'); } catch { /* ignore */ }
}

function CameraModal({ onCapture, onClose, autoCloseOnCapture = true }: { onCapture: (file: File, liveMode: boolean) => void; onClose: () => void; autoCloseOnCapture?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Skip the primer on devices we've already convinced once. New devices see
  // a one-screen explanation so the OS prompt doesn't show up cold.
  const [primed, setPrimed] = useState(() => isCameraPrimed());
  const [denied, setDenied] = useState(false);
  // Live mode = keep camera open and auto-capture stable frames. Off by
  // default — the manual capture path is more forgiving for poorly-lit
  // stickers and avoids surprising the user with mystery API calls.
  const [liveMode, setLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'searching' | 'capturing' | 'cooldown' | 'limit'>('searching');
  const lastSampleRef = useRef<Uint8ClampedArray | null>(null);
  const lastCaptureMsRef = useRef(0);
  const stableFramesRef = useRef(0);
  // Fingerprint of the most recently SUBMITTED frame. Used to suppress
  // identical captures when the user parks the phone over the same sticker
  // for a long time — without this, the still-frame detector keeps re-firing
  // every cooldown and burns API quota on the same image.
  const lastSubmittedFingerprintRef = useRef<number | null>(null);
  // Per-session cap on auto-captures. Manual capture is unaffected. Free-tier
  // API quotas are tight and a user who walks away from a propped phone could
  // otherwise exhaust them in minutes.
  const MAX_LIVE_CAPTURES = 25;
  const [liveCaptureCount, setLiveCaptureCount] = useState(0);

  useEffect(() => {
    if (!primed) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        markCameraPrimed();
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => setReady(true));
        }
      })
      .catch((err: Error & { name?: string }) => {
        if (cancelled) return;
        if (err.name === 'NotAllowedError' || /denied|permission/i.test(err.message)) {
          setDenied(true);
        }
        setError(err.message || 'Camera access denied');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [primed]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      // Single-capture: stop the stream, hand the file up, dismiss. Live mode:
      // keep streaming and let the parent handle the file in the background —
      // the modal stays open so the user can pan to the next sticker.
      if (!liveMode && autoCloseOnCapture) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(file, false);
        onClose();
      } else {
        onCapture(file, liveMode);
      }
    }, 'image/jpeg', 0.92);
  };

  // Live-mode loop. Once per ~400ms we draw the current video frame to a tiny
  // off-screen canvas (32×32), extract its pixel data, and compute a sum-of-
  // absolute-difference against the previous sample. Three consecutive low-
  // difference samples = the user has parked the camera on a sticker → fire
  // a capture. A 2.5s cooldown between captures prevents the same sticker
  // from being re-submitted while the user moves to the next one.
  useEffect(() => {
    if (!liveMode || !ready) return;
    let cancelled = false;
    const SAMPLE_SIZE = 32;
    const STILL_THRESHOLD = 18;     // mean abs diff per channel; tuned for typical phone cameras
    const STILL_FRAMES_NEEDED = 3;
    const COOLDOWN_MS = 2500;
    const SAMPLE_INTERVAL_MS = 400;

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = SAMPLE_SIZE;
    sampleCanvas.height = SAMPLE_SIZE;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video || !sampleCtx) {
        setTimeout(tick, SAMPLE_INTERVAL_MS);
        return;
      }
      sampleCtx.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const data = sampleCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
      const prev = lastSampleRef.current;
      if (prev && prev.length === data.length) {
        let diff = 0;
        // Cheap fingerprint = sum of the green channel. Different enough sticker
        // → different total. Same sticker stationary → near-identical total.
        // Not crypto-strong; the goal is "is this the same scene I just submitted?"
        let fingerprint = 0;
        for (let i = 0; i < data.length; i += 4) {
          diff += Math.abs(data[i]! - prev[i]!);
          diff += Math.abs(data[i + 1]! - prev[i + 1]!);
          diff += Math.abs(data[i + 2]! - prev[i + 2]!);
          fingerprint += data[i + 1]!;
        }
        const meanDiff = diff / (SAMPLE_SIZE * SAMPLE_SIZE * 3);
        const sinceLast = Date.now() - lastCaptureMsRef.current;
        if (meanDiff < STILL_THRESHOLD && sinceLast > COOLDOWN_MS) {
          stableFramesRef.current += 1;
          if (stableFramesRef.current >= STILL_FRAMES_NEEDED) {
            stableFramesRef.current = 0;
            lastCaptureMsRef.current = Date.now();
            // Suppress identical scenes (delta < ~0.5% of the fingerprint
            // magnitude). The user has to physically move the phone or swap
            // stickers to re-arm.
            const lastFp = lastSubmittedFingerprintRef.current;
            const fpDelta = lastFp === null ? Infinity : Math.abs(fingerprint - lastFp);
            const fpTolerance = Math.max(2000, fingerprint * 0.005);
            if (fpDelta < fpTolerance) {
              setLiveStatus('cooldown');
              setTimeout(() => { if (!cancelled) setLiveStatus('searching'); }, SAMPLE_INTERVAL_MS);
            } else if (liveCaptureCount >= MAX_LIVE_CAPTURES) {
              // Session cap — force live off and surface a message.
              setLiveStatus('limit');
              setLiveMode(false);
            } else {
              lastSubmittedFingerprintRef.current = fingerprint;
              setLiveCaptureCount((n) => n + 1);
              setLiveStatus('capturing');
              capture();
              setTimeout(() => { if (!cancelled) setLiveStatus('cooldown'); }, 50);
              setTimeout(() => { if (!cancelled) setLiveStatus('searching'); }, COOLDOWN_MS);
            }
          } else {
            setLiveStatus('searching');
          }
        } else {
          stableFramesRef.current = 0;
          setLiveStatus(sinceLast < COOLDOWN_MS ? 'cooldown' : 'searching');
        }
      }
      lastSampleRef.current = data;
      setTimeout(tick, SAMPLE_INTERVAL_MS);
    };
    const t = setTimeout(tick, SAMPLE_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(t); };
  // capture is a closure over refs, so deps are intentionally minimal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode, ready]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--cromo-surface)] rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cromo-border)]">
          <span className="font-medium text-sm text-[var(--cromo-fg)]">
            {!primed ? 'Camera access' : denied ? 'Camera blocked' : 'Take a photo'}
          </span>
          <button
            onClick={onClose}
            className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] text-xl leading-none"
            aria-label="Close camera"
          >
            ✕
          </button>
        </div>

        {!primed ? (
          // First-run primer. Browsers only prompt for camera permission in
          // response to a direct user gesture, so we cover *why* before we ask
          // — denial is sticky on most browsers and we want the user to opt in
          // with intent, not flinch and refuse a cold modal.
          <div className="p-5 space-y-4 text-sm text-[var(--cromo-fg)]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <div>
                <p className="font-medium leading-tight">Snap your stickers to identify them.</p>
                <p className="text-xs text-[var(--cromo-fg-muted)] mt-1 leading-relaxed">
                  We open the camera locally on your device. Photos go straight to our identifier — nothing is stored unless you add the sticker to your collection.
                </p>
              </div>
            </div>
            <button
              onClick={() => setPrimed(true)}
              className="w-full rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--cromo-accent-strong)]"
            >
              Allow camera
            </button>
            <button
              onClick={onClose}
              className="w-full text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
            >
              Use a saved photo instead
            </button>
          </div>
        ) : denied ? (
          // Recovery copy when the browser-level permission is blocked. We
          // can't re-prompt in JS once denied — only the user can flip it in
          // site settings, so we tell them how.
          <div className="p-5 space-y-3 text-sm">
            <p className="text-[var(--cromo-fg)] font-medium">Camera access is blocked.</p>
            <p className="text-xs text-[var(--cromo-fg-muted)] leading-relaxed">
              To turn it on, open this site&apos;s settings in your browser&apos;s address bar (the lock or info icon) and set <span className="font-mono">Camera</span> to <span className="font-mono">Allow</span>. Then reload the page.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-4 py-2 text-sm font-medium text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]"
            >
              Use a saved photo instead
            </button>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-[var(--cromo-danger-text)]">{error}</div>
        ) : (
          <div className="bg-black relative">
            <video ref={videoRef} className="w-full" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            {liveMode && ready && (
              <div className="absolute top-2 left-2 right-2 flex justify-between text-[10px] font-mono uppercase tracking-widest">
                <span className={`rounded-full px-2 py-0.5 ${
                  liveStatus === 'capturing'
                    ? 'bg-[var(--cromo-success)] text-[var(--cromo-success-fg)]'
                    : liveStatus === 'cooldown'
                      ? 'bg-[var(--cromo-warning)] text-[var(--cromo-warning-text)]'
                      : 'bg-black/60 text-white'
                }`}>
                  {liveStatus === 'capturing' ? '◉ capturing' : liveStatus === 'cooldown' ? '… processing' : '◌ searching'}
                </span>
                <span className="rounded-full bg-black/60 text-white px-2 py-0.5">
                  LIVE · {liveCaptureCount}/{MAX_LIVE_CAPTURES}
                </span>
              </div>
            )}
            {liveStatus === 'limit' && (
              <div className="absolute inset-x-2 bottom-2 rounded-md bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)] text-xs px-3 py-2 border border-[var(--cromo-warning)]/30">
                Live-mode cap reached for this session ({MAX_LIVE_CAPTURES}). Use Capture for one-off shots, or close and reopen the camera to reset.
              </div>
            )}
          </div>
        )}

        {primed && ready && !error && (
          <div className="p-4 flex flex-col gap-2">
            {/* Live toggle. Off by default; the user opts in per session because
                continuous capture costs API quota and the auto-trigger can
                surprise users. */}
            <button
              onClick={() => setLiveMode((v) => !v)}
              aria-pressed={liveMode}
              className={`w-full rounded-lg px-4 py-2 text-xs font-medium border transition-colors ${
                liveMode
                  ? 'bg-[var(--cromo-accent-soft)] border-[var(--cromo-accent)]/40 text-[var(--cromo-accent)]'
                  : 'bg-[var(--cromo-surface)] border-[var(--cromo-border-strong)] text-[var(--cromo-fg-muted)]'
              }`}
            >
              {liveMode ? '⏸ Stop live scan' : '▶ Live scan (auto-capture)'}
            </button>
            {!liveMode && (
              <button
                onClick={capture}
                className="w-full rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--cromo-accent-strong)]"
              >
                Capture
              </button>
            )}
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
  // `appendMode` signals "treat this file as one of many in a live session" —
  // skip the preview swap and append result cards instead of replacing them.
  onFiles: (files: File[], opts?: { appendMode?: boolean }) => void;
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
          // CameraModal handles its own close after a single capture; in live
          // mode it keeps streaming and fires onCapture per stable frame. We
          // forward each file to the scan pipeline, telling it to append when
          // in live mode so previously-identified cards aren't wiped.
          onCapture={(file, liveMode) => { onFiles([file], { appendMode: !!liveMode }); }}
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
        className="w-full rounded-lg border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {open && query && !disabled && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setQuery('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]"
        >
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      )}
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
  const [speechMuted, setSpeechMutedState] = useState(() => isSpeechMuted());
  const speechSupported = isSpeechSupported();
  // Session-scoped log of successful adds, used to seed the pack-share card.
  // Cleared when the user resets the Scanner or dismisses the share modal.
  const [packEntries, setPackEntries] = useState<PackEntry[]>([]);
  const [showShareCard, setShowShareCard] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchAllStickers(token, album.albumTypeKey).then(setCatalog).catch(() => {});
  }, [token, album.albumTypeKey]);

  // Remember which album the user is scanning into so the dashboard can offer
  // a one-tap "resume scanning {album}" entry on their next session. We stamp
  // it as soon as the Scanner mounts for a given album — opening the Scanner
  // is itself the signal of intent; we don't need to wait for a successful add.
  useEffect(() => {
    rememberLastScan(album.id, albumDisplayName(album));
    recordScanDay();
  }, [album.id, album]);

  // Monotonic sequence so we can detect a stale identification landing after a
  // newer one. Critical in live mode: the user pans to sticker B while sticker
  // A's identify request is in flight; without ordering protection, A's card
  // can append AFTER B's, surprising the user. Non-live paths still benefit if
  // a user resets mid-scan.
  const sessionSeqRef = useRef(0);

  const handleFiles = useCallback(
    async (files: File[], opts?: { appendMode?: boolean }) => {
      if (!token) return;
      const append = opts?.appendMode ?? false;
      // Each invocation claims a unique seq. Reset bumps the seq too (see
      // reset()), which invalidates any in-flight requests so their cards
      // don't land after the user cleared.
      sessionSeqRef.current += 1;
      const mySeq = sessionSeqRef.current;
      // When a manual non-append capture starts, it supersedes everything
      // in-flight — bump the seq again so the prior batch can't write back.
      if (!append) sessionSeqRef.current += 1;
      const liveSeq = append ? mySeq : sessionSeqRef.current;

      setScanError(undefined);
      if (!append) setResultCards([]);

      if (files.length === 1) {
        const file = files[0]!;
        const url = URL.createObjectURL(file);
        if (!append) {
          setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
          setStaged([]);
          setStatus('scanning');
        }

        let results: ScanResult[];
        try {
          results = await scanIdentify(file, token, album.albumTypeKey);
        } catch (err) {
          if (!append && liveSeq === sessionSeqRef.current) {
            setScanError((err as { message?: string }).message);
            setStatus('error');
          }
          return;
        }

        // Drop the result if a newer invocation has happened — only the latest
        // request gets to write back. Live mode's "append every result" path
        // is OK because append seqs only grow, never reset; the guard catches
        // the case where reset() happened mid-request.
        if (liveSeq !== sessionSeqRef.current) {
          if (!append) URL.revokeObjectURL(url);
          return;
        }

        const cards = results.length === 0
          ? [emptyScanCard(url)]
          : await Promise.all(results.map((r) => buildScanCard(url, r, token, catalog, album.settings.defaultBaseVariant)));

        // Re-check the seq after buildScanCard's async hops (variant + sticker
        // fetches). If reset() happened during those, the cards are stale.
        if (liveSeq !== sessionSeqRef.current) {
          if (!append) URL.revokeObjectURL(url);
          return;
        }

        if (append) {
          setResultCards((prev) => [...prev, ...cards]);
          // Don't churn status in append mode — the modal is in 'done' or
          // 'idle' and the user is mid-scan; flipping to scanning would
          // un-render their existing results for a frame.
        } else {
          setResultCards(cards);
          setStatus('done');
        }
        // Voice readback for the single-image path. Matched cards get a short
        // "Got {player}" — the user typically has the phone propped and their
        // hands in a sticker pile, so audio is the lowest-friction confirmation.
        const matched = cards.find((c) => c.sticker?.playerName);
        if (matched) speak(`Got ${matched.sticker!.playerName}`);
        else if (cards[0]?.noMatchMessage && !append) speak('No match');
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
            // Batch readback: announce only the first matched player per image
            // to keep audio from running long on a 10-image batch.
            const matched = newCards.find((c) => c.sticker?.playerName);
            if (matched) speak(matched.sticker!.playerName!);
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

  const handleCardStickerSelect = useCallback(
    async (idx: number, stickerId: string) => {
      if (!token) return;
      const s = catalog.find((c) => c.id === stickerId);
      if (!s) return;
      try {
        const variants = await fetchStickerVariants(s.albumCode, token, s.id);
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
    [catalog, token, album.settings.defaultBaseVariant],
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
      // Append to the session's pack-share log. We dedupe by albumCode so
      // bumping an already-added sticker doesn't double-count it.
      if (card.sticker) {
        const entry: PackEntry = {
          albumCode: card.sticker.albumCode,
          playerName: card.sticker.playerName ?? null,
          teamName: card.sticker.teamName ?? null,
        };
        setPackEntries((prev) => prev.some((p) => p.albumCode === entry.albumCode) ? prev : [...prev, entry]);
      }
      // Tell other tabs the collection moved. AlbumDetailClient subscribes
      // and reloads its view; without this, a /album/X tab in another
      // window stays stale after a successful scan-add.
      publishSync({ type: 'collection:changed', userId: user.id, albumId: album.id });
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
      publishSync({ type: 'collection:changed', userId: user.id, albumId: album.id });
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
    // Wipe pack log + invalidate any in-flight identifications. Predictable
    // behaviour: "reset" means "start over from scratch", including any
    // pending share state from prior captures.
    setPackEntries([]);
    sessionSeqRef.current += 1;
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
        // The value carries the sticker UUID so CC regional alternates that
        // share an album_code are still distinguishable by selection.
        return { value: s.id, label: `${base}${typeSuffix}` };
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
          {speechSupported && (
            <button
              onClick={() => {
                const next = !speechMuted;
                setSpeechMuted(next);
                setSpeechMutedState(next);
                if (!next) speak('Voice on.');
              }}
              aria-label={speechMuted ? 'Unmute voice feedback' : 'Mute voice feedback'}
              title={speechMuted ? 'Voice feedback off' : 'Voice feedback on'}
              className={`flex h-7 w-7 items-center justify-center rounded-btn transition-colors ${
                speechMuted
                  ? 'text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)]'
                  : 'text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-soft)]'
              }`}
            >
              {speechMuted ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 10v4h4l5 4V6L7 10H3z" />
                  <line x1="22" y1="9" x2="16" y2="15" />
                  <line x1="16" y1="9" x2="22" y2="15" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 10v4h4l5 4V6L7 10H3z" />
                  <path d="M16 8a5 5 0 010 8" />
                  <path d="M19 5a9 9 0 010 14" />
                </svg>
              )}
            </button>
          )}
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
                      className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 text-white text-sm flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity leading-none"
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
                const stickerDisplayValue = card.sticker
                  ? stickerOptions.find((o) => o.value === card.sticker!.id)?.label ?? ''
                  : '';

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
                      {/* Partial / unmatched cards aren't ambiguous to the
                          backend — they're ambiguous to the model. Make the
                          path to "this isn't it" obvious so the user fixes the
                          identification before tapping Add rather than after. */}
                      {(card.matchType === 'name' || card.matchType === 'none') && card.variants.length > 0 && (
                        <div className="rounded-md bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 px-3 py-2 text-xs text-[var(--cromo-warning-text)]">
                          Not the right sticker? Tap the field below and search by name or album code.
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--cromo-fg-muted)] block">Sticker</label>
                        <ComboBox
                          value={stickerDisplayValue}
                          options={stickerOptions}
                          onSelect={(opt) => handleCardStickerSelect(idx, opt.value)}
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

          {/* Pack-share CTA appears once the session crosses 3 distinct adds.
              Same threshold as a typical pack — small enough that even a slow
              scan session triggers it, big enough that single-sticker scans
              don't get a "share" prompt every time. */}
          {packEntries.length >= 3 && (
            <button
              onClick={() => setShowShareCard(true)}
              className="w-full rounded-lg bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] border border-[var(--cromo-accent)]/30 px-4 py-2.5 text-sm font-semibold hover:brightness-110"
            >
              📸 Share this pack ({packEntries.length})
            </button>
          )}
        </>
      )}

      {showShareCard && (
        <PackShareCard
          albumLabel={albumDisplayName(album)}
          entries={packEntries}
          onClose={() => setShowShareCard(false)}
          onShared={() => {
            // After a successful share, clear the session log so the next
            // "Share this pack" CTA only includes adds made *after* the share.
            // Without this, a user who shares, adds more, then shares again
            // would re-publish previously-shared stickers.
            setPackEntries([]);
          }}
        />
      )}
    </div>
  );
}
