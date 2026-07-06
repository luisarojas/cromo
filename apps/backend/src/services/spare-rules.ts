import { VARIANT_SCARCITY } from '@cromo/shared';

/**
 * Keep-the-rarest spare rule, shared by every surface that decides which
 * copies of a sticker are tradeable (public offered lists, the matchmaker,
 * the third-party give side).
 *
 * Under an album's "count all variants as duplicates" setting, the owner
 * auto-keeps ONE copy of the rarest owned variant of each sticker; every
 * other copy is available to trade. Flags interact as:
 *   - trade_hidden  — a manual keep: never offered, and the hidden copy still
 *                     counts as the auto-keep when it's the rarest (hiding
 *                     your black 1-of-1 releases the other variants).
 *   - trade_forced  — the escape hatch: fully offered, never the auto-keep.
 *                     Forcing the rarest shifts the keep to the next-rarest
 *                     non-forced variant; forcing everything keeps nothing.
 *
 * "Rarest" is trade value (VARIANT_SCARCITY — pack odds, the same scale the
 * fairness math uses), NOT the catalog's rarity_rank, which is a display
 * ordering that puts swiss_green above a black 1-of-1. rarity_rank and
 * variant_type only break scarcity ties (black vs black_crumple).
 */

// VARIANT_SCARCITY tokens/weights are code-owned constants, safe to inline.
const SCARCITY_CASES = Object.entries(VARIANT_SCARCITY)
  .map(([token, weight]) => `WHEN '${token}' THEN ${weight}`)
  .join(' ');

/** ORDER BY fragment ranking a sticker_variants alias rarest-first. */
export function scarcityOrderSql(svAlias: string): string {
  return `CASE ${svAlias}.variant_type ${SCARCITY_CASES} ELSE 1 END DESC, ${svAlias}.rarity_rank DESC, ${svAlias}.variant_type`;
}

/**
 * Scalar subquery: the sticker_variant_id the owner auto-keeps for one
 * sticker, or NULL when every owned copy is trade_forced. `albumRef` and
 * `stickerIdRef` are SQL expressions valid in the caller's scope (e.g. `$2`,
 * `sv.sticker_id`).
 */
export function keptVariantSql(albumRef: string, stickerIdRef: string): string {
  return `(
    SELECT us_k.sticker_variant_id
    FROM user_stickers us_k
    JOIN sticker_variants sv_k ON sv_k.id = us_k.sticker_variant_id
    WHERE us_k.album_id = ${albumRef}
      AND sv_k.sticker_id = ${stickerIdRef}
      AND us_k.quantity > 0
      AND NOT us_k.trade_forced
    ORDER BY ${scarcityOrderSql('sv_k')}
    LIMIT 1
  )`;
}
