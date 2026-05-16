-- Migration 0014: Change user_settings.cities from TEXT[] to JSONB
-- Stores [{ "label": "Paris, France", "placeId": 7444 }, ...] instead of plain strings.
-- All existing rows have an empty array so the USING clause is safe.

ALTER TABLE user_settings ALTER COLUMN cities DROP DEFAULT;
ALTER TABLE user_settings ALTER COLUMN cities TYPE JSONB USING '[]'::jsonb;
ALTER TABLE user_settings ALTER COLUMN cities SET DEFAULT '[]'::jsonb;
