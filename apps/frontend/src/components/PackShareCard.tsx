'use client';

import { useEffect, useRef, useState } from 'react';

// "Share this pack" — after a scanning session adds 3+ stickers, the Scanner
// surfaces this modal with a stylized card listing what landed in the pack.
// The card is rendered as an SVG (so layout is text-precise without a
// headless browser), rasterized to a PNG via canvas, and offered via the
// Web Share API as a File when available; otherwise we fall back to a
// download. Pure frontend — no html2canvas / satori dep.

export interface PackEntry {
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
}

interface Props {
  albumLabel: string;
  entries: PackEntry[];
  // Fires when the modal dismisses for any reason. Caller can choose to clear
  // its session log on this to avoid the next share dragging old entries in.
  onClose: () => void;
  // Fires on a *successful* share or download. Carries 'shared' or 'downloaded'
  // so the caller can confirm with a toast or analytics if wanted.
  onShared?: (via: 'shared' | 'downloaded') => void;
}

const CARD_W = 720;
const ROW_H = 44;
const HEADER_H = 168;
const FOOTER_H = 80;
const PADDING_X = 48;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Cap on rows we draw in the SVG. Canvas/Image budgets on lower-end phones
// start failing well below the theoretical limit; 20 rows is plenty for a
// "pack opening" share moment and keeps the image around 1140px tall at
// 2× upscale (well within reasonable IG/Twitter dimensions).
const MAX_ROWS = 20;

function buildSvg(albumLabel: string, entries: PackEntry[]): string {
  const shown = entries.slice(0, MAX_ROWS);
  const overflowCount = entries.length - shown.length;
  const totalRows = shown.length + (overflowCount > 0 ? 1 : 0);
  const height = HEADER_H + totalRows * ROW_H + FOOTER_H;

  // Truncate player names so they don't overflow the row. We approximate
  // capacity at 38 characters — `Inter` at 16px renders comfortably within
  // the available row width up to that count.
  const truncate = (s: string) => s.length > 38 ? s.slice(0, 37) + '…' : s;

  const rows = shown.map((e, i) => {
    const y = HEADER_H + i * ROW_H;
    const label = truncate(e.playerName ?? e.teamName ?? '—');
    return `
      <g transform="translate(0, ${y})">
        <rect x="${PADDING_X}" y="0" width="${CARD_W - PADDING_X * 2}" height="${ROW_H - 6}" rx="10" fill="#1A1D24" stroke="#262932" stroke-width="1"/>
        <text x="${PADDING_X + 18}" y="${ROW_H / 2}" font-family="Inter, system-ui" font-size="18" font-weight="700" fill="#E5E7EB" dominant-baseline="central">${escapeXml(e.albumCode)}</text>
        <text x="${PADDING_X + 100}" y="${ROW_H / 2}" font-family="Inter, system-ui" font-size="16" fill="#CBD5E1" dominant-baseline="central">${escapeXml(label)}</text>
      </g>`;
  }).join('') + (overflowCount > 0 ? `
    <g transform="translate(0, ${HEADER_H + shown.length * ROW_H})">
      <text x="${PADDING_X + 18}" y="${ROW_H / 2}" font-family="Inter, system-ui" font-size="14" fill="#94A3B8" dominant-baseline="central">+ ${overflowCount} more</text>
    </g>` : '');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${height}" width="${CARD_W}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0A0B0F"/>
        <stop offset="100%" stop-color="#13151B"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#7DD3FC"/>
        <stop offset="50%" stop-color="#A78BFA"/>
        <stop offset="100%" stop-color="#F472B6"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect x="0" y="0" width="${CARD_W}" height="4" fill="url(#accent)"/>
    <text x="${PADDING_X}" y="64" font-family="Inter, system-ui" font-size="14" font-weight="600" letter-spacing="3" fill="#7DD3FC">PACK OPENING</text>
    <text x="${PADDING_X}" y="108" font-family="Inter, system-ui" font-size="36" font-weight="800" fill="#FFFFFF">${escapeXml(albumLabel)}</text>
    <text x="${PADDING_X}" y="138" font-family="Inter, system-ui" font-size="16" fill="#94A3B8">${entries.length} new sticker${entries.length === 1 ? '' : 's'}</text>
    ${rows}
    <text x="${PADDING_X}" y="${height - 32}" font-family="Inter, system-ui" font-size="12" fill="#64748B">cromotrade.ca</text>
  </svg>`;
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  // Round-trip: serialise SVG → object URL → Image → canvas → PNG blob.
  // CanvasRenderingContext2D.drawImage is the only platform path that
  // doesn't require a third-party renderer.
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('SVG load failed'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    // Render at 2× for crisp output on retina + social previews.
    const scale = 2;
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PackShareCard({ albumLabel, entries, onClose, onShared }: Props) {
  const svgString = buildSvg(albumLabel, entries);
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  async function handleShare() {
    setBusy('share');
    setError(null);
    try {
      const blob = await svgToPngBlob(svgString);
      const file = new File([blob], `cromo-pack-${Date.now()}.png`, { type: 'image/png' });
      const canShareFile = typeof navigator !== 'undefined'
        && 'canShare' in navigator
        && (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare?.({ files: [file] });
      if (canShareFile && typeof navigator.share === 'function') {
        await navigator.share({ files: [file], title: 'My Cromo pack' });
        onShared?.('shared');
        onClose();
        return;
      }
      // Fallback: trigger a download. The user can attach it manually.
      triggerDownload(blob);
      onShared?.('downloaded');
      onClose();
    } catch (err) {
      // navigator.share throws on user cancel — that's not an error worth showing.
      const name = (err as Error & { name?: string }).name;
      if (name === 'AbortError') return;
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    setBusy('download');
    setError(null);
    try {
      const blob = await svgToPngBlob(svgString);
      triggerDownload(blob);
      onShared?.('downloaded');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function triggerDownload(blob: Blob) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = `cromo-pack-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div
      role="dialog"
      aria-label="Share pack"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--cromo-surface)] rounded-2xl shadow-cromo-lg w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cromo-border)]">
          <span className="text-sm font-semibold text-[var(--cromo-fg)]">Share your pack</span>
          <button onClick={onClose} aria-label="Close" className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] text-xl leading-none">✕</button>
        </div>
        {/* Inline SVG preview so the user knows what the export looks like. */}
        <div
          className="p-3 bg-[var(--cromo-surface-2)]"
          // Lay out the SVG as a responsive block — the markup is self-contained
          // and safe (we escaped XML at build time).
          dangerouslySetInnerHTML={{ __html: svgString.replace(/width="\d+"\s+height="\d+"/, '') }}
        />
        {error && (
          <p className="px-4 py-2 text-xs text-[var(--cromo-danger-text)]">{error}</p>
        )}
        <div className="px-4 py-3 flex items-center gap-2 border-t border-[var(--cromo-border)]">
          <button
            onClick={handleShare}
            disabled={!!busy}
            className="flex-1 rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2 text-sm font-semibold hover:bg-[var(--cromo-accent-strong)] disabled:opacity-60"
          >
            {busy === 'share' ? 'Preparing…' : 'Share'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!!busy}
            className="rounded-lg border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-[var(--cromo-fg-muted)] px-4 py-2 text-sm font-medium hover:bg-[var(--cromo-surface-2)] disabled:opacity-60"
          >
            {busy === 'download' ? 'Saving…' : 'Download PNG'}
          </button>
        </div>
      </div>
    </div>
  );
}
