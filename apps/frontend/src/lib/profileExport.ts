import {
  fetchPublicOffered,
  fetchPublicWanted,
  type PublicInventoryItem,
} from '@/lib/api';
import { isBaseVariant, variantShort } from '@/app/album/components/variantMeta';

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
const SPECIAL_BUCKET_ORDER = ['FWC', 'Coca-Cola', 'Extras', 'Other'];

function bucketFor(item: PublicInventoryItem): string {
  return BUCKET_BY_TYPE[item.stickerType] ?? item.teamName ?? 'Other';
}

function compareBuckets(a: string, b: string): number {
  const ai = SPECIAL_BUCKET_ORDER.indexOf(a);
  const bi = SPECIAL_BUCKET_ORDER.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return 1;
  if (bi !== -1) return -1;
  return a.localeCompare(b);
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
  const grouped = new Map<string, PublicInventoryItem[]>();
  for (const item of items) {
    const key = bucketFor(item);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return [...grouped.keys()]
    .sort(compareBuckets)
    .map((key) => {
      const sorted = (grouped.get(key) ?? [])
        .slice()
        .sort((a, b) => a.number - b.number);
      return `${key}: ${sorted.map((i) => formatItem(i, isOffered)).join(', ')}`;
    })
    .join('\n');
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
