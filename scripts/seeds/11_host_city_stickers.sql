-- scripts/seeds/11_host_city_stickers.sql
-- REMOVED: Host City stickers (HC1–HC16) do not exist in the official
-- 2026 FIFA World Cup Panini album. The host nations are represented by
-- FWC6 (Canada), FWC7 (Mexico), and FWC8 (United States) — all foil
-- stickers in the standard intro section.
-- Cleanup: remove any HC stickers left over from earlier seed versions.
DELETE FROM sticker_variants WHERE sticker_id IN (SELECT id FROM stickers WHERE album_code LIKE 'HC%');
DELETE FROM sticker_album_pages WHERE sticker_id IN (SELECT id FROM stickers WHERE album_code LIKE 'HC%');
DELETE FROM stickers WHERE album_code LIKE 'HC%';
