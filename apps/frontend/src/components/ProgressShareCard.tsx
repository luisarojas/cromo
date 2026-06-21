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

function buildSvg(p: Omit<Props, 'onClose' | 'onShared'>): string {
  const pct = Math.max(0, Math.min(100, p.stats.percentage));
  const pctLabel = pct >= 99.95 ? '100' : pct.toFixed(1);
  const ringR = 230;
  const ringStroke = 34;
  const ringCx = SIZE / 2;
  const ringCy = 500;
  const circumference = 2 * Math.PI * ringR;
  const dash = (pct / 100) * circumference;
  const hasDuplicates = p.stats.duplicates != null && p.stats.duplicates > 0;
  const hasMissing = p.stats.missing != null;
  const statsLine = hasMissing
    ? `${p.stats.missing} missing${hasDuplicates ? `  ·  ${p.stats.duplicates} duplicates` : ''}`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0A0B0F"/>
        <stop offset="100%" stop-color="#13151B"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#22D3EE"/>
        <stop offset="35%" stop-color="#A78BFA"/>
        <stop offset="65%" stop-color="#F472B6"/>
        <stop offset="100%" stop-color="#FBBF24"/>
      </linearGradient>
      <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#22D3EE"/>
        <stop offset="50%" stop-color="#A78BFA"/>
        <stop offset="100%" stop-color="#F472B6"/>
      </linearGradient>
    </defs>

    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect x="0" y="0" width="${SIZE}" height="6" fill="url(#accent)"/>

    <!-- Header -->
    <g transform="translate(${PAD}, ${PAD + 20})">
      <rect x="0" y="0" width="56" height="56" rx="14" fill="url(#accent)"/>
      <text x="76" y="24" font-family="Inter, system-ui" font-size="22" font-weight="800" fill="#FFFFFF">Cromo</text>
      <text x="76" y="50" font-family="Inter, system-ui" font-size="13" letter-spacing="3" font-weight="600" fill="#7DD3FC">COLLECTION · PROGRESS</text>
    </g>

    <!-- Progress ring -->
    <g transform="translate(${ringCx}, ${ringCy})">
      <circle r="${ringR}" fill="none" stroke="#1A1D24" stroke-width="${ringStroke}"/>
      <circle r="${ringR}" fill="none" stroke="url(#ringGrad)" stroke-width="${ringStroke}"
              stroke-linecap="round"
              stroke-dasharray="${dash} ${circumference - dash}"
              transform="rotate(-90)"/>
      <text x="0" y="0" font-family="Inter, system-ui" font-size="150" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${pctLabel}<tspan font-size="64" fill="#94A3B8" dx="6" dy="-40">%</tspan></text>
      <text x="0" y="110" font-family="Inter, system-ui" font-size="28" font-weight="600" fill="#CBD5E1" text-anchor="middle">${p.stats.owned} / ${p.stats.total} stickers</text>
    </g>

    ${statsLine ? `<text x="${SIZE / 2}" y="${ringCy + ringR + 70}" font-family="Inter, system-ui" font-size="22" font-weight="500" fill="#94A3B8" text-anchor="middle">${statsLine}</text>` : ''}

    <!-- Divider -->
    <line x1="${PAD}" y1="${SIZE - 240}" x2="${SIZE - PAD}" y2="${SIZE - 240}" stroke="#1F2230" stroke-width="1"/>

    <!-- Collector label -->
    <g transform="translate(${PAD}, ${SIZE - 190})">
      <text x="0" y="0" font-family="Inter, system-ui" font-size="14" letter-spacing="3" font-weight="700" fill="#7DD3FC">COLLECTOR</text>
      <text x="0" y="44" font-family="Inter, system-ui" font-size="40" font-weight="800" fill="#FFFFFF">${escapeXml(p.collectorName)}</text>
      ${p.username ? `<text x="0" y="78" font-family="Inter, system-ui" font-size="20" fill="#94A3B8">@${escapeXml(p.username)}</text>` : ''}
    </g>

    <!-- Album label -->
    <g transform="translate(${SIZE - PAD}, ${SIZE - 190})" text-anchor="end">
      <text x="0" y="0" font-family="Inter, system-ui" font-size="14" letter-spacing="3" font-weight="700" fill="#F472B6">ALBUM</text>
      <text x="0" y="44" font-family="Inter, system-ui" font-size="28" font-weight="700" fill="#E5E7EB">${escapeXml(p.albumLabel)}</text>
    </g>

    <!-- Footer -->
    <text x="${SIZE / 2}" y="${SIZE - 48}" font-family="Inter, system-ui" font-size="18" letter-spacing="2" font-weight="600" fill="#64748B" text-anchor="middle">cromotrade.ca</text>
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
