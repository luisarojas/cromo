#!/bin/bash
# scripts/seed-database.sh
# Runs all seed files in order against $DATABASE_URL.
# Files 07 and 09 are skipped in production to prevent test data from leaking.

set -e

echo "▶ Running database seeds..."

psql "$DATABASE_URL" -f scripts/seeds/01_teams.sql
echo "✓ Teams seeded (48 teams)"

psql "$DATABASE_URL" -f scripts/seeds/02_intro_stickers.sql
echo "✓ Introduction stickers seeded"

psql "$DATABASE_URL" -f scripts/seeds/03_team_stickers.sql
echo "✓ Team stickers seeded (960 stickers)"

psql "$DATABASE_URL" -f scripts/seeds/04_museum_stickers.sql
echo "✓ FIFA Museum stickers seeded"

psql "$DATABASE_URL" -f scripts/seeds/05_variants.sql
echo "✓ Sticker variants generated"

psql "$DATABASE_URL" -f scripts/seeds/06_feature_flags.sql
echo "✓ Feature flags seeded"

# 08_coca_cola_stickers.sql is reserved but not run until the official
# Panini Coca-Cola sticker list is confirmed and the file is populated.
# Uncomment the two lines below once 08_coca_cola_stickers.sql has real data.
# psql "$DATABASE_URL" -f scripts/seeds/08_coca_cola_stickers.sql
# echo "✓ Coca-Cola stickers seeded"

if [ "$NODE_ENV" != "production" ]; then
  psql "$DATABASE_URL" -f scripts/seeds/07_test_users.sql
  echo "✓ Test users seeded (non-production only)"
  psql "$DATABASE_URL" -f scripts/seeds/09_trust_safety.sql
  echo "✓ Trust & Safety sample data seeded (non-production only)"
fi

echo "✅ All seeds complete."
