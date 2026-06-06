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
#   ./scripts/release.sh 0.2.0 --allow-empty   # ship without changelog notes
#   ./scripts/release.sh 0.2.0 --no-publish    # local-only (no push, no GH release)
#
# Performs, in order:
#   1. Validate <version> is a clean SemVer (MAJOR.MINOR.PATCH[-prerelease]).
#      Build metadata (`+sha…`) is rejected because git tag names disallow `+`.
#   2. Refuse to run on a dirty working tree or with v<version> already
#      tagged — both would produce a tag that doesn't mean what it says.
#   3. Validate that apps/frontend/src/app/changelog/entries.ts has a
#      non-empty "Unreleased" entry — fail before any mutations if the
#      release would ship with empty notes (unless --allow-empty is set).
#   4. Rewrite the top-level "version" field in:
#        package.json
#        apps/backend/package.json
#        apps/frontend/package.json
#        packages/shared/package.json
#   5. Rotate the changelog: rename Unreleased → v<version>, stamp today's
#      UTC date, and prepend a fresh empty Unreleased block.
#   6. git add + commit those five files with message "Release v<version>".
#   7. Create an annotated tag v<version> on the new commit.
#   8. Publish: push commit + tag to `origin`, then create a GitHub release
#      whose body is the markdown rendering of the v<version> changelog
#      entry. Skipped when --no-publish is passed (local-only cut).
#
# CI then picks up the new tag automatically — `scripts/app-version.sh`
# reports `v<version>` for the release commit and `v<version>-N-g<sha>`
# for subsequent commits until the next release.

set -euo pipefail

VERSION=""
ALLOW_EMPTY=0
PUBLISH=1

while [ $# -gt 0 ]; do
  case "$1" in
    --allow-empty) ALLOW_EMPTY=1 ;;
    --no-publish)  PUBLISH=0 ;;
    -h|--help)
      echo "Usage: $0 <version> [--allow-empty] [--no-publish]" >&2
      exit 0
      ;;
    -*)
      echo "✗ unknown flag: $1" >&2
      exit 1
      ;;
    *)
      if [ -n "$VERSION" ]; then
        echo "✗ extra positional argument: $1" >&2
        exit 1
      fi
      VERSION="$1"
      ;;
  esac
  shift
done

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> [--allow-empty] [--no-publish]" >&2
  echo "Example: $0 0.2.0" >&2
  exit 1
fi

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

# Publishing requires gh (and an authenticated session). Check up-front so a
# missing dependency fails the run before any mutations.
if [ "$PUBLISH" -eq 1 ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "✗ 'gh' CLI not found on PATH. Install GitHub CLI or re-run with --no-publish." >&2
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "✗ 'gh' is not authenticated. Run 'gh auth login' or re-run with --no-publish." >&2
    exit 1
  fi
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
# is empty (unless --allow-empty). Done before any mutations so a failure
# leaves the tree clean.
CHECK_FLAGS=()
[ "$ALLOW_EMPTY" -eq 1 ] && CHECK_FLAGS+=(--allow-empty)
# macOS ships bash 3.2 by default; under `set -u`, expanding an empty array
# with "${arr[@]}" raises "unbound variable". The `${arr[@]+...}` form
# expands to nothing when the array is unset/empty and to the quoted array
# otherwise — bash 3.2 safe and a no-op on bash 5+.
node scripts/rotate-changelog.mjs check ${CHECK_FLAGS[@]+"${CHECK_FLAGS[@]}"}

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
# then a fresh empty Unreleased prepended. The check above already validated
# the Unreleased shape (and bullet count if --allow-empty was not set).
node scripts/rotate-changelog.mjs rotate "v$VERSION" ${CHECK_FLAGS[@]+"${CHECK_FLAGS[@]}"}

git add "${FILES[@]}" "$CHANGELOG_FILE"
git commit -m "Release v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"

echo
echo "✓ Tagged v$VERSION on $(git rev-parse --short HEAD)."

if [ "$PUBLISH" -eq 0 ]; then
  echo "  Skipped publish (--no-publish). Push with:"
  echo "    git push origin main --tags"
  echo "  Then optionally:"
  echo "    gh release create v$VERSION --title v$VERSION --notes \"\$(node scripts/rotate-changelog.mjs notes v$VERSION)\""
  exit 0
fi

# Publish step. Pushing the tag and main together keeps the deploy pipeline
# from racing on a tagless commit. We push by explicit refspecs so the script
# never accidentally pushes unrelated local branches.
echo
echo "Pushing main + tag to origin…"
git push origin "refs/heads/main:refs/heads/main" "refs/tags/v$VERSION:refs/tags/v$VERSION"

# Render release notes from the just-rotated entry. May be empty (when
# --allow-empty was used); in that case we create the release with no body.
NOTES="$(node scripts/rotate-changelog.mjs notes "v$VERSION")"

echo "Creating GitHub release v$VERSION…"
if [ -n "$NOTES" ]; then
  gh release create "v$VERSION" --title "v$VERSION" --notes "$NOTES"
else
  gh release create "v$VERSION" --title "v$VERSION" --notes ""
fi

echo
echo "✓ Released v$VERSION."
