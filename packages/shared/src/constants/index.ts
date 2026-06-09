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
// `emoji`, the localised title/description, and `tier` for display order.
// The `key` is what the `user_achievements` table persists, so adding or
// removing entries here changes what shows up on every profile.

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
  | 'streak_7_days'

export interface AchievementDefinition {
  key: string
  tier: number
  emoji: string
  titleEn: string
  titleEs: string
  descriptionEn: string
  descriptionEs: string
  criterion: AchievementCriterionType
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { key: 'first_sticker', tier: 1, emoji: '🌱',
    titleEn: 'First sticker', titleEs: 'Primer cromo',
    descriptionEn: 'You added your first sticker to a Cromo album.',
    descriptionEs: 'Agregaste tu primer cromo a un álbum en Cromo.',
    criterion: 'first_sticker' },
  { key: 'pct_25', tier: 2, emoji: '🚀',
    titleEn: 'A quarter of the way', titleEs: 'Un cuarto del camino',
    descriptionEn: 'You filled 25% of an album.',
    descriptionEs: 'Llenaste el 25% de un álbum.',
    criterion: 'percentage_gte_25' },
  { key: 'pct_50', tier: 3, emoji: '⚡',
    titleEn: 'Halfway hero', titleEs: 'A medio camino',
    descriptionEn: 'You filled half of an album.',
    descriptionEs: 'Llenaste la mitad de un álbum.',
    criterion: 'percentage_gte_50' },
  { key: 'pct_75', tier: 4, emoji: '🔥',
    titleEn: 'On the home stretch', titleEs: 'En la recta final',
    descriptionEn: 'You filled 75% of an album.',
    descriptionEs: 'Llenaste el 75% de un álbum.',
    criterion: 'percentage_gte_75' },
  { key: 'team_complete', tier: 4, emoji: '🏟️',
    titleEn: 'Team complete', titleEs: 'Equipo completo',
    descriptionEn: 'You completed every sticker for at least one national team.',
    descriptionEs: 'Completaste todos los cromos de al menos un equipo nacional.',
    criterion: 'team_complete_any' },
  { key: 'rare_pull', tier: 4, emoji: '✨',
    titleEn: 'Rare pull', titleEs: 'Tirada rara',
    descriptionEn: 'You logged a parallel of purple rarity or higher.',
    descriptionEs: 'Registraste un parallel de rareza púrpura o superior.',
    criterion: 'rare_pull' },
  { key: 'first_trade', tier: 4, emoji: '🤝',
    titleEn: 'First trade', titleEs: 'Primer intercambio',
    descriptionEn: 'You completed your first trade.',
    descriptionEs: 'Completaste tu primer intercambio.',
    criterion: 'first_trade_completed' },
  { key: 'all_teams', tier: 6, emoji: '🌎',
    titleEn: 'All 48 teams', titleEs: 'Las 48 selecciones',
    descriptionEn: 'You completed every team in the album.',
    descriptionEs: 'Completaste todas las selecciones del álbum.',
    criterion: 'all_teams_complete' },
  { key: 'pct_100', tier: 10, emoji: '🏆',
    titleEn: 'Album complete', titleEs: 'Álbum completo',
    descriptionEn: 'You filled an entire album — every sticker, every page.',
    descriptionEs: 'Llenaste un álbum entero — cada cromo, cada página.',
    criterion: 'percentage_gte_100' },
]

export const ACHIEVEMENT_KEYS: readonly string[] = ACHIEVEMENTS.map((a) => a.key)

export function findAchievement(key: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key)
}
