-- Enable accent-insensitive matching on player_name lookups. The scan
-- pipeline and the album/trade search routes compare AI-transcribed or
-- user-typed names against the catalog with ILIKE, which is case- but not
-- accent-insensitive — so "Vinicius Junior" never matched "Vinícius Júnior".
-- The unaccent() function from postgres-contrib normalises both sides at
-- query time; queries now wrap player_name and the parameter in unaccent().
CREATE EXTENSION IF NOT EXISTS "unaccent";
