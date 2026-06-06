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
  // When set, the entry renders with a warning banner at the top — used for
  // releases that shipped but were later found broken. The string is plain
  // prose (no markdown); the page renders it inside a styled callout. The
  // tag itself stays immutable; this field is the in-app equivalent of the
  // banner we add to a GitHub Release page. `scripts/rotate-changelog.mjs`
  // does not inspect this field — its matchers only key on `version:`,
  // `date:`, `changes:` and the category arrays.
  deprecated?: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    date: null,
    changes: {
      Added: [
        'Trade picker can sort by code, player, team, country, or group, and filter by country and team group.',
        'Sticker tiles in the trade picker show the country flag and team group.',
        'Trade chips show the country flag, player name, and a quantity stepper.',
        'Request more than one copy of the same sticker from a trade partner.',
        'A "Hidden from trades" section in the offer panel can unhide stickers.',
        'Clear-all wipes every selected sticker on each side with one tap.',
        'Known-broken releases now show a warning banner on the changelog page.',
      ],
      Changed: [
        'Trade proposal is now a full-screen sheet on phones with an Offer/Want toggle and a sticky Send button.',
        'Trade items on the detail page show a variant colour swatch and a richer summary.',
        'Once one participant confirms completion, the other sees a clear "confirm to finalize" prompt.',
        'Completed trades keep the message thread open for pickup and follow-up.',
        'Album pages are wider on large displays so the variant rail no longer crowds the grid.',
        'The changelog page only lists shipped releases; the in-progress placeholder is hidden.',
      ],
      Fixed: [
        'Trade picker: request each variant of a sticker independently, even when a partner has several.',
        'Trade picker: "I need" indicator and filter now check the specific variant, not just the album code.',
        'Trade picker: sticker lists scroll inside their own panel instead of overflowing on short screens.',
        'Trade picker: the selected-items bar on phones scrolls horizontally instead of growing taller.',
        'Trade drafts remember the requested quantity per want item, not just the variant.',
        'Trade system messages disambiguate variants — e.g. "+BRA1 (blue)" when multiple BRA1s are in play.',
        'Trade chat: failed sends show an error banner instead of silently disappearing.',
        'Shared-list pages show the variant name (e.g. "Blue parallel") instead of the raw token.',
        'Album page: the A–Z jump rail sits below the sticky filter bar instead of behind it.',
        'Album stats: the "View detailed stats" link is no longer overlapped on phones.',
      ],
    },
  },
  {
    version: 'v0.1.3',
    date: '2026-06-06',
    changes: {
      Fixed: [
        'Album page no longer crashes when a filter narrows the grid to zero stickers.',
      ],
    },
  },
  {
    version: 'v0.1.2',
    date: '2026-06-06',
    deprecated: 'This release ships a Rules of Hooks violation that crashes the album page when a filter narrows the grid to zero stickers. Use v0.1.3 or later.',
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
    changes: {
      Added: [
        'Initial release.',
      ],
    },
  },
];
