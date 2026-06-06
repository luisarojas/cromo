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
      Fixed: [
        'Album page no longer crashes when a filter narrows the grid to zero stickers.',
      ],
    },
  },
  {
    version: 'v0.1.2',
    date: '2026-06-06',
    changes: {
      Added: [
        'Bottom navigation bar on phones with quick access to Album, Trade, Scan, Dashboard, and Profile.',
        'Swipe right on a sticker to add one of the default base; swipe left to remove one.',
        'Long-press a sticker to enter multi-select for owned cards, or add the missing base to your wishlist.',
        '"Focus on these" card highlights groups you are closest to completing.',
        'Resume scanning where you left off from the dashboard, with a scan-day streak counter.',
        'Album completion celebration screen the first time you finish each album.',
        'Live continuous scan mode in the camera that auto-captures stable frames.',
        'Voice readback for scan identifications (mute from the scanner header).',
        'Pack-opening share card after a scan session that adds three or more stickers.',
        'Group section headers and a quick-jump rail when scrolling the album grid.',
        'Full-screen sticker detail sheet on phones with swipe between adjacent stickers.',
        '"Not the right sticker?" hint on partial AI matches in the scanner.',
        'Native share button on trade match results.',
        'Install Cromo to your home screen prompt on supported phones.',
        'Offline indicator banner.',
        'Camera permission primer that explains why before asking.',
        'Pull-to-refresh on the album page.',
        'Bottom-sheet filter modal on phones.',
        'Column density toggle for the album grid, from 2 up to 6 columns on wide screens.',
        'Cmd+K command palette to jump to any album, page, or action.',
        'Keyboard shortcuts on desktop — press ? to see the cheatsheet.',
        'Right-click any sticker for a quick-action menu.',
        'Persistent sticker detail panel on wide-screen displays.',
        'Drag a sticker onto another album to move it (desktop).',
        'Sortable trade list table on desktop.',
        'Edits in one browser tab now refresh other open tabs automatically.',
        'Undo action on swipe-add toasts.',
        'Haptic feedback on sticker actions where supported.',
      ],
      Changed: [
        'Toast notifications now sit above the bottom tab bar and can carry an Undo action.',
        'Mobile filter expansion now slides up as a bottom sheet instead of pushing the grid down.',
      ],
      Fixed: [
        'Footer is no longer clipped by the bottom navigation bar on phones.',
        'Mass-select and bulk-action bars now sit above the bottom navigation bar.',
      ],
    },
  },
  {
    version: 'v0.1.0',
    date: '2026-06-05',
    changes: {},
  },
];
