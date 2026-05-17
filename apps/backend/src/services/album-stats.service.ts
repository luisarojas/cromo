import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

/**
 * Recomputes denormalized owned_count / duplicate_count / total_count for a
 * specific set of user_albums. Runs the same edition + settings-aware CTE as
 * the old in-flight getAlbumStats, but scoped to the given album IDs so the
 * scan is bounded.
 *
 * Call this inside the same transaction that mutated user_stickers, or after
 * an album's settings/edition change. The function is idempotent.
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
              ae.key AS edition,
              (ua.settings->>'includeAllStickers')::boolean AS inc_all,
              (ua.settings->>'includeCocaCola')::boolean AS inc_coca,
              (ua.settings->>'includeNonAlbumMuseum')::boolean AS inc_museum
       FROM user_albums ua
       JOIN album_editions ae ON ae.id = ua.album_edition_id
       WHERE ua.id = ANY($1::uuid[])
     ),
     filtered_stickers AS (
       SELECT ai.album_id, s.id AS sticker_id
       FROM album_info ai
       JOIN stickers s ON s.album_type_id = ai.album_type_id
       LEFT JOIN sticker_album_pages sap
         ON sap.sticker_id = s.id AND sap.edition = ai.edition
       LEFT JOIN team_album_pages tap
         ON tap.team_id = s.team_id AND tap.edition = ai.edition
       WHERE
         CASE
           WHEN s.sticker_type = 'coca_cola_special' THEN ai.inc_coca
           WHEN s.sticker_type = 'museum'
             AND sap.page_start IS NULL AND tap.page_start IS NULL THEN ai.inc_museum
           WHEN sap.page_start IS NOT NULL OR tap.page_start IS NOT NULL THEN true
           ELSE ai.inc_all
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
