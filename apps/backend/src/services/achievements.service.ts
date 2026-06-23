import type { Pool } from 'pg';
import { ACHIEVEMENTS, type AchievementCriterionType } from '@cromo/shared';

// Achievement engine. Definitions live in @cromo/shared; this service
// evaluates whether each definition's criterion is currently satisfied
// for a user and INSERT-ON-CONFLICT-DO-NOTHING into user_achievements.
// The persisted rows answer "when was this badge unlocked," not "is it
// currently true" — once won, it stays won. That choice means a temporary
// roll-back of state (e.g. you deleted a sticker that dropped you under
// 50%) does not retract the badge, which is what users expect.
//
// Re-evaluation happens lazily on profile read. Cost: one COUNT/EXISTS
// query per definition, all cheap and indexed. If/when this becomes hot,
// move to an event-driven model — fire from collection.changed and
// trade.completed events, write to the same table.

export interface UnlockedAchievement {
  key: string;
  unlockedAt: string; // ISO
}

// Per-criterion evaluator. Each returns `true` when the user currently
// meets the bar; the caller inserts the row only on the rising edge.
const CRITERION_QUERIES: Record<AchievementCriterionType, (userId: string) => { sql: string; params: unknown[] }> = {
  first_sticker: (userId) => ({
    sql: `SELECT EXISTS(
            SELECT 1 FROM user_stickers us
            JOIN user_albums ua ON ua.id = us.album_id
            WHERE ua.user_id = $1
          ) AS hit`,
    params: [userId],
  }),
  percentage_gte_25: (userId) => percentageQuery(userId, 25),
  percentage_gte_50: (userId) => percentageQuery(userId, 50),
  percentage_gte_75: (userId) => percentageQuery(userId, 75),
  percentage_gte_100: (userId) => percentageQuery(userId, 100),
  team_complete_any: (userId) => ({
    sql: `SELECT EXISTS(
            -- A team is complete in an album if every album_code for
            -- that team has at least one owned variant in the album.
            WITH per_team AS (
              SELECT s.team_id, ua.id AS album_id,
                     COUNT(DISTINCT s.album_code) FILTER (
                       WHERE EXISTS (
                         SELECT 1 FROM user_stickers us2
                         JOIN sticker_variants sv ON sv.id = us2.sticker_variant_id
                         WHERE us2.album_id = ua.id AND sv.sticker_id = s.id
                       )
                     ) AS owned_codes,
                     COUNT(DISTINCT s.album_code) AS total_codes
              FROM user_albums ua
              JOIN stickers s ON s.album_type_id = ua.album_type_id
              WHERE ua.user_id = $1 AND s.team_id IS NOT NULL
              GROUP BY s.team_id, ua.id
            )
            SELECT 1 FROM per_team WHERE owned_codes = total_codes AND total_codes > 0 LIMIT 1
          ) AS hit`,
    params: [userId],
  }),
  all_teams_complete: (userId) => ({
    sql: `SELECT EXISTS(
            -- A user has "all teams complete" in some album if no team
            -- in that album has any missing code.
            WITH per_team AS (
              SELECT ua.id AS album_id, s.team_id,
                     COUNT(DISTINCT s.album_code) FILTER (
                       WHERE EXISTS (
                         SELECT 1 FROM user_stickers us2
                         JOIN sticker_variants sv ON sv.id = us2.sticker_variant_id
                         WHERE us2.album_id = ua.id AND sv.sticker_id = s.id
                       )
                     ) AS owned_codes,
                     COUNT(DISTINCT s.album_code) AS total_codes
              FROM user_albums ua
              JOIN stickers s ON s.album_type_id = ua.album_type_id
              WHERE ua.user_id = $1 AND s.team_id IS NOT NULL
              GROUP BY ua.id, s.team_id
            ),
            per_album AS (
              SELECT album_id,
                     COUNT(*) AS total_teams,
                     COUNT(*) FILTER (WHERE owned_codes = total_codes) AS complete_teams
              FROM per_team
              GROUP BY album_id
            )
            SELECT 1 FROM per_album WHERE total_teams > 0 AND complete_teams = total_teams LIMIT 1
          ) AS hit`,
    params: [userId],
  }),
  rare_pull: (userId) => ({
    sql: `SELECT EXISTS(
            SELECT 1 FROM user_stickers us
            JOIN user_albums ua ON ua.id = us.album_id
            JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
            WHERE ua.user_id = $1 AND sv.rarity_rank >= 4
          ) AS hit`,
    params: [userId],
  }),
  first_trade_completed: (userId) => ({
    sql: `SELECT EXISTS(
            SELECT 1 FROM trade_requests
            WHERE status = 'completed'
              AND (requester_id = $1 OR recipient_id = $1)
          ) AS hit`,
    params: [userId],
  }),
};

function percentageQuery(userId: string, threshold: number) {
  return {
    sql: `SELECT EXISTS(
            SELECT 1 FROM user_albums
            WHERE user_id = $1
              AND total_count > 0
              AND (owned_count * 100.0 / total_count) >= $2
          ) AS hit`,
    params: [userId, threshold],
  };
}

/**
 * Evaluate every achievement criterion for the user, persist any newly
 * met ones, and return the full unlocked set ordered by `unlocked_at`.
 *
 * Idempotent and cheap to re-run; callers should debounce per minute if
 * they are calling on a hot path.
 */
export async function evaluateAchievements(
  db: Pool,
  userId: string,
): Promise<UnlockedAchievement[]> {
  // 1. Read what's already unlocked so we can skip queries we don't need.
  const { rows: existing } = await db.query<{ achievement_key: string }>(
    `SELECT achievement_key FROM user_achievements WHERE user_id = $1`,
    [userId],
  );
  const already = new Set(existing.map((r) => r.achievement_key));

  // 2. For every definition not yet unlocked, run its criterion query and
  //    record a hit. The PK on (user_id, achievement_key) guarantees that
  //    a concurrent request can't double-insert.
  const newlyUnlocked: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (already.has(def.key)) continue;
    const q = CRITERION_QUERIES[def.criterion];
    if (!q) continue;
    const { sql: criterionSql, params } = q(userId);
    const { rows } = await db.query<{ hit: boolean }>(criterionSql, params);
    if (rows[0]?.hit) {
      newlyUnlocked.push(def.key);
    }
  }

  if (newlyUnlocked.length > 0) {
    await db.query(
      `INSERT INTO user_achievements (user_id, achievement_key)
       SELECT $1, UNNEST($2::text[])
       ON CONFLICT DO NOTHING`,
      [userId, newlyUnlocked],
    );
  }

  // 3. Return the full set, including any rows that were already in the
  //    table — we filter out keys whose definition was removed from code.
  const { rows: out } = await db.query<{ achievement_key: string; unlocked_at: Date }>(
    `SELECT achievement_key, unlocked_at
       FROM user_achievements
      WHERE user_id = $1
      ORDER BY unlocked_at`,
    [userId],
  );
  const knownKeys = new Set(ACHIEVEMENTS.map((a) => a.key));
  return out
    .filter((r) => knownKeys.has(r.achievement_key))
    .map((r) => ({ key: r.achievement_key, unlockedAt: r.unlocked_at.toISOString() }));
}
