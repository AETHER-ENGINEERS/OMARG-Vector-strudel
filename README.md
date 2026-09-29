# OMARG-Vector-strudel

Strudel (JS TidalCycles / SuperDough live-coding DAW) as a [WebxDC](https://webxdc.org) mini-app for [Vector](https://vectorapp.io).

AETHER-ENGINEERS / OMARG port. Drop the built `.xdc` into a Vector chat. Peers tap Start. Each device renders audio locally. Code, evals, sliders, and clock travel through WebxDC.

**Status:** Phase 0 scaffold plus a bundled CC0 starter drum kit. Not a full `@strudel/*` REPL yet.

**License:** AGPL-3.0-or-later for *code*. Bundled starter *audio* is CC0 1.0 from Sonic Pi — see the addendum at the bottom of `LICENSE` and the full map in `packs/starter/CREDITS.md`. The AGPL text was not replaced. The CC0 hits do not become AGPL.

Repo: https://github.com/AETHER-ENGINEERS/OMARG-Vector-strudel

---

## Starter kit

24 one-shots, Tidal names: `bd` `sd` `hh` `oh` `cp` `rim` `ht` `mt` `lt` `cr` `cb`.

Source: [Sonic Pi `etc/samples`](https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples), CC0 1.0. Dirt-Samples was not used (unclear provenance).

Play works with no import once the kit is built in. Extra kits still come through **Import pack** (`webxdc.importFiles`) and live in IndexedDB on that device.

Generate / refresh the inlined kit (needs `curl`, `ffmpeg`, `python3`):

```sh
bash scripts/rebuild-starter.sh   # downloads Sonic Pi flacs, writes ogg + src/starter-pack-*.js
bash scripts/pack-xdc.sh          # writes ./strudel.xdc — attach in Vector
```

Do not zip `webxdc.js`. The host injects it.

---

## Architecture

Audio stays on-device. Chat carries code and clock, never wav bytes.

| Channel | API | Use |
|---|---|---|
| Durable | `sendUpdate` | Pattern document, play/stop, pack *names*. |
| Ephemeral | `joinRealtimeChannel` | Eval pulses, sliders, cycle origin. |
| Bundled kit | `starter-pack-*.js` | CC0 Sonic Pi subset. |
| Extra kits | `importFiles` + IndexedDB | User-downloaded zips. |

---

## Phases

0. Stub editor + Web Audio + starter kit + importFiles — current
1. Bundle `@strudel/web` + SuperDough from https://codeberg.org/uzu/strudel
2. Room session: durable doc + realtime eval + shared clock
3. Vendor Switch Angel prebake
4. Vector Nexus listing

Upstream: [uzu/strudel](https://codeberg.org/uzu/strudel) · [switchangel/strudel-scripts](https://github.com/switchangel/strudel-scripts) · [webxdc](https://webxdc.org/docs/) · [Vector webxdc-realtime](https://github.com/VectorPrivacy/Vector/blob/master/docs/webxdc-realtime.md)
