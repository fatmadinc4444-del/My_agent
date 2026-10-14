#!/usr/bin/env bash
# Builds the Three.js avatar (web/) and copies the bundle into the Flutter
# app's assets (flutter_app/assets/avatar/). Safe to run repeatedly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/flutter_app/assets/avatar"

cd "$ROOT/web"
npm ci
npm run build

if [[ ! -f dist/index.html ]]; then
  echo "error: web/dist/index.html missing after build" >&2
  exit 1
fi

# Replace the old bundle. Keep the dirs registered in pubspec.yaml alive.
rm -rf "$DEST"
mkdir -p "$DEST/assets"
cp -R dist/. "$DEST/"
mkdir -p "$DEST/assets"
touch "$DEST/assets/.gitkeep"

echo "Avatar bundle copied to $DEST"
