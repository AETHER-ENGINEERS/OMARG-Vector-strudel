#!/usr/bin/env bash
# Pack src/ into strudel.xdc (zip). Do NOT include webxdc.js — the host injects it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
OUT="$ROOT/strudel.xdc"
if [[ ! -f "$SRC/vendor/strudel-web.js" ]]; then
  echo "vendor missing — fetching @strudel/web"
  bash "$ROOT/scripts/vendor-strudel.sh"
fi
rm -f "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$SRC/index.html" "$SRC/style.css" "$SRC/app.js" "$SRC/samples.js" "$SRC/manifest.toml" "$TMP/"
for part in "$SRC"/starter-pack-*.js; do
  [[ -f "$part" ]] && cp "$part" "$TMP/"
done
if [[ -d "$SRC/vendor" ]]; then
  mkdir -p "$TMP/vendor"
  cp -R "$SRC/vendor/." "$TMP/vendor/"
fi
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
if (( SIZE > 50000000 )); then
  echo "warning: over 50MB — split a larger pack into a sibling repo" >&2
fi
