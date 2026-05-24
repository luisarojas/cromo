export const STICKER_COUNT = 980
export const TEAM_COUNT = 48
export const STICKERS_PER_TEAM = 20
export const INTRO_STICKER_COUNT = 9
export const MUSEUM_STICKER_COUNT = 11

export const VARIANT_RARITY: Record<string, number> = {
  base_border: 1,
  base_borderless: 1,
  blue: 2,
  red: 3,
  purple: 4,
  green: 5,
  black_1of1: 6,
  orange_amazon: 7,
  gold_crumple: 8,
  blue_crumple: 9,
  red_crumple: 10,
  purple_crumple: 11,
  green_crumple: 12,
  black_crumple_1of1: 13,
  extra_purple: 15,
  extra_bronze: 16,
  extra_silver: 17,
  extra_gold: 18,
  swiss_green: 19,
}

export const DEFAULT_PAGE_SIZE = 100
export const MAX_TRADE_COUNTERS = 5
export const VERIFICATION_TOKEN_TTL_HOURS = 24
export const REFRESH_TOKEN_TTL_DAYS = 30
export const ACCESS_TOKEN_TTL_MINUTES = 15

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const
export type Group = (typeof GROUPS)[number]
