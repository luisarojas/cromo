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
        'Set your own price per base sticker on a third-party trade — every other variant\'s cash value is rescaled from it by scarcity, so the fairness math and the per-sticker estimates match what you actually trade for.',
        'My Trades now shows the stickers that changed hands on every trade, inline — not just in-person and off-platform trades but regular trade requests too.',
      ],
      Fixed: [
        'A third-party trade with no partner name now reads "For Them" instead of "For They", and a partner\'s name keeps the capitalisation you typed in the trade summary.',
        'Favourite and wanted stickers in the third-party trade editor now use distinct icons — a heart for favourites, a star for wanted.',
      ],
    },
  },
  {
    version: 'v0.2.0',
    date: '2026-06-27',
    changes: {
      Added: [
        'FIFA World Cup 2026 tracker — a new guide page with live group tables, the official knockout bracket, and a team-by-team view: who has qualified, who is out, each nation\'s 26-man squad with current clubs, and transparent odds to reach the final or lift the trophy. The bracket and forecasts follow the real draw and fill in as results land.',
        'Third-Party trade editor — Cromo\'s suggested optimal trade is now a pre-filled checklist you can edit: tick or untick any sticker from the candidate pool on either side, add cash on top, and the fairness reading updates live. Wanted and favourite stickers float to the top of the receive column. Same-variant trades trim to equal counts automatically.',
        'Cash in the trade balance — money offered or asked on a third-party trade now feeds into the fairness math at $0.50 per base sticker (scaled by variant scarcity), so an "X stickers + $5" plan reads as roughly fair when the totals line up. Each non-base sticker shows its approximate cash value (≈ $12.50 for a red, ≈ $1,000 for an extra gold), and a one-tap "Add $X" button on the lopsided warning bumps the right side\'s cash by the amount needed to balance.',
        'Save third-party drafts — park an in-progress third-party trade and resume it from the My Trades tab. Drafts capture the partner\'s list, your selections, and any cash, so you can come back to them later or share-and-confirm before recording.',
        'Copy a third-party trade as text — drop a formatted "Offers / Needs" summary into messages, with stickers grouped by team/FWC/Coca-Cola/Extras and any cash on either side.',
        'Spanish (Español) language support — pick your language from the footer.',
        'Site-wide SEO — sitemap, robots, OpenGraph cards, hreflang for EN/ES, and a structured Organization profile for search engines.',
        'Link previews — sharing a profile, share list, trade invite, or live-trade join URL now unfurls with a Cromo-branded graphic; profiles show the collector\'s name, album count, and totals.',
        'Share progress — from any album, generate a 1080×1080 card of your completion to post on Instagram, TikTok, or WhatsApp.',
        'Achievement badges — earn milestones as you fill teams, hit completion percentages, complete a trade, or land a rare pull. Browse them on any collector\'s profile.',
        'Trade in person — generate a QR code from the Trades page; the other collector scans it and lands straight in the propose-trade flow with you as the partner.',
        'Live trade — start a shared in-person trade session with someone who doesn\'t have a Cromo account. Share a 6-digit code, link, or QR; both sides stage stickers, lock in, and the host commits the swap to their album with a 60-second undo window. A suggested split surfaces automatically from your lists. Completed live trades show in My Trades alongside your regular trade history.',
        'Variant tags in third-party trade lists — paste a friend\'s offered/wanted list with rarities attached (e.g. BRA5(red)x2, MEX10(gold)) and the matcher reads each rarity, matching what you can give variant-by-variant instead of only album-code overlap.',
        'Lopsided-trade warning on third-party matches — Cromo flags trades where one side gives noticeably more scarcity than they\'d receive, based on Panini\'s published pack odds. Guidance only — collectors set the actual price.',
        'One-tap clear (×) button in every search bar.',
        'Double-tap a sticker tile on mobile to favourite (or un-favourite) it without opening the variant sheet.',
        'Share a specific album from a profile — each public album now has its own URL (/profile/<user>/<album>) and link preview, with a "This album / Whole profile" toggle in the share modal.',
        'New "Unlisted" album visibility — share an album only with people you send the link to. Unlisted albums are hidden from your profile and not matched with other collectors.',
      ],
      Changed: [
        'Trade suggestions never offer you a sticker you already have — if you own a sticker in any variant, Cromo won\'t recommend you receive it in another variant (a red when you have the base), unless you\'ve explicitly added that variant to your wishlist. It still counts as a duplicate you can give away.',
        'Same-variant trades — when both sides of a trade are entirely the same variant (e.g. base for base), Cromo now requires equal counts to call it fair instead of grading by scarcity weight.',
        'Per-trade variant weights — negotiate the value of each variant for a single trade. On third-party matches, set your own table and rerun the match. In a live-trade session, one side proposes a weight table and the other side accepts before it takes effect.',
        'Renamed the 1-of-1 Black rarity tier to "Unique".',
        'Profile "Start a trade" button now shows a disabled state — with a tooltip explaining why — when the collector has trading turned off or no stickers available.',
        'Trade status badges use distinct colors per state, and "Completed" trades now stand out in solid green.',
        'Participant names on a trade page link to their profiles.',
        'My Trades shows open trades by default, with closed trades collapsed into an expandable section. Table gains an "Opened" and "Closed" date column, both sortable.',
        'Album share modal\'s "Copy list as text" button is disabled — with a tooltip — when the album has no duplicates or wanted stickers to share.',
        'Mobile menu trims primary nav links that the bottom tab bar already covers — just identity, settings, guides, and log out.',
        'Album header on phones collapses Set-default, Edit, and New-album into an overflow menu so the row no longer wraps.',
        'Album list page no longer shows the grid-density toggle on phones; the grid adapts to viewport width automatically.',
        'Variant sheet on phones gets thumb-sized +/− buttons, swipe-to-adjust on any row, every unowned variant inline with a wishlist star, and trade options tucked behind a per-row ⋯ menu.',
        'Swipe-to-adjust in the variant sheet shows an undo toast — accidental swipes are reversible with one tap.',
        'Modals on phones open as bottom sheets (Album form, Variant picker, Report user, Trade QR share) instead of centred cards.',
        'Settings tab strip stays pinned under the navbar while you scroll, and switching tabs scrolls back to the top.',
        'In selection mode, long-pressing one card and then another fills the range between them — the touch equivalent of shift-click.',
        'Trade picker quantity +/− and remove (×) buttons are larger on phones for easier thumb-tapping.',
        'After confirming a scanned sticker, the "Scan another" button reopens the camera in one tap instead of dropping back to the file-picker screen.',
        'Album-page group jump-rail on phones uses thumb-sized rows, and you can slide a finger along it to scrub through groups without precision-tapping.',
        'Stats page — Top Tradeable Duplicates now shows a plain count and honours your Duplicates setting (all-variants vs same-variant only).',
        'Stats page — Favourites, country rows, top duplicates, and rare-pull tiers are clickable and drop you into the matching tab + filter on the album view.',
        'Album progress bar and All/Have/Missing/Duplicates tabs stay pinned at the top of the album view as you scroll the grid.',
        'Profile achievement badges are now compact icon-only tiles; hover a badge to see its name and description.',
        'Individual album pages now live at /album/<id>; /collection stays as the album list.',
      ],
      Fixed: [
        'iOS Safari no longer zooms in when you tap any input, textarea, or dropdown — affects login, register, settings, trade messages, and every form on the site.',
        'Trade picker filter dropdown scrolls instead of overflowing when a collector has many variants, countries, or groups to filter by.',
        'Mass actions on the album page no longer fail with a 400 error when more than 500 stickers are selected.',
        'Favourite (♥) button on every sticker is now tappable on phones — previously it only appeared on desktop hover.',
        'Album list cards expose Set-default and Edit buttons directly on phones instead of hiding them behind a hover state.',
        'Remove (×) button on staged scan images is visible on phones.',
        'Toast notifications for successful mass actions on the album page are no longer styled as errors.',
        'Selection-mode checkbox on sticker tiles no longer covers the album code.',
        'Filter dropdown options keep their original order instead of jumping to the top as you check them.',
        'Stats page — clicking a Rare Pulls tier now filters the album to that exact variant instead of bundling in the matching Extra background.',
        'Album page — switching tabs or jumping in from the stats page now adds a browser-history entry, so the back button returns you to where you came from.',
        'Desktop variant popover — "Add to wishlist" and "Add other variant" lists can be collapsed again with a Done button.',
      ],
      Removed: [
        '"Focus on these" card on the album page.',
        'Dashboard summary stats (Total/Owned/Missing/Duplicates) and the large overall progress bar — the per-album cards below already cover the same ground without misrepresenting multi-album collections.',
        'Album page Total/Owned/Missing/Duplicates tiles — the same counts already appear in the tab labels below, now colour-coded.',
      ],
    },
  },
  {
    version: 'v0.1.5',
    date: '2026-06-08',
    changes: {
      Fixed: [
        'Album page stays centred on large screens, and the variant rail sits next to the grid instead of floating off to the right.',
        'Player search matches accented names — typing "jose" now finds "José".',
      ],
    },
  },
  {
    version: 'v0.1.4',
    date: '2026-06-06',
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
