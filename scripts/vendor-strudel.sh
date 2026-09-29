#!/usr/bin/env bash
# Fetch the AGPL @strudel/web IIFE so pack-xdc.sh can zip it.
# WebxDC has no network at runtime — this is a build step only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src/vendor"
VER="${1:-1.3.0}"
mkdir -p "$DEST"
URL="https://unpkg.com/@strudel/web@${VER}/dist/index.js"
echo "fetch $URL"
curl -fsSL "$URL" -o "$DEST/strudel-web.js"
cat > "$DEST/NOTICE.md" <<EOF
# Vendored @strudel/web

File: \`strudel-web.js\`

- Package: [@strudel/web](https://www.npmjs.com/package/@strudel/web) ${VER}
- Upstream: https://codeberg.org/uzu/strudel
- License: AGPL-3.0-or-later (same as this repo)
- Source of this file: ${URL}

Do not load this from a CDN at runtime. WebxDC mini-apps have no network.
EOF
wc -c "$DEST/strudel-web.js"
echo "ok"
