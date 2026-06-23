export const STICKER_COUNT = 980        // core album stickers (intro + team)
export const TEAM_COUNT = 48
export const STICKERS_PER_TEAM = 20
export const INTRO_STICKER_COUNT = 20    // 9 front (Panini logo + FWC1–FWC8) + 11 back (FWC9–FWC19 past champions)
export const COCA_COLA_STICKER_COUNT = 12
export const EXTRA_STICKER_COUNT = 20

export const VARIANT_RARITY: Record<string, number> = {
  base_border: 1,
  base_borderless: 1,
  blue: 2,
  red: 3,
  purple: 4,
  green: 5,
  black: 6,
  orange_amazon: 7,
  gold_crumple: 8,
  blue_crumple: 9,
  red_crumple: 10,
  purple_crumple: 11,
  green_crumple: 12,
  black_crumple: 13,
  extra_purple: 15,
  extra_bronze: 16,
  extra_silver: 17,
  extra_gold: 18,
  swiss_green: 19,
}

// VARIANT_SCARCITY — relative trade-value weight per variant.
// Derived from the documented Panini pack odds (see CLAUDE.md §"Sticker Types
// & Rarities"): the value approximates "how many base stickers, on average,
// you'd open before finding one of this variant". Used as guidance only —
// the third-party trade flow warns when the give/get ratio gets lopsided,
// but never blocks a trade. Numbers are tunable; the *relative* order is the
// invariant collectors care about.
export const VARIANT_SCARCITY: Record<string, number> = {
  // Core border parallels — direct inverse of pack odds.
  base_border: 1,
  base_borderless: 1,
  blue: 2,         // ~1 in 2 packs
  red: 25,         // ~1 in 25 packs
  purple: 200,     // ~1 in 200 packs
  green: 1400,     // ~1 in 1,400 packs
  black: 5000,     // 1-of-1, capped to keep totals comparable
  // Regional / retailer exclusives — limited distribution rather than odds-based.
  swiss_green: 4,
  orange_amazon: 15,
  // iCollect online-exclusive Crumple parallels — same odds-tier as the
  // border counterpart, bumped slightly to reflect online-only scarcity.
  gold_crumple: 8,
  blue_crumple: 3,
  red_crumple: 30,
  purple_crumple: 225,
  green_crumple: 1500,
  black_crumple: 5000,
  // Extras — short-printed action shots, 1 in 100 packs as a baseline; the
  // gold background is the pinnacle of the pack hunt.
  extra_purple: 100,
  extra_bronze: 300,
  extra_silver: 800,
  extra_gold: 2000,
}

/**
 * Lookup helper with a safe fallback for unknown tokens. Treats anything we
 * don't recognise as a common base (1.0) so callers don't have to special-case
 * the unknown path — the warning UI already surfaces unknown tokens separately.
 */
export function variantScarcity(token: string | null | undefined): number {
  if (!token) return 1
  return VARIANT_SCARCITY[token] ?? 1
}

// ─── Trade-balance guidance ───────────────────────────────────────────────────
// The third-party trade flow computes total scarcity each side gives vs.
// receives, then flags trades outside this band as lopsided. Inside the band
// the trade is treated as "roughly fair". These are tuning knobs, not hard
// gates — every third-party trade ultimately happens in person between the
// two collectors.
export const TRADE_BALANCE_LOW = 0.5
export const TRADE_BALANCE_HIGH = 2.0

export const DEFAULT_PAGE_SIZE = 100
export const MAX_TRADE_COUNTERS = 5
export const VERIFICATION_TOKEN_TTL_HOURS = 24
export const REFRESH_TOKEN_TTL_DAYS = 30
export const ACCESS_TOKEN_TTL_MINUTES = 15

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const
export type Group = (typeof GROUPS)[number]

// ─── Achievement catalog ──────────────────────────────────────────────────────
// Single source of truth for the badge system. The backend evaluates
// `criterion` to decide whether each row should unlock; the frontend uses
// `emoji` and `tier` for display order, and resolves the user-facing strings
// from `apps/frontend/messages/<locale>.json` under `achievements.<key>`.
// The `key` is what the `user_achievements` table persists, so adding or
// removing entries here changes what shows up on every profile — remember to
// add a matching `achievements.<key>` block to every locale file.

export type AchievementCriterionType =
  | 'first_sticker'
  | 'percentage_gte_25'
  | 'percentage_gte_50'
  | 'percentage_gte_75'
  | 'percentage_gte_100'
  | 'team_complete_any'
  | 'all_teams_complete'
  | 'rare_pull'
  | 'first_trade_completed'

export interface AchievementDefinition {
  key: string
  tier: number
  emoji: string
  criterion: AchievementCriterionType
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { key: 'first_sticker',  tier: 1,  emoji: '🌱',  criterion: 'first_sticker' },
  { key: 'pct_25',         tier: 2,  emoji: '🚀',  criterion: 'percentage_gte_25' },
  { key: 'pct_50',         tier: 3,  emoji: '⚡',  criterion: 'percentage_gte_50' },
  { key: 'pct_75',         tier: 4,  emoji: '🔥',  criterion: 'percentage_gte_75' },
  { key: 'team_complete',  tier: 4,  emoji: '🏟️', criterion: 'team_complete_any' },
  { key: 'rare_pull',      tier: 4,  emoji: '✨',  criterion: 'rare_pull' },
  { key: 'first_trade',    tier: 4,  emoji: '🤝',  criterion: 'first_trade_completed' },
  { key: 'all_teams',      tier: 6,  emoji: '🌎',  criterion: 'all_teams_complete' },
  { key: 'pct_100',        tier: 10, emoji: '🏆',  criterion: 'percentage_gte_100' },
]

export const ACHIEVEMENT_KEYS: readonly string[] = ACHIEVEMENTS.map((a) => a.key)

export function findAchievement(key: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key)
}
