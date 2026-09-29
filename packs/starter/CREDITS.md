# Starter kit credits

These one-shots are **not** original AETHER-ENGINEERS recordings.
They are a small, recompressed subset of the [Sonic Pi](https://sonic-pi.net/)
bundled sample library, mapped onto Tidal/Strudel drum names (`bd`, `sd`, `hh`, …).

## License of the audio

Sonic Pi documents the files under `etc/samples/` as
**CC0 1.0 Universal** (public domain dedication):

- https://creativecommons.org/publicdomain/zero/1.0/
- https://github.com/sonic-pi-net/sonic-pi/blob/dev/etc/samples/README.md
- https://github.com/sonic-pi-net/sonic-pi/blob/dev/LICENSE.md

CC0 waives copyright. Credit is not legally required. We still name
every source so the chain of custody stays obvious.

Upstream note: Sonic Pi itself is MIT for code. The *audio* in
`etc/samples/` is separately dedicated CC0. Most hits originated on
Freesound and were trimmed for Sonic Pi.

## Mapping (our name → Sonic Pi file → original Freesound where known)

| Kit path | Sonic Pi name | Freesound / donor |
|---|---|---|
| `bd/0.ogg` | `drum_heavy_kick` | Zajo, freesound.org/people/Zajo/sounds/4832/ |
| `bd/1.ogg` | `drum_bass_hard` | menegass, freesound.org/people/menegass/sounds/100051/ |
| `bd/2.ogg` | `drum_bass_soft` | menegass, 100052 |
| `bd/3.ogg` | `bd_haus` | Sonic Pi bundled (CC0; see their README) |
| `bd/4.ogg` | `bd_tek` | Sonic Pi bundled (CC0) |
| `bd/5.ogg` | `bd_808` | Sonic Pi bundled (CC0) |
| `sd/0.ogg` | `drum_snare_hard` | menegass, 100058 |
| `sd/1.ogg` | `drum_snare_soft` | menegass, 100059 |
| `sd/2.ogg` | `elec_snare` | looppool, 13146 |
| `sd/3.ogg` | `sn_dolf` | Sonic Pi bundled (CC0) |
| `hh/0.ogg` | `drum_cymbal_closed` | menegass, 100053 |
| `hh/1.ogg` | `drum_cymbal_pedal` | menegass, 100054 |
| `hh/2.ogg` | `elec_tick` | looppool |
| `oh/0.ogg` | `drum_cymbal_open` | menegass, 100055 |
| `cp/0.ogg` | `perc_snap` | Sonic Pi bundled (CC0) |
| `cp/1.ogg` | `perc_snap2` | Sonic Pi bundled (CC0) |
| `rim/0.ogg` | `elec_blip` | looppool, 13121 |
| `rim/1.ogg` | `elec_blip2` | looppool, 13120 |
| `ht/0.ogg` | `drum_tom_hi_hard` | menegass, 100062 |
| `mt/0.ogg` | `drum_tom_mid_hard` | menegass, 100066 |
| `lt/0.ogg` | `drum_tom_lo_hard` | menegass, 100064 |
| `cr/0.ogg` | `drum_cymbal_hard` | menegass, 100056 |
| `cr/1.ogg` | `drum_splash_hard` | menegass, 100060 |
| `cb/0.ogg` | `drum_cowbell` | Neotone, freesound.org/people/Neotone/sounds/75338/ |

## What we changed

- Downloaded the official `.flac` from `github.com/sonic-pi-net/sonic-pi` branch `dev`, path `etc/samples/`.
- Re-encoded to Ogg Vorbis (`ffmpeg -c:a libvorbis -q:a 4`). No other processing.
- Renamed into Tidal-style folders. `bd:0` is `drum_heavy_kick`, `bd:5` is `bd_808`.

## What we did not bundle

- The rest of Sonic Pi’s library.
- `tidalcycles/Dirt-Samples` (provenance unclear; see tidalcycles/Dirt-Samples#19).
- Anything “free for non-commercial use only.”
