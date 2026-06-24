import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicInventoryItem } from '@/lib/api';

// Mock the two API functions profileExport calls. Vitest hoists vi.mock, so
// we can refer to the mocked symbols from the test body after.
vi.mock('@/lib/api', () => ({
  fetchPublicOffered: vi.fn(),
  fetchPublicWanted: vi.fn(),
}));

import { fetchPublicOffered, fetchPublicWanted } from '@/lib/api';
import { buildAlbumExportText } from '@/lib/profileExport';

function item(partial: Partial<PublicInventoryItem>): PublicInventoryItem {
  return {
    stickerVariantId: 'v-' + Math.random(),
    number: 1,
    albumCode: 'XXX1',
    playerName: null,
    stickerType: 'core',
    teamName: null,
    fifaCode: null,
    groupName: null,
    variantType: 'base_border',
    quantity: 1,
    ...partial,
  };
}

beforeEach(() => {
  vi.mocked(fetchPublicOffered).mockReset();
  vi.mocked(fetchPublicWanted).mockReset();
});

describe('buildAlbumExportText', () => {
  it('renders Offers and Needs sections with the album name and profile URL', async () => {
    vi.mocked(fetchPublicOffered).mockResolvedValueOnce({
      items: [item({ albumCode: 'BRA5', number: 5, teamName: 'Brazil' })],
      nextCursor: null,
    } as any);
    vi.mocked(fetchPublicWanted).mockResolvedValueOnce({
      items: [item({ albumCode: 'ARG7', number: 7, teamName: 'Argentina' })],
      nextCursor: null,
    } as any);

    const text = await buildAlbumExportText(
      'luisa',
      'album-1',
      'FIFA 2026',
      'https://cromotrade.ca/u/luisa',
    );

    expect(text).toContain('Offers | FIFA 2026');
    expect(text).toContain('Needs | FIFA 2026');
    expect(text).toContain('Brazil: BRA5');
    expect(text).toContain('Argentina: ARG7');
    expect(text.endsWith('https://cromotrade.ca/u/luisa')).toBe(true);
  });

  it('walks items in album order and re-emits FWC after teams when split', async () => {
    // Real FIFA album layout: FWC head (00 + FWC1–FWC8), then 48 team pages,
    // then FWC tail (FWC9–FWC19), then Coca-Cola, then Extras. The export
    // walks by sticker number and emits a fresh bucket header each time the
    // section changes, so FWC renders twice — once before and once after teams.
    vi.mocked(fetchPublicOffered).mockResolvedValueOnce({
      items: [
        item({ albumCode: '00', number: 0, stickerType: 'intro' }),
        item({ albumCode: 'FWC3', number: 3, stickerType: 'intro' }),
        item({ albumCode: 'ARG30', number: 30, teamName: 'Argentina' }),
        item({ albumCode: 'BRA50', number: 50, teamName: 'Brazil' }),
        item({ albumCode: 'FWC12', number: 600, stickerType: 'intro' }),
        item({ albumCode: 'CC4', number: 700, stickerType: 'coca_cola_special' }),
        item({ albumCode: 'EX1', number: 800, stickerType: 'extra' }),
      ],
      nextCursor: null,
    } as any);
    vi.mocked(fetchPublicWanted).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    } as any);

    const text = await buildAlbumExportText('u', 'a', 'Album', 'url');
    const offers = text.split('\n\n')[0]!;
    const lines = offers.split('\n').slice(1); // skip "Offers | Album" header

    expect(lines).toEqual([
      'FWC: 00, FWC3',
      'Argentina: ARG30',
      'Brazil: BRA50',
      'FWC: FWC12',
      'Coca-Cola: CC4',
      'Extras: EX1',
    ]);
  });

  it('sorts stickers within a team by sticker number', async () => {
    vi.mocked(fetchPublicOffered).mockResolvedValueOnce({
      items: [
        item({ albumCode: 'BRA17', number: 17, teamName: 'Brazil' }),
        item({ albumCode: 'BRA5', number: 5, teamName: 'Brazil' }),
        item({ albumCode: 'BRA9', number: 9, teamName: 'Brazil' }),
      ],
      nextCursor: null,
    } as any);
    vi.mocked(fetchPublicWanted).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    } as any);

    const text = await buildAlbumExportText('u', 'a', 'Album', 'url');
    expect(text).toContain('Brazil: BRA5, BRA9, BRA17');
  });

  it('appends a variant tag in parentheses for non-base variants only', async () => {
    vi.mocked(fetchPublicOffered).mockResolvedValueOnce({
      items: [
        item({ albumCode: 'BRA1', number: 1, teamName: 'Brazil', variantType: 'base_border' }),
        item({ albumCode: 'BRA2', number: 2, teamName: 'Brazil', variantType: 'blue' }),
        item({ albumCode: 'BRA3', number: 3, teamName: 'Brazil', variantType: 'extra_gold' }),
      ],
      nextCursor: null,
    } as any);
    vi.mocked(fetchPublicWanted).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    } as any);

    const text = await buildAlbumExportText('u', 'a', 'Album', 'url');
    expect(text).toContain('BRA1,'); // base — no parens
    expect(text).toContain('BRA2 (Blue)');
    expect(text).toContain('BRA3 (EX Gold)');
  });

  it('shows a quantity multiplier on the Offers side only', async () => {
    vi.mocked(fetchPublicOffered).mockResolvedValueOnce({
      items: [item({ albumCode: 'BRA5', number: 5, teamName: 'Brazil', quantity: 3 })],
      nextCursor: null,
    } as any);
    vi.mocked(fetchPublicWanted).mockResolvedValueOnce({
      items: [item({ albumCode: 'BRA9', number: 9, teamName: 'Brazil', quantity: 5 })],
      nextCursor: null,
    } as any);

    const text = await buildAlbumExportText('u', 'a', 'Album', 'url');
    expect(text).toContain('Brazil: BRA5 ×3');
    // Needs side ignores quantity.
    expect(text).toContain('Brazil: BRA9');
    expect(text).not.toContain('BRA9 ×');
  });

  it('renders "(none)" when a section is empty', async () => {
    vi.mocked(fetchPublicOffered).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    } as any);
    vi.mocked(fetchPublicWanted).mockResolvedValueOnce({
      items: [item({ albumCode: 'BRA1', number: 1, teamName: 'Brazil' })],
      nextCursor: null,
    } as any);

    const text = await buildAlbumExportText('u', 'a', 'Album', 'url');
    expect(text).toContain('Offers | Album\n(none)');
  });

  it('follows pagination via nextCursor until exhausted', async () => {
    vi.mocked(fetchPublicOffered)
      .mockResolvedValueOnce({
        items: [item({ albumCode: 'BRA1', number: 1, teamName: 'Brazil' })],
        nextCursor: 1,
      } as any)
      .mockResolvedValueOnce({
        items: [item({ albumCode: 'BRA2', number: 2, teamName: 'Brazil' })],
        nextCursor: null,
      } as any);
    vi.mocked(fetchPublicWanted).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    } as any);

    const text = await buildAlbumExportText('u', 'a', 'Album', 'url');
    expect(vi.mocked(fetchPublicOffered)).toHaveBeenCalledTimes(2);
    expect(text).toContain('Brazil: BRA1, BRA2');
  });
});
