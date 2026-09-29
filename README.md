# OMARG-Vector-strudel

Strudel (JS TidalCycles / SuperDough live-coding DAW) as a [WebxDC](https://webxdc.org) mini-app for [Vector](https://vectorapp.io).

AETHER-ENGINEERS / OMARG port. Drop the built `.xdc` into a Vector chat. Peers tap Start. Each device renders audio locally. Code, evals, sliders, and clock travel through WebxDC.

**Status:** Phase 0 scaffold. Not a full `@strudel/*` REPL bundle yet.

**License:** AGPL-3.0-or-later (forced by Strudel). Source ships with the `.xdc` via `source_code_url` in `manifest.toml`.

Repo: https://github.com/AETHER-ENGINEERS/OMARG-Vector-strudel

---

## Why this shape

WebxDC mini-apps:

- are a zip named `.xdc` containing at least `index.html`
- run in a **network-isolated** webview (no `fetch`, no GitHub sample URLs)
- sync durable state with `webxdc.sendUpdate` / `setUpdateListener`
- sync ephemeral state with `webxdc.joinRealtimeChannel()` (Vector uses Iroh gossip; compatible with Delta Chat)
- pick local files via `webxdc.importFiles()`
- get Web Audio if the host webview exposes it (Vector already ships DOOM this way)

Strudel as used by Switch Angel loads drums with `github:tidalcycles/dirt-samples`. That URL is dead inside the sandbox. The human downloads the kit; **Import pack** feeds it through Vector's picker (same path as GGUF mini-apps).

---

## Architecture

Audio stays on-device. Chat carries code and clock, never wav bytes.

| Channel | API | Use |
|---|---|---|
| Durable | `sendUpdate` | Pattern document, play/stop, pack *names*. ~10s interval, ~128 KB max. |
| Ephemeral | `joinRealtimeChannel` | Eval pulses, sliders, cycle origin. |
| Local bank | `importFiles` + IndexedDB | wav/mp3/ogg/flac or a GitHub zip. Folder name = sound (`bd/x.wav` → `s("bd")`). |

Synth-only Play works with no pack. Missing sample names fall back to a stub oscillator.

---

## Build the `.xdc`

```sh
bash scripts/pack-xdc.sh
# writes ./strudel.xdc — attach in Vector
```

Do not zip `webxdc.js`. The host injects it.

1. Attach `strudel.xdc` in a Vector chat and Start.
2. Tap Play — confirm AudioContext resumes.
3. Download [dirt-samples](https://github.com/tidalcycles/dirt-samples) as a zip (or any kit), tap **Import pack**.
4. Send the same zip in the chat so other peers can import it too.

---

## Phases

0. Stub editor + Web Audio + importFiles bank — this commit
1. Bundle `@strudel/web` + SuperDough from https://codeberg.org/uzu/strudel
2. Room session: durable doc + realtime eval + shared clock
3. Vendor Switch Angel prebake (`acidenv`, `rlpf`, duck helpers)
4. Vector Nexus listing. Same `.xdc` should start on Delta Chat.

---

## Layout

```
src/                 Phase 0 UI + transport + sample bank
scripts/pack-xdc.sh  zip src → strudel.xdc
docs/PROTOCOL.md     update + realtime schema
packs/               reserved for optional starter kits
```

Upstream:

- https://codeberg.org/uzu/strudel
- https://github.com/switchangel/strudel-scripts
- https://webxdc.org/docs/
- https://github.com/VectorPrivacy/Vector/blob/master/docs/webxdc-realtime.md
