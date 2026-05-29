#!/bin/bash
# scripts/dev-up.sh
#
# Wrapper around the local docker-compose stack that exports APP_VERSION
# (derived from `git describe`) before delegating to docker compose. Use this
# instead of running docker compose directly when you want the local stack's
# /api/v1/health and Sentry releases to reflect the actual git state.
#
# Anything you pass after the script name is forwarded to docker compose, e.g.:
#   ./scripts/dev-up.sh up --build
#   ./scripts/dev-up.sh up -d
#   ./scripts/dev-up.sh logs -f api
#   ./scripts/dev-up.sh down
#
# Running `docker compose ...` directly still works — APP_VERSION just falls
# back to the static "0.0.0-local" label baked into the compose file.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

APP_VERSION="$("$REPO_ROOT/scripts/app-version.sh")"
export APP_VERSION

echo "APP_VERSION=$APP_VERSION"
exec docker compose -f "$REPO_ROOT/infrastructure/docker/docker-compose.yml" "$@"
