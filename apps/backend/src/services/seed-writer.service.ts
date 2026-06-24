/**
 * Rewrites the catalog seed file that owns a given sticker so an admin
 * UI edit becomes durable through the next reseed-on-boot.
 *
 * The seed files (02/03/08/10_*_stickers.sql) are the *source of truth*; the
 * catalog reseeds on every backend boot via `runCatalogSeed`, so an edit that
 * only lived in the live DB would be reverted to the seed value on the next
 * deploy or container recycle. To prevent that, every admin sticker edit
 * routes through this service to update the matching VALUES tuple in the
 * appropriate seed file, then the github-pr service ships the change back
 * to git as a PR.
 *
 * Pure / no I/O. Callers pass in the original file contents and get back
 * the rewritten contents; the github-pr service decides whether to commit
 * via the GitHub API or write locally.
 */

export type StickerType =
  | 'intro'
  | 'badge'
  | 'player'
  | 'team_photo'
  | 'coca_cola_special'
  | 'extra';

export interface SeedEditTarget {
  /** Which seed file owns this sticker. */
  fileName: string;
  /** 0-based index of the `player_name` field inside the VALUES tuple. */
  playerNameFieldIndex: number;
  /**
   * 0-based index of the `position` field, or `null` if this file's tuples
   * don't carry a position column (currently only `02_intro_stickers.sql`).
   */
  positionFieldIndex: number | null;
  /**
   * 0-based index of a second field that mirrors `player_name` for purely
   * cosmetic reasons (the unused `player_name_col` join key in
   * `03_team_stickers.sql`). Updated only when its current value equals the
   * old `player_name`, so non-player rows (badge/team_photo where this slot
   * is NULL) are left untouched.
   */
  mirrorPlayerNameFieldIndex: number | null;
}

const TARGET_BY_STICKER_TYPE: Record<StickerType, SeedEditTarget> = {
  intro: {
    fileName: '02_intro_stickers.sql',
    playerNameFieldIndex: 3,
    positionFieldIndex: null,
    mirrorPlayerNameFieldIndex: null,
  },
  badge: {
    fileName: '03_team_stickers.sql',
    playerNameFieldIndex: 3,
    positionFieldIndex: 4,
    mirrorPlayerNameFieldIndex: 2,
  },
  player: {
    fileName: '03_team_stickers.sql',
    playerNameFieldIndex: 3,
    positionFieldIndex: 4,
    mirrorPlayerNameFieldIndex: 2,
  },
  team_photo: {
    fileName: '03_team_stickers.sql',
    playerNameFieldIndex: 3,
    positionFieldIndex: 4,
    mirrorPlayerNameFieldIndex: 2,
  },
  coca_cola_special: {
    fileName: '08_coca_cola_stickers.sql',
    playerNameFieldIndex: 3,
    positionFieldIndex: 4,
    mirrorPlayerNameFieldIndex: null,
  },
  extra: {
    fileName: '10_extra_stickers.sql',
    playerNameFieldIndex: 3,
    positionFieldIndex: 4,
    mirrorPlayerNameFieldIndex: null,
  },
};

export function getSeedTargetFor(stickerType: string): SeedEditTarget | null {
  return TARGET_BY_STICKER_TYPE[stickerType as StickerType] ?? null;
}

/** SQL literal: a string in single quotes (doubled-up on internal `'`), or `NULL`. */
export function toSqlLiteral(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

interface ParsedField {
  /** Offset inside the tuple body where this field's raw text starts. */
  start: number;
  /** Offset inside the tuple body where this field's raw text ends (exclusive). */
  end: number;
  /** The raw text of the field as it appears in the seed file. */
  raw: string;
}

/**
 * Tokenises the inside of a single VALUES tuple into a list of fields. Handles
 * SQL string literals (single-quoted, `''` for an embedded quote) so that
 * a comma inside `'Hello, world'` doesn't split a field.
 */
function parseTupleBody(body: string): ParsedField[] {
  const fields: ParsedField[] = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) i++;
    if (i >= body.length) break;

    const start = i;
    if (body[i] === "'") {
      i++;
      while (i < body.length) {
        if (body[i] === "'") {
          if (body[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
    } else {
      while (i < body.length && body[i] !== ',') i++;
    }

    let end = i;
    while (end > start && /\s/.test(body[end - 1]!)) end--;
    fields.push({ start, end, raw: body.slice(start, end) });

    while (i < body.length && body[i] !== ',') i++;
    if (body[i] === ',') i++;
  }
  return fields;
}

/**
 * Locate the VALUES tuple in `content` that opens with `( <stickerNumber>,`
 * at the start of a line. Returns the absolute offsets of the opening `(`
 * and the matching `)`. Skips contents inside SQL string literals so a
 * `'(`-bearing player name doesn't confuse the matcher.
 */
function findTupleByStickerNumber(
  content: string,
  stickerNumber: number,
): { openIdx: number; closeIdx: number } | null {
  const lineStartPattern = new RegExp(`^[ \\t]*\\([ \\t]*${stickerNumber}[ \\t]*,`, 'gm');
  const match = lineStartPattern.exec(content);
  if (!match) return null;

  const openIdx = content.indexOf('(', match.index);
  if (openIdx === -1) return null;

  let depth = 0;
  let i = openIdx;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "'") {
      i++;
      while (i < content.length) {
        if (content[i] === "'") {
          if (content[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { openIdx, closeIdx: i };
    }
    i++;
  }
  return null;
}

export class SeedEditError extends Error {
  constructor(public readonly code: 'TUPLE_NOT_FOUND' | 'NO_TARGET_FILE' | 'NO_CHANGES', message: string) {
    super(message);
    this.name = 'SeedEditError';
  }
}

export interface ApplyEditInput {
  stickerType: string;
  stickerNumber: number;
  changes: {
    /** `undefined` = leave unchanged; `null` = set to NULL; string = set. */
    playerName?: string | null;
    position?: string | null;
  };
}

export interface AppliedEdit {
  fileName: string;
  rewriteFile: (originalContent: string) => string;
  /** Short human-readable summary, suitable for PR title / commit message. */
  summary: string;
}

/**
 * Returns a callback that, given the current contents of the matching seed
 * file, produces the rewritten contents. The seed-writer doesn't read or
 * write disk on its own — the caller (github-pr or local fallback) supplies
 * the original content and decides where to send the rewrite.
 *
 * Throws `SeedEditError` if the sticker type has no corresponding seed file
 * (e.g. `notes`-only edits don't round-trip through any seed file — that's
 * a live-DB-only column).
 */
export function planSeedEdit(input: ApplyEditInput): AppliedEdit {
  const target = getSeedTargetFor(input.stickerType);
  if (!target) {
    throw new SeedEditError(
      'NO_TARGET_FILE',
      `No seed file owns sticker_type=${input.stickerType}.`,
    );
  }

  const wantsPlayerName = 'playerName' in input.changes;
  const wantsPosition = 'position' in input.changes && target.positionFieldIndex !== null;
  if (!wantsPlayerName && !wantsPosition) {
    throw new SeedEditError(
      'NO_CHANGES',
      'No fields require a seed-file rewrite (only DB-only columns changed).',
    );
  }

  const rewriteFile = (originalContent: string): string => {
    const tuple = findTupleByStickerNumber(originalContent, input.stickerNumber);
    if (!tuple) {
      throw new SeedEditError(
        'TUPLE_NOT_FOUND',
        `No VALUES tuple for sticker #${input.stickerNumber} in ${target.fileName}.`,
      );
    }

    const body = originalContent.slice(tuple.openIdx + 1, tuple.closeIdx);
    const fields = parseTupleBody(body);

    // Build a map of fieldIndex → newRawText. We rebuild the body by
    // splicing into the original (preserving formatting outside the
    // replaced fields).
    const replacements = new Map<number, string>();
    const oldPlayerName = fields[target.playerNameFieldIndex]?.raw;

    if (wantsPlayerName) {
      replacements.set(target.playerNameFieldIndex, toSqlLiteral(input.changes.playerName ?? null));
      // Mirror only if the old value was a string and equals the mirror's
      // current value — guards non-player rows where mirror is NULL.
      if (
        target.mirrorPlayerNameFieldIndex !== null &&
        oldPlayerName !== undefined &&
        fields[target.mirrorPlayerNameFieldIndex]?.raw === oldPlayerName
      ) {
        replacements.set(
          target.mirrorPlayerNameFieldIndex,
          toSqlLiteral(input.changes.playerName ?? null),
        );
      }
    }
    if (wantsPosition && target.positionFieldIndex !== null) {
      replacements.set(target.positionFieldIndex, toSqlLiteral(input.changes.position ?? null));
    }

    // Splice replacements into the body, back-to-front so earlier offsets
    // remain valid.
    let newBody = body;
    const sortedIndices = [...replacements.keys()].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      const field = fields[idx];
      if (!field) continue;
      newBody = newBody.slice(0, field.start) + replacements.get(idx)! + newBody.slice(field.end);
    }

    return (
      originalContent.slice(0, tuple.openIdx + 1) +
      newBody +
      originalContent.slice(tuple.closeIdx)
    );
  };

  const parts: string[] = [];
  if (wantsPlayerName) parts.push(`player_name=${toSqlLiteral(input.changes.playerName ?? null)}`);
  if (wantsPosition) parts.push(`position=${toSqlLiteral(input.changes.position ?? null)}`);
  const summary = `Sticker #${input.stickerNumber} (${target.fileName}): ${parts.join(', ')}`;

  return { fileName: target.fileName, rewriteFile, summary };
}
