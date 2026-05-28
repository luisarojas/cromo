#!/bin/bash
set -euo pipefail
source /etc/cromo/cromo.env

echo "→ Adding password_hash column..."
docker run --rm --network host postgres:16-alpine \
  psql "$DATABASE_URL" -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;"

echo "→ Restarting API..."
cd /opt/cromo && docker compose restart api

echo "✅ Done."
