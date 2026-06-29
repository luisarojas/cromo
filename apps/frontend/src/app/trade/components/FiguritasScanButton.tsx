'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { TradeListItem } from '@cromo/shared';
import { parseFiguritas } from '@/app/trade/figuritas/parseFiguritas';

interface Props {
  /** Fired once a Figuritas QR is decoded and parsed into Cromo buckets. */
  onResult: (buckets: { offered: TradeListItem[]; wanted: TradeListItem[]; album: string }) => void;
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

function ScannerModal({ onResult, onClose }: { onResult: Props['onResult']; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [primed, setPrimed] = useState(() => isCameraPrimed());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<ScanError | null>(null);
  // While an error banner is shown we pause decoding so the user can read it;
  // "Try again" clears it and the loop resumes.
  const [paused, setPaused] = useState(false);

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

  // Decode loop: grab a frame ~4×/s, run it through jsQR, and parse any hit.
  // A successful parse stops the camera and hands the buckets up; a malformed
  // or non-Figuritas QR surfaces an inline message and pauses for "Try again".
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

      const parsed = parseFiguritas(hit.data);
      if (parsed.kind === 'ok') {
        cancelled = true;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onResult({ offered: parsed.offered, wanted: parsed.wanted, album: parsed.album });
        onClose();
        return;
      }
      // A readable QR that isn't a usable Figuritas export: explain and pause.
      setError(parsed);
      setPaused(true);
    };

    const scheduleNext = () => { if (!cancelled) setTimeout(tick, SCAN_INTERVAL_MS); };
    const t = setTimeout(tick, SCAN_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ready, paused, onResult, onClose]);

  function retry() {
    setError(null);
    setPaused(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--cromo-surface)] rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cromo-border)]">
          <span className="font-medium text-sm text-[var(--cromo-fg)]">Scan a Figuritas QR</span>
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
            <p className="font-medium leading-tight">Point your camera at a Figuritas app QR.</p>
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
                  That doesn&apos;t look like a Figuritas trade QR. Make sure it&apos;s the
                  intercambio / swap code, not a profile or app-store link.
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
                  This Figuritas QR uses a compact format Cromo can&apos;t read yet. Ask them to share
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
          </div>
        )}
      </div>
    </div>
  );
}

export default function FiguritasScanButton({ onResult, disabled }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent)]/10 px-3 py-2 text-sm font-medium text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent)]/20 disabled:opacity-50 transition-colors"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm6-2h6v6h-6V3zm2 2v2h2V5h-2zM3 11h6v6H3v-6zm2 2v2h2v-2H5zm6 0h2v-2h2v2h2v2h-2v2h-2v-2h-2v2h-2v-4h2v-2zm4 4h2v-2h-2v2z" />
        </svg>
        Scan a Figuritas QR
      </button>
      {open && <ScannerModal onResult={onResult} onClose={() => setOpen(false)} />}
    </>
  );
}
