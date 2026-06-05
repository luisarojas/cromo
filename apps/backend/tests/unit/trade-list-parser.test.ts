import { describe, it, expect } from 'vitest';
import { parseTradeList } from '@cromo/shared';

// Each `describe` here mirrors one of the real wild-form lists collectors
// pasted into the Trade Matcher. They serve as a regression net: every shape
// of input the algorithm is supposed to recognise has a named case here, so a
// future "small tweak" to the parser surfaces the exact format it broke.

describe('parseTradeList', () => {
  describe('inline form (BRA5, ARG7)', () => {
    it('recognises codes whose letters and digits are glued together', () => {
      const { offered, wanted } = parseTradeList('HAVE: BRA5, ARG7, EX12\nWANT: MEX1, BRA10');
      expect(offered.sort()).toEqual(['ARG7', 'BRA5', 'EX12']);
      expect(wanted.sort()).toEqual(['BRA10', 'MEX1']);
    });
  });

  describe('example 1: "What I need:" followed by PREFIX - n,n', () => {
    const input = `What I need:
FWC - 6
RSA - 13
CAN - 9
BIH - 15
SUI - 3
EGY - 13,17
CPV - 3,11
URU - 9,12
COL - 14,20`;

    it('routes every code into wanted via the "need" header', () => {
      const { offered, wanted } = parseTradeList(input);
      expect(offered).toEqual([]);
      expect(wanted.sort()).toEqual([
        'BIH15', 'CAN9', 'COL14', 'COL20', 'CPV11', 'CPV3', 'EGY13', 'EGY17',
        'FWC6', 'RSA13', 'SUI3', 'URU12', 'URU9',
      ]);
    });
  });

  describe('example 2: "I want" + mixed-case prefixes + long number lists', () => {
    const input = `I want
Fwc 1, 2, 3, 14, 15
Kor 11
Can 9, 16, 17, 20
Hai 4, 11, 16
Sen 3, 6, 12, 17
Uzb 1,3, 11, 12`;

    it('uppercases the prefix and expands every number into its own code', () => {
      const { offered, wanted } = parseTradeList(input);
      expect(offered).toEqual([]);
      expect(wanted).toEqual(expect.arrayContaining([
        'FWC1', 'FWC2', 'FWC3', 'FWC14', 'FWC15',
        'KOR11',
        'CAN9', 'CAN16', 'CAN17', 'CAN20',
        'HAI4', 'HAI11', 'HAI16',
        'SEN3', 'SEN6', 'SEN12', 'SEN17',
        'UZB1', 'UZB3', 'UZB11', 'UZB12',
      ]));
      expect(wanted.length).toBe(21);
    });
  });

  describe('example 3: emoji + colon + numbers', () => {
    const input = `I need
FWC 🏆: 2, 3
MEX 🇲🇽: 1, 3
KOR 🇰🇷: 2, 6, 8
SCO 🏴󠁧󠁢󠁳󠁣󠁴󠁿: 5
CC 🥤: 6, 7, 8, 9, 10, 12
ENG 🏴󠁧󠁢󠁥󠁮󠁧󠁿: 2, 3, 5, 6, 10, 13, 14, 16`;

    it('ignores decorative emoji and pulls the prefix + numbers around them', () => {
      const { wanted } = parseTradeList(input);
      expect(wanted).toEqual(expect.arrayContaining([
        'FWC2', 'FWC3',
        'MEX1', 'MEX3',
        'KOR2', 'KOR6', 'KOR8',
        'SCO5',
        'CC6', 'CC7', 'CC8', 'CC9', 'CC10', 'CC12',
        'ENG2', 'ENG3', 'ENG5', 'ENG6', 'ENG10', 'ENG13', 'ENG14', 'ENG16',
      ]));
    });
  });

  describe('example 4: leading emoji, two sections in one paste', () => {
    const input = `ISO (Looking for):
⚽️ FWC - 1, 18
🇲🇽 MEX - 5, 18, 20
🇸🇳 SEN, 10, 12, 15, 17
🥤 CC - 1, 2, 3, 6, 9, 10, 12
Up for trade:
⚽️ FWC - 00, 2, 4, 8, 9
🇲🇽 MEX - 1, 2, 9
🥤 CC - 7`;

    it('detects "Looking for" → wanted and "Up for trade" → offered', () => {
      const { offered, wanted } = parseTradeList(input);
      // "00" is dropped — album codes start at 1.
      expect(offered.sort()).toEqual([
        'CC7', 'FWC2', 'FWC4', 'FWC8', 'FWC9', 'MEX1', 'MEX2', 'MEX9',
      ]);
      expect(wanted.sort()).toEqual([
        'CC1', 'CC10', 'CC12', 'CC2', 'CC3', 'CC6', 'CC9',
        'FWC1', 'FWC18',
        'MEX18', 'MEX20', 'MEX5',
        'SEN10', 'SEN12', 'SEN15', 'SEN17',
      ]);
    });

    it('handles a prefix glued directly to a comma ("SEN, 10, 12")', () => {
      const { wanted } = parseTradeList('ISO\n🇸🇳 SEN, 10, 12, 15, 17');
      expect(wanted.sort()).toEqual(['SEN10', 'SEN12', 'SEN15', 'SEN17']);
    });
  });

  describe('example 5: bare PREFIX: n,n list with no headers', () => {
    const input = `FWC: 1,4,5,8,12,17
MEX: 2,20
PAR: 7,10,,13,17
CC: 7`;

    it('defaults the bucket to offered and tolerates double commas', () => {
      const { offered, wanted } = parseTradeList(input);
      expect(wanted).toEqual([]);
      expect(offered.sort()).toEqual([
        'CC7',
        'FWC1', 'FWC12', 'FWC17', 'FWC4', 'FWC5', 'FWC8',
        'MEX2', 'MEX20',
        'PAR10', 'PAR13', 'PAR17', 'PAR7',
      ]);
    });
  });

  describe('robustness', () => {
    it('drops orphan numbers that have no preceding prefix on the line', () => {
      const { offered, wanted } = parseTradeList('5, 7, 12\nBRA: 3');
      expect(offered).toEqual(['BRA3']);
      expect(wanted).toEqual([]);
    });

    it('does not let a prefix on one line attach to numbers on the next', () => {
      // Without the per-line reset, "BRA" on line 1 would silently swallow
      // "9" and "12" on line 2.
      const { offered } = parseTradeList('BRA: 5, 7\n9, 12');
      expect(offered.sort()).toEqual(['BRA5', 'BRA7']);
    });

    it('ignores commentary text without producing phantom codes', () => {
      const { offered, wanted } = parseTradeList(
        'first to have 1 full page\n2nd to have full page',
      );
      expect(offered).toEqual([]);
      expect(wanted).toEqual([]);
    });

    it('treats "wanted" as winning when a code shows up in both buckets', () => {
      const { offered, wanted } = parseTradeList('HAVE: BRA5\nWANT: BRA5');
      expect(offered).toEqual([]);
      expect(wanted).toEqual(['BRA5']);
    });

    it('falls back to offered when the input has no section header at all', () => {
      const { offered, wanted } = parseTradeList('BRA5, ARG7, MEX10');
      expect(offered.sort()).toEqual(['ARG7', 'BRA5', 'MEX10']);
      expect(wanted).toEqual([]);
    });

    it('respects Spanish markers (tengo / busco)', () => {
      const input = 'Tengo: BRA5, ARG7\nBusco: MEX1';
      const { offered, wanted } = parseTradeList(input);
      expect(offered.sort()).toEqual(['ARG7', 'BRA5']);
      expect(wanted).toEqual(['MEX1']);
    });
  });
});
