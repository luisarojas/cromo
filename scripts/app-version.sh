#!/bin/bash
# scripts/app-version.sh
#
# Prints the canonical runtime APP_VERSION for the current working tree.
# This is the value that ends up in /api/v1/health, Sentry release tags, and
# any log line that quotes a build identifier. See the "Application Versioning"
# section of CLAUDE.md for the full model.
#
# Format: <git describe --tags --always --dirty>
#   v0.3.1             → exact release tag (clean tree)
#   v0.3.1-4-gabcd123  → 4 commits past v0.3.1, at abcd123 (clean tree)
#   abcd123            → no tags found, just the short SHA
#   <…>-dirty          → working tree has uncommitted changes
#
# Falls back to "0.0.0-local" if git is unavailable or this is not a repo
# (e.g. building from a tarball outside CI).
#
# Used by:
#   - scripts/dev-up.sh           — exports APP_VERSION before `docker compose`
#   - .github/workflows/ci-cd.yml — build-arg for backend + frontend images
#
# Release tags are produced by scripts/release.sh, which also bumps the
# four workspace package.json `version` fields (the *base SemVer* this
# runtime version extends — never edit those by hand).

set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "0.0.0-local"
  exit 0
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "0.0.0-local"
  exit 0
fi

git describe --tags --always --dirty 2>/dev/null || echo "0.0.0-local"
