'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { TradeListItem } from '@cromo/shared';
import { BottomSheet } from '@/components/BottomSheet';
import { THIRD_PARTY_APPS, type ThirdPartyApp } from '@/app/trade/thirdPartyImport';
import { TOOLBAR_BTN_CLASS } from './toolbarButton';

interface Props {
  /** Fired once a supported app's QR is decoded into Cromo trade buckets. */
  onResult: (buckets: { offered: TradeListItem[]; wanted: TradeListItem[] }) => void;
  disabled?: boolean;
}

// Shared with the sticker Scanner so granting camera access in one place
// suppresses the primer in the other.
const CAMERA_PRIMED_KEY = 'cromo:cameraPrimed';
function isCameraPrimed(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(CAMERA_PRIMED_KEY) === '1'; } catch { return false; }
}
function markCameraPrimed(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CAMERA_PRIMED_KEY, '1'); } catch { /* ignore */ }
}

type ScanError =
  | { kind: 'unsupported-encoding' }
  | { kind: 'wrong-album'; album: string }
  | { kind: 'unrecognized' }
  | { kind: 'camera'; message: string };

/**
 * Decode a QR from a still image the user picked from their gallery or snapped.
 * Mirrors the camera path's jsQR call but works off a one-shot canvas draw.
 * Phone photos run to a dozen megapixels — we cap the working resolution so
 * jsQR stays fast; QR finder patterns survive the downscale comfortably.
 * Returns the raw QR text, or `null` when no code is found.
 */
async function decodeQrFromImage(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = url;
    });
    const MAX_DIM = 1600;
    const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const scale = Math.min(1, MAX_DIM / longest);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const hit = jsQR(image.data, image.width, image.height);
    return hit?.data ?? null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Camera + jsQR loop, decoding against one app's parser. */
function QrScanModal({ app, onResult, onClose }: { app: ThirdPartyApp; onResult: Props['onResult']; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [primed, setPrimed] = useState(() => isCameraPrimed());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<ScanError | null>(null);
  // While an error banner is shown we pause decoding so the user can read it;
  // "Try again" clears it and the loop resumes.
  const [paused, setPaused] = useState(false);
  // Decoding a picked image is one-shot and off the camera loop.
  const [decoding, setDecoding] = useState(false);

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
          videoRef.current.play().then(() => setReady(true)).catch(() => {});
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError({ kind: 'camera', message: err.message || 'Camera access denied' });
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [primed]);

  // Decode loop: grab a frame ~4×/s, run it through jsQR, and parse any hit
  // with the active app's parser. A success stops the camera and hands the
  // buckets up; an unreadable/foreign QR surfaces an inline message and pauses.
  useEffect(() => {
    if (!ready || paused) return;
    let cancelled = false;
    const SCAN_INTERVAL_MS = 250;

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        scheduleNext();
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { scheduleNext(); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hit = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (!hit) { scheduleNext(); return; }

      const parsed = app.parseQr(hit.data);
      if (parsed.kind === 'ok') {
        cancelled = true;
        finish(parsed.offered, parsed.wanted);
        return;
      }
      setError(parsed);
      setPaused(true);
    };

    const scheduleNext = () => { if (!cancelled) setTimeout(tick, SCAN_INTERVAL_MS); };
    const t = setTimeout(tick, SCAN_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, paused, app, onResult, onClose]);

  function finish(offered: TradeListItem[], wanted: TradeListItem[]) {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onResult({ offered, wanted });
    onClose();
  }

  // Picking an image runs the same parser as the camera, so a screenshot or
  // saved photo of a partner's QR works without ever opening the camera.
  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setPaused(true); // hold the camera loop while we decode
    setDecoding(true);
    try {
      const raw = await decodeQrFromImage(file);
      if (raw === null) {
        setError({ kind: 'unrecognized' });
        return;
      }
      const parsed = app.parseQr(raw);
      if (parsed.kind === 'ok') {
        finish(parsed.offered, parsed.wanted);
        return;
      }
      setError(parsed);
    } catch {
      setError({ kind: 'unrecognized' });
    } finally {
      setDecoding(false);
      // Reset so re-picking the same file fires onChange again.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function retry() {
    setError(null);
    setPaused(false);
  }

  const uploadControl = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleUpload(e.target.files)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={decoding}
        className="w-full rounded-lg border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-4 py-2.5 text-sm font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:border-[var(--cromo-accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {decoding ? 'Reading image…' : 'Upload a photo of the QR'}
      </button>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--cromo-surface)] rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cromo-border)]">
          <span className="font-medium text-sm text-[var(--cromo-fg)]">Add a {app.name} QR</span>
          <button
            onClick={onClose}
            className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] text-xl leading-none"
            aria-label="Close scanner"
          >
            ✕
          </button>
        </div>

        {!primed ? (
          <div className="p-5 space-y-4 text-sm text-[var(--cromo-fg)]">
            <p className="font-medium leading-tight">Point your camera at a {app.name} trade QR.</p>
            <p className="text-xs text-[var(--cromo-fg-muted)] leading-relaxed">
              We open the camera on your device and read the code locally — nothing about the other
              collector is sent anywhere. We just compare their list with your collection.
            </p>
            <button
              onClick={() => setPrimed(true)}
              className="w-full rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--cromo-accent-strong)]"
            >
              Open camera
            </button>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--cromo-fg-subtle)]">
              <span className="h-px flex-1 bg-[var(--cromo-border)]" />
              or
              <span className="h-px flex-1 bg-[var(--cromo-border)]" />
            </div>
            {uploadControl}
            {error?.kind === 'unrecognized' && (
              <p className="text-xs text-[var(--cromo-warning-text)]">
                No {app.name} QR found in that image. Make sure the whole code is in frame and in focus.
              </p>
            )}
            {error?.kind === 'wrong-album' && (
              <p className="text-xs text-[var(--cromo-warning-text)]">
                That QR is for a different album ({error.album}). Cromo can only match World Cup 2026 codes.
              </p>
            )}
            {error?.kind === 'unsupported-encoding' && (
              <p className="text-xs text-[var(--cromo-warning-text)]">
                That {app.name} QR uses a compact format Cromo can&apos;t read yet.
              </p>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              {!error && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-2/3 w-2/3 rounded-lg border-2 border-white/70" />
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {error?.kind === 'camera' && (
              <p className="text-xs text-[var(--cromo-danger-text)]">{error.message}</p>
            )}
            {error?.kind === 'unrecognized' && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--cromo-warning-text)]">
                  That doesn&apos;t look like a {app.name} trade QR. Make sure it&apos;s their swap /
                  intercambio code, not a profile or app-store link.
                </p>
                <button onClick={retry} className="text-xs font-medium text-[var(--cromo-accent)] hover:underline">Try again</button>
              </div>
            )}
            {error?.kind === 'wrong-album' && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--cromo-warning-text)]">
                  This QR is for a different album ({error.album}). Cromo can only match World Cup 2026 codes.
                </p>
                <button onClick={retry} className="text-xs font-medium text-[var(--cromo-accent)] hover:underline">Try again</button>
              </div>
            )}
            {error?.kind === 'unsupported-encoding' && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--cromo-warning-text)]">
                  This {app.name} QR uses a compact format Cromo can&apos;t read yet. Ask them to share
                  their list as text, or paste their codes below instead.
                </p>
                <button onClick={retry} className="text-xs font-medium text-[var(--cromo-accent)] hover:underline">Try again</button>
              </div>
            )}
            {!error && (
              <p className="text-center text-xs text-[var(--cromo-fg-subtle)]">
                {ready ? 'Hold steady over the QR…' : 'Starting camera…'}
              </p>
            )}
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--cromo-fg-subtle)]">
              <span className="h-px flex-1 bg-[var(--cromo-border)]" />
              or
              <span className="h-px flex-1 bg-[var(--cromo-border)]" />
            </div>
            {uploadControl}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Import from another app" — one button that opens a chooser of supported
 * sticker apps, then launches that app's QR scanner. Generic by construction:
 * the chooser and scanner are driven by the `THIRD_PARTY_APPS` registry, so a
 * new app needs no changes here.
 */
export default function ThirdPartyAppImport({ onResult, disabled }: Props) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [activeApp, setActiveApp] = useState<ThirdPartyApp | null>(null);

  return (
    <>
      <button type="button" onClick={() => setChooserOpen(true)} disabled={disabled} className={TOOLBAR_BTN_CLASS}>
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm6-2h6v6h-6V3zm2 2v2h2V5h-2zM3 11h6v6H3v-6zm2 2v2h2v-2H5zm6 0h2v-2h2v2h2v2h-2v2h-2v-2h-2v2h-2v-4h2v-2zm4 4h2v-2h-2v2z" />
        </svg>
        Import from another app
      </button>

      <BottomSheet open={chooserOpen} onClose={() => setChooserOpen(false)} ariaLabel="Import from another app">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">Import from another app</h3>
          <p className="mt-1 text-xs text-[var(--cromo-fg-muted)]">
            Scan or upload a trade QR from a supported app to fill in their list automatically.
          </p>
          <ul className="mt-4 space-y-2">
            {THIRD_PARTY_APPS.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  onClick={() => { setChooserOpen(false); setActiveApp(app); }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-4 py-3 text-left hover:border-[var(--cromo-accent)] transition-colors"
                >
                  <span>
                    <span className="block text-sm font-medium text-[var(--cromo-fg)]">{app.name}</span>
                    <span className="block text-xs text-[var(--cromo-fg-muted)]">{app.blurb}</span>
                  </span>
                  <span className="text-xs font-medium text-[var(--cromo-accent)] shrink-0">Import →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </BottomSheet>

      {activeApp && (
        <QrScanModal app={activeApp} onResult={onResult} onClose={() => setActiveApp(null)} />
      )}
    </>
  );
}
