#!/usr/bin/env bash
# Pack src/ into strudel.xdc (zip). Do NOT include webxdc.js — the host injects it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
OUT="$ROOT/strudel.xdc"
rm -f "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$SRC/index.html" "$SRC/style.css" "$SRC/app.js" "$SRC/samples.js" "$SRC/manifest.toml" "$TMP/"
for part in "$SRC"/starter-pack-*.js; do
  [[ -f "$part" ]] && cp "$part" "$TMP/"
done
if [[ -f "$SRC/icon.png" ]]; then cp "$SRC/icon.png" "$TMP/"; fi
if [[ -f "$SRC/icon.svg" ]]; then cp "$SRC/icon.svg" "$TMP/"; fi
if [[ -f "$ROOT/packs/starter/CREDITS.md" ]]; then
  mkdir -p "$TMP/packs/starter"
  cp "$ROOT/packs/starter/CREDITS.md" "$TMP/packs/starter/"
fi
(
  cd "$TMP"
  zip -9 -X -r "$OUT" . >/dev/null
)
SIZE=$(wc -c < "$OUT")
echo "wrote $OUT ($SIZE bytes)"
