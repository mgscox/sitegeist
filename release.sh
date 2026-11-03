#!/bin/bash
set -e

BUMP_TYPE="$1"

if [ "$BUMP_TYPE" != "major" ] && [ "$BUMP_TYPE" != "minor" ] && [ "$BUMP_TYPE" != "patch" ]; then
    echo "Usage: ./release.sh <major|minor|patch>"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: uncommitted changes. Commit or stash first."
    exit 1
fi

# Read current version from manifest
MANIFEST="static/manifest.chrome.json"
CURRENT=$(node -p "require('./$MANIFEST').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TAG="v$NEW_VERSION"
DATE=$(date +%Y-%m-%d)

echo "Bumping version: $CURRENT -> $NEW_VERSION"

# Update package metadata and the extension manifest together.
node --input-type=module - "$NEW_VERSION" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
for (const path of ['static/manifest.chrome.json', 'package.json', 'package-lock.json']) {
    const metadata = JSON.parse(readFileSync(path, 'utf8'));
    metadata.version = version;
    if (path === 'package-lock.json') metadata.packages[''].version = version;
    writeFileSync(path, JSON.stringify(metadata, null, '\t') + '\n');
}
NODE

# Update CHANGELOG: replace [Unreleased] with version, add new [Unreleased]
node -e "
const fs = require('fs');
let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
changelog = changelog.replace('## [Unreleased]', '## [Unreleased]\n\n## [$NEW_VERSION] - $DATE');
fs.writeFileSync('CHANGELOG.md', changelog);
"

# Run checks
echo "Running checks..."
./check.sh

# Commit, tag, push
git add "$MANIFEST" package.json package-lock.json CHANGELOG.md
git commit -m "Release v$NEW_VERSION"
git tag "$TAG"
git push origin main
git push origin "$TAG"

echo ""
echo "Released v$NEW_VERSION"
echo "GitHub Actions will build and create the release at:"
echo "  https://github.com/badlogic/sitegeist/releases/tag/$TAG"
