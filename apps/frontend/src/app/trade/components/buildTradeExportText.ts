import type { ExternalStickerRef } from '@/lib/api';

const BUCKET_BY_TYPE: Record<string, string> = {
  intro: 'FWC',
  coca_cola_special: 'Coca-Cola',
  extra: 'Extras',
};

function bucketFor(ref: ExternalStickerRef): string {
  if (ref.stickerType && BUCKET_BY_TYPE[ref.stickerType]) {
    return BUCKET_BY_TYPE[ref.stickerType]!;
  }
  return ref.teamName ?? 'Other';
}

function isBaseToken(token: string | null): boolean {
  return token === 'base_border' || token === 'base_borderless';
}

function formatItem(ref: ExternalStickerRef): string {
  const variant =
    ref.variantToken && !isBaseToken(ref.variantToken) && ref.variantLabel
      ? ` (${ref.variantLabel})`
      : '';
  const qty = ref.quantity > 1 ? ` ×${ref.quantity}` : '';
  return `${ref.albumCode}${variant}${qty}`;
}

function formatSection(refs: ExternalStickerRef[]): string {
  if (refs.length === 0) return '(none)';
  // Mirrors lib/profileExport.ts: walk in album order (by sticker number)
  // and emit a fresh bucket header each time the section changes — so a
  // trade list reads as FWC → teams → FWC → Coca-Cola → Extras.
  const sorted = [...refs].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const lines: string[] = [];
  let runKey: string | null = null;
  let run: ExternalStickerRef[] = [];
  const flush = (): void => {
    if (runKey === null) return;
    lines.push(`${runKey}: ${run.map(formatItem).join(', ')}`);
  };
  for (const ref of sorted) {
    const key = bucketFor(ref);
    if (key !== runKey) {
      flush();
      runKey = key;
      run = [];
    }
    run.push(ref);
  }
  flush();
  return lines.join('\n');
}

function fmtDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Build the plain-text export of a third-party trade in the same bucket-by-
 * sticker-type format used by the profile copy-list (lib/profileExport.ts).
 * The two halves are framed as "Offers" (what I give) and "Needs" (what I
 * receive) so the partner can read it as their own incoming/outgoing.
 */
export function buildTradeExportText(opts: {
  title?: string;
  /** My display label — typically "You" or my username. */
  meLabel: string;
  /** Partner display label — typed by the user, falls back to "They". */
  partnerLabel: string;
  /** Stickers I receive (= partner's offers). */
  iReceive: ExternalStickerRef[];
  /** Stickers I give (= partner's needs). */
  iGive: ExternalStickerRef[];
  /** Cash partner gives me (cents). */
  iReceiveCashCents: number;
  /** Cash I give partner (cents). */
  iGiveCashCents: number;
}): string {
  const offersHeader = `Offers | ${opts.meLabel}`;
  const needsHeader = `Needs | ${opts.meLabel} (from ${opts.partnerLabel})`;

  const offersBody = formatSection(opts.iGive);
  const needsBody = formatSection(opts.iReceive);

  const cashLines: string[] = [];
  if (opts.iGiveCashCents > 0) cashLines.push(`+ Cash: $${fmtDollars(opts.iGiveCashCents)}`);
  if (opts.iReceiveCashCents > 0) cashLines.push(`+ Cash from ${opts.partnerLabel}: $${fmtDollars(opts.iReceiveCashCents)}`);

  return [
    opts.title ?? `Trade with ${opts.partnerLabel}`,
    '',
    offersHeader,
    offersBody,
    '',
    needsHeader,
    needsBody,
    ...(cashLines.length > 0 ? ['', cashLines.join('\n')] : []),
    '',
    'Matched via cromotrade.ca',
  ].join('\n');
}
