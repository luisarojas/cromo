import { describe, it, expect } from 'vitest';
import { parseFiguritas } from '@/app/trade/figuritas/parseFiguritas';

/**
 * The Figuritas QR is the cross-app interop contract: it's produced by another
 * app we don't control, so the parser has to be lenient on shape and honest
 * about what it can't read. These tests pin the four outcomes the UI branches
 * on (ok / unsupported-encoding / wrong-album / unrecognized) and the SWAP→offered,
 * NEED→wanted direction the two-way match depends on.
 */

const codes = (items: { albumCode: string }[]) => items.map((i) => i.albumCode).sort();

describe('parseFiguritas', () => {
  it('parses a Method-1 export: SWAP → offered, NEED → wanted', () => {
    const qr = [
      'FIGURITAS_USA2026_EXPORT',
      'NEED[FWC:1,2;MEX:11;CAN:3,5,12;GER:2,16,17]',
      'SWAP[MEX:2,4,5;CAN:2,10;BRA:6,8,9;FRA:3,5,8]',
    ].join('\n');

    const result = parseFiguritas(qr);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    // SWAP = their duplicates (what they can give us) → offered.
    expect(codes(result.offered)).toEqual(
      ['BRA6', 'BRA8', 'BRA9', 'CAN10', 'CAN2', 'FRA3', 'FRA5', 'FRA8', 'MEX2', 'MEX4', 'MEX5'].sort(),
    );
    // NEED = what they're missing (what we can give them) → wanted.
    expect(codes(result.wanted)).toEqual(
      ['CAN12', 'CAN3', 'CAN5', 'FWC1', 'FWC2', 'GER16', 'GER17', 'GER2', 'MEX11'].sort(),
    );
    // Figuritas tracks no variants — every code resolves to base.
    expect(result.offered.every((i) => i.variantToken === null && i.quantity === 1)).toBe(true);
  });

  it('handles a NEED-only export (no dupes to offer)', () => {
    const result = parseFiguritas('FIGURITAS_USA2026_EXPORT\nNEED[ARG:1,2,3]');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.offered).toEqual([]);
    expect(codes(result.wanted)).toEqual(['ARG1', 'ARG2', 'ARG3']);
  });

  it('is lenient when the header is absent but blocks are present', () => {
    const result = parseFiguritas('SWAP[MEX:2]\nNEED[FWC:1]');
    expect(result.kind).toBe('ok');
  });

  it('flags the Method-2 hex bitstring as unsupported', () => {
    expect(parseFiguritas('fig://trade/v2?album=wc26&swaps=4A8F91C0E3B&needs=01F2C8D7').kind)
      .toBe('unsupported-encoding');
    // …even without the fig:// scheme, the hex `swaps=` query is the tell.
    expect(parseFiguritas('album=wc26&swaps=4a8f91c0e3b&needs=01f2c8d7').kind)
      .toBe('unsupported-encoding');
  });

  it('passes through a section entry that is already a full code', () => {
    const result = parseFiguritas('SWAP[BRA5]\nNEED[ARG9]');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(codes(result.offered)).toEqual(['BRA5']);
    expect(codes(result.wanted)).toEqual(['ARG9']);
  });

  it('rejects a QR for a different album', () => {
    const result = parseFiguritas('FIGURITAS_CHAMPIONS2025_EXPORT\nNEED[FWC:1]\nSWAP[MEX:2]');
    expect(result.kind).toBe('wrong-album');
    if (result.kind !== 'wrong-album') return;
    expect(result.album).toBe('CHAMPIONS2025');
  });

  it('reports unrecognized input as such (no throw)', () => {
    expect(parseFiguritas('https://example.com/profile/abc').kind).toBe('unrecognized');
    expect(parseFiguritas('').kind).toBe('unrecognized');
    expect(parseFiguritas('just some random text').kind).toBe('unrecognized');
  });
});
