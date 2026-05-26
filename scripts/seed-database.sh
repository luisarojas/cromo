#!/bin/bash
# scripts/seed-database.sh
# Runs all seed files in order against $DATABASE_URL.
# Files 07 and 09 are skipped in production to prevent test data from leaking.
#
# Default target: local Docker dev DB. To seed a remote DB (e.g. dev AWS RDS),
# set DATABASE_URL and pass --remote:
#   DATABASE_URL="postgres://..." ./scripts/seed-database.sh --remote

set -e

if [ "$1" = "--remote" ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "DATABASE_URL must be set when --remote is passed" >&2
    exit 1
  fi
  PSQL="psql $DATABASE_URL"
else
  DOCKER_COMPOSE="docker compose -f infrastructure/docker/docker-compose.yml"
  PSQL="$DOCKER_COMPOSE exec -T db psql -U cromo cromo_dev"
fi

run_seed() {
  $PSQL < "$1"
}

echo "▶ Running database seeds..."

run_seed scripts/seeds/00_album_catalog.sql
echo "✓ Album catalog seeded (album_types, editions, formats, scan prompt)"

run_seed scripts/seeds/01_teams.sql
echo "✓ Teams seeded (48 teams)"

run_seed scripts/seeds/02_intro_stickers.sql
echo "✓ Introduction stickers seeded (FWC1–FWC19 + Panini logo, 20 total)"

run_seed scripts/seeds/03_team_stickers.sql
echo "✓ Team stickers seeded (960 stickers)"

run_seed scripts/seeds/05_variants.sql
echo "✓ Sticker variants generated"

run_seed scripts/seeds/06_feature_flags.sql
echo "✓ Feature flags seeded"

run_seed scripts/seeds/08_coca_cola_stickers.sql
echo "✓ Coca-Cola stickers seeded (CC1–CC12)"

run_seed scripts/seeds/10_extra_stickers.sql
echo "✓ Extra stickers seeded (EX1–EX20, 4 rarities each)"

run_seed scripts/seeds/13_team_album_pages.sql
echo "✓ Team album pages seeded"

run_seed scripts/seeds/14_sticker_album_pages.sql
echo "✓ Sticker album pages seeded (CC, FWC/intro)"

if [ "$NODE_ENV" != "production" ]; then
  run_seed scripts/seeds/07_test_users.sql
  echo "✓ Test users seeded (non-production only)"
  run_seed scripts/seeds/09_trust_safety.sql
  echo "✓ Trust & Safety sample data seeded (non-production only)"
fi

echo "✅ All seeds complete."
