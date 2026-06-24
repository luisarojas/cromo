'use client';

import { useEffect, useRef, useState } from 'react';

// "Share progress" — a 1080×1080 square card the collector can post to
// Instagram / TikTok / WhatsApp. Same rendering model as PackShareCard:
// SVG → canvas → PNG, Web Share API for native share when available, file
// download as fallback. No headless browser, no third-party renderer.

interface Stats {
  owned: number;
  total: number;
  percentage: number; // 0-100, may be fractional
  missing?: number;
  duplicates?: number;
}

interface Props {
  collectorName: string;
  username?: string | null;
  albumLabel: string;
  stats: Stats;
  onClose: () => void;
  onShared?: (via: 'shared' | 'downloaded') => void;
}

const SIZE = 1080;
const PAD = 80;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function buildSvg(p: Omit<Props, 'onClose' | 'onShared'>): string {
  const pct = Math.max(0, Math.min(100, p.stats.percentage));
  // Integer percentage — at 1080px the share card is consumed at a glance;
  // decimals add visual noise and risk overflowing the ring's inner diameter.
  const pctLabel = `${Math.round(pct)}%`;
  const ringR = 220;
  const ringStroke = 30;
  const ringCx = SIZE / 2;
  const ringCy = 540;
  const circumference = 2 * Math.PI * ringR;
  const dash = (pct / 100) * circumference;
  const hasDuplicates = p.stats.duplicates != null && p.stats.duplicates > 0;
  const hasMissing = p.stats.missing != null;
  const statsLine = hasMissing
    ? `${p.stats.missing} missing${hasDuplicates ? `  ·  ${p.stats.duplicates} duplicates` : ''}`
    : '';

  const albumLabel = truncate(p.albumLabel, 32);
  const collectorLine = p.username
    ? `${truncate(p.collectorName, 24)}  ·  @${truncate(p.username, 22)}`
    : truncate(p.collectorName, 40);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
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
    <rect x="0" y="0" width="${SIZE}" height="4" fill="url(#accent)"/>

    <!-- Header -->
    <text x="${SIZE / 2}" y="${PAD + 40}" font-family="Inter, system-ui" font-size="14" letter-spacing="4" font-weight="700" fill="#7DD3FC" text-anchor="middle">CROMO · COLLECTION PROGRESS</text>

    <!-- Progress ring -->
    <g transform="translate(${ringCx}, ${ringCy})">
      <circle r="${ringR}" fill="none" stroke="#1A1D24" stroke-width="${ringStroke}"/>
      <circle r="${ringR}" fill="none" stroke="url(#accent)" stroke-width="${ringStroke}"
              stroke-linecap="round"
              stroke-dasharray="${dash} ${circumference - dash}"
              transform="rotate(-90)"/>
      <text x="0" y="-8" font-family="Inter, system-ui" font-size="170" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${pctLabel}</text>
      <text x="0" y="115" font-family="Inter, system-ui" font-size="26" font-weight="600" fill="#CBD5E1" text-anchor="middle">${p.stats.owned} / ${p.stats.total} stickers</text>
    </g>

    ${statsLine ? `<text x="${SIZE / 2}" y="${ringCy + ringR + 70}" font-family="Inter, system-ui" font-size="22" font-weight="500" fill="#94A3B8" text-anchor="middle">${statsLine}</text>` : ''}

    <!-- Identity caption -->
    <text x="${SIZE / 2}" y="${SIZE - 140}" font-family="Inter, system-ui" font-size="40" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(albumLabel)}</text>
    <text x="${SIZE / 2}" y="${SIZE - 92}" font-family="Inter, system-ui" font-size="22" font-weight="500" fill="#94A3B8" text-anchor="middle">${escapeXml(collectorLine)}</text>

    <!-- Footer -->
    <text x="${SIZE / 2}" y="${SIZE - 44}" font-family="Inter, system-ui" font-size="16" letter-spacing="3" font-weight="600" fill="#64748B" text-anchor="middle">cromotrade.ca</text>
  </svg>`;
}

async function svgToPngBlob(svg: string): Promise<Blob> {
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
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ProgressShareCard({
  collectorName,
  username,
  albumLabel,
  stats,
  onClose,
  onShared,
}: Props) {
  const svgString = buildSvg({ collectorName, username, albumLabel, stats });
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  async function handleShare() {
    setBusy('share');
    setError(null);
    try {
      const blob = await svgToPngBlob(svgString);
      const file = new File([blob], `cromo-progress-${Date.now()}.png`, { type: 'image/png' });
      const canShareFile =
        typeof navigator !== 'undefined' &&
        'canShare' in navigator &&
        (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare?.({
          files: [file],
        });
      if (canShareFile && typeof navigator.share === 'function') {
        await navigator.share({ files: [file], title: 'My Cromo progress' });
        onShared?.('shared');
        onClose();
        return;
      }
      triggerDownload(blob);
      onShared?.('downloaded');
      onClose();
    } catch (err) {
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
    a.download = `cromo-progress-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div
      role="dialog"
      aria-label="Share progress"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--cromo-surface)] rounded-2xl shadow-cromo-lg w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cromo-border)]">
          <span className="text-sm font-semibold text-[var(--cromo-fg)]">Share your progress</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] text-xl leading-none"
          >
            ✕
          </button>
        </div>
        <div
          className="p-3 bg-[var(--cromo-surface-2)]"
          dangerouslySetInnerHTML={{
            __html: svgString.replace(/width="\d+"\s+height="\d+"/, ''),
          }}
        />
        {error && <p className="px-4 py-2 text-xs text-[var(--cromo-danger-text)]">{error}</p>}
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
