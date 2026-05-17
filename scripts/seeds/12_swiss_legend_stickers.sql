-- scripts/seeds/12_swiss_legend_stickers.sql
-- REMOVED: Swiss Legends stickers (L1–L10) do not exist in the official
-- 2026 FIFA World Cup Panini album. The Switzerland United Edition is
-- distinguished by green parallel stickers (swiss_green variant), not
-- a dedicated legends section. Switzerland did not qualify for the tournament.
-- Cleanup: remove any L stickers left over from earlier seed versions.
DELETE FROM sticker_variants WHERE sticker_id IN (SELECT id FROM stickers WHERE album_code LIKE 'L%' AND sticker_type = 'museum');
DELETE FROM sticker_album_pages WHERE sticker_id IN (SELECT id FROM stickers WHERE album_code LIKE 'L%' AND sticker_type = 'museum');
DELETE FROM stickers WHERE album_code LIKE 'L%' AND sticker_type = 'museum';
