#!/usr/bin/env bash
# Rebuild packs/starter/*.ogg and src/starter-pack-N.js from Sonic Pi CC0 flacs.
# Requires: curl, ffmpeg, python3
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/packs/starter"
SRC_JS="$ROOT/src"
BASE="https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/dev/etc/samples"

mkdir -p "$DEST"/{bd,sd,hh,oh,cp,rim,ht,mt,lt,cr,cb}

download() {
  local src="$1" dest="$2"
  local flac="$DEST/${dest%.ogg}.flac"
  mkdir -p "$(dirname "$DEST/$dest")"
  echo "fetch $src -> $dest"
  curl -fsSL "$BASE/$src" -o "$flac"
  ffmpeg -y -i "$flac" -ac 1 -ar 22050 -c:a libvorbis -q:a 1 "$DEST/$dest" </dev/null >/dev/null 2>&1
  rm -f "$flac"
}

download drum_heavy_kick.flac bd/0.ogg
download drum_bass_hard.flac bd/1.ogg
download drum_bass_soft.flac bd/2.ogg
download bd_haus.flac bd/3.ogg
download bd_tek.flac bd/4.ogg
download bd_808.flac bd/5.ogg
download drum_snare_hard.flac sd/0.ogg
download drum_snare_soft.flac sd/1.ogg
download elec_snare.flac sd/2.ogg
download sn_dolf.flac sd/3.ogg
download drum_cymbal_closed.flac hh/0.ogg
download drum_cymbal_pedal.flac hh/1.ogg
download elec_tick.flac hh/2.ogg
download drum_cymbal_open.flac oh/0.ogg
download perc_snap.flac cp/0.ogg
download perc_snap2.flac cp/1.ogg
download elec_blip.flac rim/0.ogg
download elec_blip2.flac rim/1.ogg
download drum_tom_hi_hard.flac ht/0.ogg
download drum_tom_mid_hard.flac mt/0.ogg
download drum_tom_lo_hard.flac lt/0.ogg
download drum_cymbal_hard.flac cr/0.ogg
download drum_splash_hard.flac cr/1.ogg
download drum_cowbell.flac cb/0.ogg

python3 - "$DEST" "$SRC_JS" <<'PY'
import base64, sys
from pathlib import Path
dest = Path(sys.argv[1])
src_js = Path(sys.argv[2])
items = []
for p in sorted(dest.glob("*/*.ogg")):
    items.append({
        "path": f"{p.parent.name}/{p.name}",
        "mime": "audio/ogg",
        "data": base64.b64encode(p.read_bytes()).decode("ascii"),
    })
if not items:
    raise SystemExit("no oggs in " + str(dest))
chunks = [items[i:i+6] for i in range(0, len(items), 6)]
for old in src_js.glob("starter-pack-*.js"):
    old.unlink()
for i, chunk in enumerate(chunks, 1):
    lines = [
        f"/* part {i} of starter kit. packs/starter/CREDITS.md */",
        "window.STARTER_PACK = (window.STARTER_PACK || []).concat([",
    ]
    for j, item in enumerate(chunk):
        comma = "," if j < len(chunk) - 1 else ""
        lines.append(
            f'  {{ path: "{item["path"]}", mime: "{item["mime"]}", data: "{item["data"]}" }}{comma}'
        )
    lines.append("]);")
    out = src_js / f"starter-pack-{i}.js"
    out.write_text("\n".join(lines) + "\n")
    print("wrote", out, "bytes", out.stat().st_size)
print("ok", len(items), "hits ->", len(chunks), "js parts")
PY

echo "rebuild done. next: bash scripts/pack-xdc.sh"
echo "credits: packs/starter/CREDITS.md"
