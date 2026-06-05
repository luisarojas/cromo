/**
 * In-app changelog entries, rendered at /changelog. Order: newest first.
 *
 * The ONLY thing you edit here by hand is the bullets under `Unreleased`.
 * Append strings to the appropriate category (Added / Changed / Fixed /
 * Removed / Security) as user-visible work ships. Write for collectors,
 * not committers.
 *
 * `version` and `date` are owned by `scripts/release.sh` — at release time
 * it renames Unreleased → vX.Y.Z, stamps today's UTC date, and prepends a
 * fresh Unreleased block. Hand-editing those fields, or reformatting the
 * shape of this file in ways that change the literals the rotator matches
 * against, will break the release script.
 *
 * See CLAUDE.md § In-App Changelog for the full convention.
 */
export type ChangeCategory = 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Security';

export interface ChangelogEntry {
  version: string;
  date: string | null;
  changes: Partial<Record<ChangeCategory, string[]>>;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    date: null,
    changes: {
      Added: [
        'Album detail page now supports filtering to stickers updated in the last week.',
      ],
      Changed: [
        'Profile inventory Group filter defaults to None.',
        'Hard-ban now covers plus-addressing email variants (e.g. user+tag@example.com).',
      ],
      Fixed: [
        'Player name search and scan matching now handle accented characters.',
        'Packs-opened estimate no longer includes Coca-Cola stickers.',
        'Trade Matcher now reads the way collectors actually write their lists — prefix-then-numbers ("BRA: 5, 7, 12"), flag emoji decoration, and section headers like "What I need:" or "ISO (Looking for):" all work.',
      ],
    },
  },
  {
    // Baseline tag — first cut of the codebase. Hand-authored (not produced by
    // scripts/release.sh) so v0.1.0 ships with no bullets; everything already
    // in flight rolls forward into the next release.
    version: 'v0.1.0',
    date: '2026-06-05',
    changes: {},
  },
];
