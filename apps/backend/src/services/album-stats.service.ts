import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

/**
 * Recomputes denormalized owned_count / duplicate_count / total_count for a
 * specific set of user_albums. Runs the same settings-aware CTE as the old
 * in-flight getAlbumStats, but scoped to the given album IDs so the scan is
 * bounded.
 *
 * Call this inside the same transaction that mutated user_stickers, or after
 * an album's settings change. The function is idempotent.
 */
export async function recomputeAlbumStats(
  db: Queryable,
  albumIds: string[],
): Promise<void> {
  if (albumIds.length === 0) return;

  await db.query(
    `WITH album_info AS (
       SELECT ua.id AS album_id,
              ua.album_type_id,
              (ua.settings->>'includeExtras')::boolean   AS inc_extras,
              (ua.settings->>'includeCocaCola')::boolean AS inc_coca
       FROM user_albums ua
       WHERE ua.id = ANY($1::uuid[])
     ),
     filtered_stickers AS (
       SELECT ai.album_id, s.id AS sticker_id
       FROM album_info ai
       JOIN stickers s ON s.album_type_id = ai.album_type_id
       WHERE
         CASE
           WHEN s.sticker_type = 'coca_cola_special' THEN ai.inc_coca
           WHEN s.sticker_type = 'extra' THEN ai.inc_extras
           ELSE true
         END
     ),
     stats AS (
       SELECT
         fs.album_id,
         COUNT(DISTINCT fs.sticker_id)::int AS total,
         COUNT(DISTINCT CASE WHEN us.quantity > 0 THEN fs.sticker_id END)::int AS owned,
         COUNT(DISTINCT CASE WHEN us.quantity > 1 THEN fs.sticker_id END)::int AS duplicates
       FROM filtered_stickers fs
       LEFT JOIN sticker_variants sv ON sv.sticker_id = fs.sticker_id
       LEFT JOIN user_stickers us
         ON us.sticker_variant_id = sv.id AND us.album_id = fs.album_id
       GROUP BY fs.album_id
     )
     UPDATE user_albums ua SET
       total_count    = COALESCE(s.total, 0),
       owned_count    = COALESCE(s.owned, 0),
       duplicate_count = COALESCE(s.duplicates, 0)
     FROM stats s
     WHERE s.album_id = ua.id`,
    [albumIds],
  );
}
