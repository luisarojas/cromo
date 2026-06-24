import {
  fetchPublicOffered,
  fetchPublicWanted,
  type PublicInventoryItem,
} from '@/lib/api';
import { isBaseVariant, variantShort } from '@/app/collection/components/variantMeta';

export interface ExportFilters {
  stickerTypes?: string[];
  teams?: string[];
  variantTypes?: string[];
  search?: string;
}

const BUCKET_BY_TYPE: Record<string, string> = {
  intro: 'FWC',
  coca_cola_special: 'Coca-Cola',
  extra: 'Extras',
};

function bucketFor(item: PublicInventoryItem): string {
  return BUCKET_BY_TYPE[item.stickerType] ?? item.teamName ?? 'Other';
}

function formatItem(item: PublicInventoryItem, isOffered: boolean): string {
  const variant =
    item.variantType && !isBaseVariant(item.variantType)
      ? ` (${variantShort(item.variantType)})`
      : '';
  const qty = isOffered && (item.quantity ?? 0) > 1 ? ` ×${item.quantity}` : '';
  return `${item.albumCode}${variant}${qty}`;
}

function formatSection(items: PublicInventoryItem[], isOffered: boolean): string {
  if (items.length === 0) return '(none)';
  // Walk items in album order (by sticker number) and emit a fresh bucket
  // header each time the section changes. Mirrors the album page's StickerGrid:
  // FWC stickers split into head (FWC1–FWC8) and tail (FWC9+) runs surrounding
  // the team pages, so the export reads as FWC → teams → FWC → Coca-Cola → Extras.
  const sorted = [...items].sort((a, b) => a.number - b.number);
  const lines: string[] = [];
  let runKey: string | null = null;
  let run: PublicInventoryItem[] = [];
  const flush = () => {
    if (runKey === null) return;
    lines.push(`${runKey}: ${run.map((i) => formatItem(i, isOffered)).join(', ')}`);
  };
  for (const item of sorted) {
    const key = bucketFor(item);
    if (key !== runKey) {
      flush();
      runKey = key;
      run = [];
    }
    run.push(item);
  }
  flush();
  return lines.join('\n');
}

async function fetchAll(
  fetchFn: typeof fetchPublicOffered,
  username: string,
  albumId: string,
  filters: ExportFilters,
): Promise<PublicInventoryItem[]> {
  const all: PublicInventoryItem[] = [];
  let cursor: number | undefined = undefined;
  do {
    const page = await fetchFn(username, albumId, {
      cursor,
      limit: 200,
      ...filters,
    });
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return all;
}

export async function buildAlbumExportText(
  username: string,
  albumId: string,
  albumName: string,
  profileUrl: string,
  filters: ExportFilters = {},
): Promise<string> {
  const [offeredItems, wantedItems] = await Promise.all([
    fetchAll(fetchPublicOffered, username, albumId, filters),
    fetchAll(fetchPublicWanted, username, albumId, filters),
  ]);
  return [
    `Offers | ${albumName}\n${formatSection(offeredItems, true)}`,
    `Needs | ${albumName}\n${formatSection(wantedItems, false)}`,
    profileUrl,
  ].join('\n\n');
}
