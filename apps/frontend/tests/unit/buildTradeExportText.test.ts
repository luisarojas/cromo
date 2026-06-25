import { describe, it, expect } from 'vitest';
import { buildTradeExportText } from '@/app/trade/components/buildTradeExportText';
import type { ExternalStickerRef } from '@/lib/api';

/**
 * The third-party "Copy as text" output is collector-facing: it lands in
 * messages, screenshots, and trade-app comments where the format is the
 * product. Pin it here so refactors don't quietly shift bucket order,
 * variant rendering, or cash lines.
 *
 * Format contract (see also lib/profileExport.ts which the trade export
 * mirrors):
 *   - Header lines: "Offers | <me>", "Needs | <me> (from <partner>)".
 *   - Stickers grouped by bucket (FWC / team / Coca-Cola / Extras), separated
 *     by ", ". Bucket header on the same line.
 *   - Variant in parens when non-base.
 *   - quantity ×N suffix when quantity > 1.
 *   - Empty section reads "(none)".
 *   - Trailing "Matched via cromotrade.ca" advert line.
 */

function ref(partial: Partial<ExternalStickerRef> & { albumCode: string; number: number }): ExternalStickerRef {
  return {
    playerName: 'Player',
    teamName: null,
    stickerType: 'player',
    variantToken: 'base_borderless',
    variantLabel: 'Base',
    stickerVariantId: 'sv-' + partial.albumCode,
    scarcity: 1,
    quantity: 1,
    ...partial,
  };
}

describe('buildTradeExportText', () => {
  it('groups stickers by bucket in album-number order within each section', () => {
    const text = buildTradeExportText({
      meLabel: 'me',
      partnerLabel: 'them',
      iReceive: [
        ref({ albumCode: 'FWC3', number: 3, stickerType: 'intro' }),
        ref({ albumCode: 'BRA5', number: 105, teamName: 'Brazil' }),
        ref({ albumCode: 'BRA10', number: 110, teamName: 'Brazil' }),
      ],
      iGive: [],
      iReceiveCashCents: 0,
      iGiveCashCents: 0,
    });

    // Brazil section follows FWC; BRA5 precedes BRA10 by album number.
    expect(text).toContain('Needs | me (from them)\nFWC: FWC3\nBrazil: BRA5, BRA10');
  });

  it('renders variant in parens only when non-base', () => {
    const text = buildTradeExportText({
      meLabel: 'me',
      partnerLabel: 'them',
      iReceive: [
        ref({ albumCode: 'BRA5', number: 105, teamName: 'Brazil', variantToken: 'red', variantLabel: 'Red' }),
        ref({ albumCode: 'BRA6', number: 106, teamName: 'Brazil' }), // base — no parens
      ],
      iGive: [],
      iReceiveCashCents: 0,
      iGiveCashCents: 0,
    });
    expect(text).toContain('Brazil: BRA5 (Red), BRA6');
  });

  it('appends ×N when quantity is greater than 1', () => {
    const text = buildTradeExportText({
      meLabel: 'me',
      partnerLabel: 'them',
      iReceive: [],
      iGive: [ref({ albumCode: 'BRA5', number: 5, quantity: 3 })],
      iReceiveCashCents: 0,
      iGiveCashCents: 0,
    });
    expect(text).toContain('BRA5 ×3');
  });

  it('renders empty sections as "(none)"', () => {
    const text = buildTradeExportText({
      meLabel: 'me',
      partnerLabel: 'them',
      iReceive: [ref({ albumCode: 'BRA5', number: 5 })],
      iGive: [],
      iReceiveCashCents: 0,
      iGiveCashCents: 0,
    });
    expect(text).toContain('Offers | me\n(none)');
  });

  it('emits cash lines only when non-zero on the relevant side', () => {
    const text = buildTradeExportText({
      meLabel: 'me',
      partnerLabel: 'Alex',
      iReceive: [],
      iGive: [],
      iReceiveCashCents: 0,
      iGiveCashCents: 500,
    });
    expect(text).toContain('+ Cash: $5.00');
    expect(text).not.toContain('+ Cash from Alex');
  });

  it('emits both cash lines when both sides have cash', () => {
    const text = buildTradeExportText({
      meLabel: 'me',
      partnerLabel: 'Alex',
      iReceive: [],
      iGive: [],
      iReceiveCashCents: 250,
      iGiveCashCents: 750,
    });
    expect(text).toContain('+ Cash: $7.50');
    expect(text).toContain('+ Cash from Alex: $2.50');
  });

  it('uses provided title and trails the cromotrade.ca line', () => {
    const text = buildTradeExportText({
      title: 'Optimal trade',
      meLabel: 'me',
      partnerLabel: 'them',
      iReceive: [],
      iGive: [],
      iReceiveCashCents: 0,
      iGiveCashCents: 0,
    });
    expect(text.split('\n')[0]).toBe('Optimal trade');
    expect(text.endsWith('Matched via cromotrade.ca')).toBe(true);
  });

  it('defaults the title to "Trade with <partner>" when omitted', () => {
    const text = buildTradeExportText({
      meLabel: 'me',
      partnerLabel: 'Alex',
      iReceive: [],
      iGive: [],
      iReceiveCashCents: 0,
      iGiveCashCents: 0,
    });
    expect(text.split('\n')[0]).toBe('Trade with Alex');
  });

  it('groups Coca-Cola and Extras into their canonical buckets, not by teamName', () => {
    const text = buildTradeExportText({
      meLabel: 'me',
      partnerLabel: 'them',
      iReceive: [
        ref({ albumCode: 'CC3',  number: 1100, stickerType: 'coca_cola_special', teamName: 'Brazil' }),
        ref({ albumCode: 'EXT1', number: 1200, stickerType: 'extra',             teamName: 'Argentina' }),
      ],
      iGive: [],
      iReceiveCashCents: 0,
      iGiveCashCents: 0,
    });
    expect(text).toContain('Coca-Cola: CC3');
    expect(text).toContain('Extras: EXT1');
    // teamName should NOT leak into the bucket label for these subsets.
    expect(text).not.toContain('Brazil: CC3');
    expect(text).not.toContain('Argentina: EXT1');
  });
});
