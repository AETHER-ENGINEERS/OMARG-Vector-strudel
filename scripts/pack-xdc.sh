#!/usr/bin/env bash
# Pack src/ into strudel.xdc (zip). Do NOT include webxdc.js — the host injects it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
OUT="$ROOT/strudel.xdc"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$SRC/index.html" "$SRC/style.css" "$SRC/app.js" "$SRC/samples.js" "$SRC/manifest.toml" "$TMP/"
if [[ -f "$SRC/icon.png" ]]; then cp "$SRC/icon.png" "$TMP/"; fi
if [[ -f "$SRC/icon.svg" ]]; then cp "$SRC/icon.svg" "$TMP/"; fi

(
  cd "$TMP"
  zip -9 -X -r "$OUT" . >/dev/null
)

SIZE=$(wc -c < "$OUT")
echo "wrote $OUT ($SIZE bytes)"
if (( SIZE > 8000000 )); then
  echo "warning: over 8MB — keep sample packs out of the core zip" >&2
fi
