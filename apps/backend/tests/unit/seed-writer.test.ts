import { describe, it, expect } from 'vitest';
import { planSeedEdit, SeedEditError, toSqlLiteral } from '../../src/services/seed-writer.service.js';

describe('seed-writer', () => {
  describe('toSqlLiteral', () => {
    it('renders NULL for null', () => {
      expect(toSqlLiteral(null)).toBe('NULL');
    });
    it('quotes a plain string', () => {
      expect(toSqlLiteral('Luis Malagón')).toBe("'Luis Malagón'");
    });
    it("doubles internal single quotes", () => {
      expect(toSqlLiteral("O'Brien")).toBe("'O''Brien'");
    });
  });

  describe('planSeedEdit', () => {
    const teamSeed = `INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT … FROM (VALUES
  (  10, 'MEX1', NULL, 'Team Logo - Mexico', NULL, 'badge', true),
  (  11, 'MEX2', 'Luis Malagón', 'Luis Malagón', 'GK', 'player', false),
  (  12, 'MEX3', 'Johan Vásquez', 'Johan Vásquez', 'DEF', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil);
`;

    it('updates player_name on a team player row and mirrors player_name_col', () => {
      const plan = planSeedEdit({
        stickerType: 'player',
        stickerNumber: 11,
        changes: { playerName: 'Luis Malagon' },
      });
      const out = plan.rewriteFile(teamSeed);
      expect(out).toContain("(  11, 'MEX2', 'Luis Malagon', 'Luis Malagon', 'GK', 'player', false)");
      // Untouched rows preserved verbatim.
      expect(out).toContain("(  10, 'MEX1', NULL, 'Team Logo - Mexico', NULL, 'badge', true)");
      expect(out).toContain("(  12, 'MEX3', 'Johan Vásquez', 'Johan Vásquez', 'DEF', 'player', false)");
    });

    it('updates position alongside player_name', () => {
      const plan = planSeedEdit({
        stickerType: 'player',
        stickerNumber: 12,
        changes: { playerName: 'Johan Vasquez', position: 'CB' },
      });
      const out = plan.rewriteFile(teamSeed);
      expect(out).toContain("(  12, 'MEX3', 'Johan Vasquez', 'Johan Vasquez', 'CB', 'player', false)");
    });

    it('leaves player_name_col untouched on a badge row where the mirror is NULL', () => {
      const plan = planSeedEdit({
        stickerType: 'badge',
        stickerNumber: 10,
        changes: { playerName: 'Mexico Crest' },
      });
      const out = plan.rewriteFile(teamSeed);
      expect(out).toContain("(  10, 'MEX1', NULL, 'Mexico Crest', NULL, 'badge', true)");
    });

    it('handles single-quoted player names with embedded apostrophes', () => {
      const seedWithApostrophe = teamSeed.replace("'Luis Malagón', 'Luis Malagón'", "'O''Brien', 'O''Brien'");
      const plan = planSeedEdit({
        stickerType: 'player',
        stickerNumber: 11,
        changes: { playerName: "D'Souza" },
      });
      const out = plan.rewriteFile(seedWithApostrophe);
      expect(out).toContain("(  11, 'MEX2', 'D''Souza', 'D''Souza', 'GK', 'player', false)");
    });

    it('sets player_name to NULL on explicit null', () => {
      const plan = planSeedEdit({
        stickerType: 'player',
        stickerNumber: 11,
        changes: { playerName: null },
      });
      const out = plan.rewriteFile(teamSeed);
      expect(out).toContain("(  11, 'MEX2', NULL, NULL, 'GK', 'player', false)");
    });

    const introSeed = `FROM (VALUES
  (960, 'FWC1', NULL, 'FIFA World Cup Champion — Uruguay 1930', 'intro', true),
  (961, 'FWC2', NULL, 'FIFA World Cup Champion — Italy 1934', 'intro', true)
) AS s(number, album_code, team_id, player_name, sticker_type, is_foil);
`;

    it('updates player_name in the intro file (no position column)', () => {
      const plan = planSeedEdit({
        stickerType: 'intro',
        stickerNumber: 961,
        // position is ignored for intro stickers (no field to write).
        changes: { playerName: 'FIFA World Cup Champion — Italy (1934)', position: 'FWD' },
      });
      const out = plan.rewriteFile(introSeed);
      expect(out).toContain("(961, 'FWC2', NULL, 'FIFA World Cup Champion — Italy (1934)', 'intro', true)");
      // The 5th field stayed 'intro', not 'FWD'.
      expect(out).not.toContain("'FWD'");
    });

    const ccSeed = `FROM (VALUES
  (1010, 'CC3',  'ENG', 'Harry Kane',        'FWD'),
  (1019, 'CC12', 'ARG', 'Emiliano Martínez', 'GK')
) AS s(number, album_code, team_code, player_name, position);
`;

    it('updates player_name and position in the coca-cola file', () => {
      const plan = planSeedEdit({
        stickerType: 'coca_cola_special',
        stickerNumber: 1019,
        changes: { playerName: 'Dibu Martínez', position: 'GK' },
      });
      const out = plan.rewriteFile(ccSeed);
      expect(out).toContain("(1019, 'CC12', 'ARG', 'Dibu Martínez', 'GK')");
    });

    it('throws TUPLE_NOT_FOUND when the sticker number isn\'t in the file', () => {
      const plan = planSeedEdit({
        stickerType: 'player',
        stickerNumber: 9999,
        changes: { playerName: 'Phantom' },
      });
      expect(() => plan.rewriteFile(teamSeed)).toThrow(SeedEditError);
    });

    it('throws NO_TARGET_FILE for unknown sticker_type', () => {
      expect(() =>
        planSeedEdit({
          stickerType: 'mystery',
          stickerNumber: 1,
          changes: { playerName: 'x' },
        }),
      ).toThrow(SeedEditError);
    });

    it('throws NO_CHANGES when only DB-only fields would change', () => {
      expect(() =>
        planSeedEdit({
          stickerType: 'intro',
          stickerNumber: 960,
          // Only position, which intro has no field for → nothing to write.
          changes: { position: 'GK' },
        }),
      ).toThrow(SeedEditError);
    });
  });
});
