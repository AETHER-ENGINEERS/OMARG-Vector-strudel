# Strudel XDC protocol

All payloads are JSON. `v` is the schema version. Bump `v` when fields change meaning.

## Durable — `webxdc.sendUpdate`

```json
{
  "v": 1,
  "type": "doc",
  "code": "setcpm(132/4)\n$: s(\"bd\")",
  "cps": 0.55,
  "playing": true,
  "title": "guild-jam",
  "evalSeq": 12,
  "author": "webxdc-selfAddr",
  "pack": ["bd", "sd", "hh"]
}
```

- Write on eval and on play/stop, not on every keystroke.
- Respect `webxdc.sendUpdateInterval` (assume 10 s if missing).
- If `JSON.stringify(update).length > webxdc.sendUpdateMaxSize` (assume 128000), split into `docPart` chunks keyed by `evalSeq`.

Chrome: `document` = title, `summary` = live/paused. Do not spam `info`.

## Ephemeral — `joinRealtimeChannel().send(Uint8Array)`

```json
{ "v": 1, "type": "eval", "evalSeq": 12, "code": "...", "cps": 0.55, "author": "..." }
{ "v": 1, "type": "clock", "t0": 1759160000000, "cps": 0.55, "cycle": 48 }
{ "v": 1, "type": "slider", "id": "s0", "value": 0.552, "author": "..." }
{ "v": 1, "type": "presence", "name": "…", "role": "conductor|peer" }
```

Realtime is lossy. Durable `doc` is the late-join snapshot.

## Samples

Never put wav bytes on the wire. Each device runs:

```js
webxdc.importFiles({
  multiple: true,
  mimeTypes: ["audio/wav", "audio/mpeg", "audio/ogg", "audio/flac", "application/zip"],
  extensions: [".wav", ".mp3", ".ogg", ".opus", ".flac", ".zip"]
})
```

A downloaded `dirt-samples` zip unpacks in-app: `bd/BT0AADA.wav` → `s("bd")`. Bytes stay in IndexedDB on that device.
