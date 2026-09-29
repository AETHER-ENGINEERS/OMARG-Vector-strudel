# OMARG-Vector-strudel

Strudel (JS TidalCycles / SuperDough live-coding DAW) as a [WebxDC](https://webxdc.org) mini-app for [Vector](https://vectorapp.io).

AETHER-ENGINEERS / OMARG port. Drop the built `.xdc` into a Vector chat. Peers tap Start. Each device renders audio locally. Code, evals, sliders, and clock travel through WebxDC.

**Status:** Phase 1 drop-in. Vendored `@strudel/web` 1.3.0 + CC0 starter drum kit. Ready for a live YouTube test in Vector.

**License:** AGPL-3.0-or-later for *code*. Bundled starter *audio* is CC0 1.0 from Sonic Pi — see the addendum at the bottom of `LICENSE` and the full map in `packs/starter/CREDITS.md`. The AGPL text was not replaced. The CC0 hits do not become AGPL.

Repo: https://github.com/AETHER-ENGINEERS/OMARG-Vector-strudel

---

## Drop-in

The packaged `strudel.xdc` is ~300 KB (well under the 50 MB cap). Attach it in a Vector chat.

```sh
bash scripts/rebuild-starter.sh   # once: Sonic Pi flacs → ogg + src/starter-pack-*.js
bash scripts/pack-xdc.sh          # fetches @strudel/web if needed, writes ./strudel.xdc
```

Do not zip `webxdc.js`. The host injects it.

Play / Eval runs real Strudel `evaluate()` against SuperDough. The starter kit is already mapped as `bd sd hh oh cp rim ht mt lt cr cb`. Extra kits still come through **Import pack** (`webxdc.importFiles`) and live in IndexedDB on that device. Ctrl/Cmd+Enter evals.

First tap on **Play** is the user gesture that arms Web Audio. Room peers who join later see the shared document and tap Play on their side (autoplay policy).

---

## Starter kit

24 one-shots, Tidal names: `bd` `sd` `hh` `oh` `cp` `rim` `ht` `mt` `lt` `cr` `cb`.

Source: [Sonic Pi `etc/samples`](https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples), CC0 1.0. Dirt-Samples was not used (unclear provenance).

---

## Architecture

Audio stays on-device. Chat carries code and clock, never wav bytes. No CDN at runtime — WebxDC is network-isolated, so `@strudel/web` is vendored at pack time (`scripts/vendor-strudel.sh`).

| Channel | API | Use |
|---|---|---|
| Durable | `sendUpdate` | Pattern document, play/stop, pack *names*. |
| Ephemeral | `joinRealtimeChannel` | Eval pulses, sliders, cycle origin. |
| Bundled kit | `starter-pack-*.js` | CC0 Sonic Pi subset, registered as blob URLs. |
| Extra kits | `importFiles` + IndexedDB | User-downloaded zips. |

---

## Phases

0. Stub editor + Web Audio + starter kit + importFiles — done
1. Bundle `@strudel/web` + SuperDough + room doc — current
2. Shared clock + sliders + conductor lock
3. Vendor Switch Angel prebake
4. Vector Nexus listing

Sibling repos can hold larger / smaller kits. This tree stays ≤ 50 MB packed.

Upstream: [uzu/strudel](https://codeberg.org/uzu/strudel) · [switchangel/strudel-scripts](https://github.com/switchangel/strudel-scripts) · [webxdc](https://webxdc.org/docs/) · [Vector webxdc-realtime](https://github.com/VectorPrivacy/Vector/blob/master/docs/webxdc-realtime.md)
