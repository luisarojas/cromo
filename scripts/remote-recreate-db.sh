#!/bin/bash
# Runs on the EC2 host (via SSM). Drops and recreates cromo_dev, applies
# migrations by restarting the API, then seeds from S3.
# Upload seeds first: aws s3 sync scripts/seeds/ s3://<UPLOADS_BUCKET>/_deploy/seeds/
set -euo pipefail

source /etc/cromo/cromo.env

REGION="${AWS_REGION:-ca-central-1}"
POSTGRES_URL=$(echo "$DATABASE_URL" | sed 's|/cromo_dev$|/postgres|')

echo "→ Dropping cromo_dev..."
docker run --rm --network host postgres:16-alpine \
  psql "$POSTGRES_URL" -c "DROP DATABASE IF EXISTS cromo_dev;"

echo "→ Creating cromo_dev..."
docker run --rm --network host postgres:16-alpine \
  psql "$POSTGRES_URL" -c "CREATE DATABASE cromo_dev;"

echo "→ Restarting API to apply migrations..."
cd /opt/cromo
docker compose restart api

echo "→ Waiting for API to be healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T api \
      node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      2>/dev/null; then
    echo "  API is healthy."
    break
  fi
  echo "  attempt $i/30 — not ready yet, retrying in 5s..."
  sleep 5
done

echo "→ Downloading seeds from S3..."
mkdir -p /tmp/cromo-seeds
aws s3 sync "s3://${UPLOADS_BUCKET}/_deploy/seeds/" /tmp/cromo-seeds/ --region "$REGION"

PSQL="docker run --rm --network host -v /tmp/cromo-seeds:/seeds postgres:16-alpine psql $DATABASE_URL"

echo "→ Running seeds..."
$PSQL -f /seeds/00_album_catalog.sql && echo "  ✓ 00_album_catalog"
$PSQL -f /seeds/01_teams.sql         && echo "  ✓ 01_teams"
$PSQL -f /seeds/02_intro_stickers.sql && echo "  ✓ 02_intro_stickers"
$PSQL -f /seeds/03_team_stickers.sql  && echo "  ✓ 03_team_stickers"
$PSQL -f /seeds/05_variants.sql       && echo "  ✓ 05_variants"
$PSQL -f /seeds/06_feature_flags.sql  && echo "  ✓ 06_feature_flags"
$PSQL -f /seeds/08_coca_cola_stickers.sql && echo "  ✓ 08_coca_cola_stickers"
$PSQL -f /seeds/10_extra_stickers.sql && echo "  ✓ 10_extra_stickers"
$PSQL -f /seeds/13_team_album_pages.sql && echo "  ✓ 13_team_album_pages"
$PSQL -f /seeds/14_sticker_album_pages.sql && echo "  ✓ 14_sticker_album_pages"
$PSQL -f /seeds/07_test_users.sql    && echo "  ✓ 07_test_users"
$PSQL -f /seeds/09_trust_safety.sql  && echo "  ✓ 09_trust_safety"

echo "✅ Done. Database recreated and seeded."
