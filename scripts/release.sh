#!/bin/bash
# scripts/release.sh
#
# Cut a release of the Cromo monorepo. See the "Application Versioning"
# section of CLAUDE.md for the full model — short version: the runtime
# `APP_VERSION` is `git describe --tags --always --dirty`, and the four
# workspace `package.json` `version` fields hold the *base SemVer* that
# git describe extends. They must stay in lockstep, so always bump them
# via this script — never by hand.
#
# Usage:
#   ./scripts/release.sh 0.2.0
#
# Performs, in order:
#   1. Validate <version> is a clean SemVer (MAJOR.MINOR.PATCH[-prerelease]).
#      Build metadata (`+sha…`) is rejected because git tag names disallow `+`.
#   2. Refuse to run on a dirty working tree or with v<version> already
#      tagged — both would produce a tag that doesn't mean what it says.
#   3. Validate that apps/frontend/src/app/changelog/entries.ts has a
#      non-empty "Unreleased" entry — fail before any mutations if the
#      release would ship with empty notes.
#   4. Rewrite the top-level "version" field in:
#        package.json
#        apps/backend/package.json
#        apps/frontend/package.json
#        packages/shared/package.json
#   5. Rotate the changelog: rename Unreleased → v<version>, stamp today's
#      UTC date, and prepend a fresh empty Unreleased block.
#   6. git add + commit those five files with message "Release v<version>".
#   7. Create an annotated tag v<version> on the new commit.
#
# After it returns successfully:
#   git push origin main --tags
#
# CI then picks up the new tag automatically — `scripts/app-version.sh`
# reports `v<version>` for the release commit and `v<version>-N-g<sha>`
# for subsequent commits until the next release.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 0.2.0" >&2
  exit 1
fi

VERSION="$1"

# Strict SemVer: MAJOR.MINOR.PATCH with optional `-prerelease` (e.g. `0.2.0`,
# `1.0.0-rc.1`). Pre-release identifiers may contain [0-9A-Za-z.-].
if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "✗ '$VERSION' is not a valid SemVer (expected MAJOR.MINOR.PATCH[-prerelease])" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# A dirty tree would make the release tag point at uncommitted state and the
# next `git describe --dirty` lie about whether the release is clean.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "✗ working tree is dirty. Commit or stash before releasing." >&2
  git status --short >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  echo "✗ tag v$VERSION already exists at $(git rev-parse --short "refs/tags/v$VERSION")." >&2
  exit 1
fi

# Source of truth for which workspace package.jsons participate in versioning.
# Keep this list in sync with the table in CLAUDE.md if a new app/package is
# added to the monorepo.
FILES=(
  package.json
  apps/backend/package.json
  apps/frontend/package.json
  packages/shared/package.json
)

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "✗ expected $f to exist — did the workspace layout change?" >&2
    echo "  update FILES in scripts/release.sh to match." >&2
    exit 1
  fi
done

CHANGELOG_FILE="apps/frontend/src/app/changelog/entries.ts"

# Pre-flight: refuse to release if the in-app changelog's Unreleased entry
# is empty. Done before any mutations so a failure leaves the tree clean.
node scripts/rotate-changelog.mjs check

# In-place rewrite of the top-level "version" field. We use `node` instead of
# `sed`/`jq` so the existing key order and formatting (2-space indent + trailing
# newline) are preserved, and so we don't introduce a `jq` host dependency.
# Strings come in via env, not interpolation, so a hostile $VERSION can't
# escape into the JS source (also: it's already SemVer-validated above).
for f in "${FILES[@]}"; do
  PKG_PATH="$f" PKG_VERSION="$VERSION" node -e "
    const fs = require('fs');
    const path = process.env.PKG_PATH;
    const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
    pkg.version = process.env.PKG_VERSION;
    fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  bumped $f → $VERSION"
done

# Rotate the in-app changelog: Unreleased → v$VERSION + today's UTC date,
# then a fresh empty Unreleased prepended. The check above already verified
# the Unreleased block has bullets, so this should never fail; if it does,
# the package.json bumps are left uncommitted and the user can re-run.
node scripts/rotate-changelog.mjs rotate "v$VERSION"

git add "${FILES[@]}" "$CHANGELOG_FILE"
git commit -m "Release v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"

echo
echo "✓ Tagged v$VERSION on $(git rev-parse --short HEAD)."
echo "  Push with: git push origin main --tags"
