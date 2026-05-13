#!/bin/bash
# scripts/seed-database.sh
# Runs all seed files in order against $DATABASE_URL.
# Files 07 and 09 are skipped in production to prevent test data from leaking.

set -e

DOCKER_COMPOSE="docker compose -f infrastructure/docker/docker-compose.yml"
PSQL="$DOCKER_COMPOSE exec -T db psql -U stickfolio stickfolio_dev"

run_seed() {
  $PSQL < "$1"
}

echo "▶ Running database seeds..."

run_seed scripts/seeds/01_teams.sql
echo "✓ Teams seeded (48 teams)"

run_seed scripts/seeds/02_intro_stickers.sql
echo "✓ Introduction stickers seeded"

run_seed scripts/seeds/03_team_stickers.sql
echo "✓ Team stickers seeded (960 stickers)"

run_seed scripts/seeds/04_museum_stickers.sql
echo "✓ FIFA Museum stickers seeded"

run_seed scripts/seeds/05_variants.sql
echo "✓ Sticker variants generated"

run_seed scripts/seeds/06_feature_flags.sql
echo "✓ Feature flags seeded"

# 08_coca_cola_stickers.sql is reserved but not run until the official
# Panini Coca-Cola sticker list is confirmed and the file is populated.
# Uncomment the two lines below once 08_coca_cola_stickers.sql has real data.
# run_seed scripts/seeds/08_coca_cola_stickers.sql
# echo "✓ Coca-Cola stickers seeded"

# 10_extra_stickers.sql is reserved but not run until the official
# Panini Extra Sticker checklist (20 players) is confirmed and the file is populated.
# Uncomment the two lines below once 10_extra_stickers.sql has real data.
# run_seed scripts/seeds/10_extra_stickers.sql
# echo "✓ Extra stickers seeded (20 players × 4 rarities)"

if [ "$NODE_ENV" != "production" ]; then
  run_seed scripts/seeds/07_test_users.sql
  echo "✓ Test users seeded (non-production only)"
  run_seed scripts/seeds/09_trust_safety.sql
  echo "✓ Trust & Safety sample data seeded (non-production only)"
fi

echo "✅ All seeds complete."
