/* Strudel XDC Phase 1 — vendored @strudel/web + local bank + room doc. */
(() => {
  const $ = (id) => document.getElementById(id);
  const log = (line) => {
    const el = $("log");
    el.textContent = `[${new Date().toISOString().slice(11, 19)}] ${line}\n` + el.textContent;
  };

  const xdc = window.webxdc || null;
  const selfName = xdc?.selfName || "solo";
  const selfAddr = xdc?.selfAddr || "local";
  $("who").textContent = selfName;
  $("status").textContent = xdc ? "vector · waiting for room state" : "solo · no webxdc host";

  const Samples = window.StrudelSamples;
  let playing = false;
  let evalSeq = 0;
  let lastRemoteSeq = 0;
  let ready = null;
  let roomWantsPlay = false;
  let lastPublish = 0;
  let realtime = null;

  function realtimeChannel() {
    if (realtime) return realtime;
    if (!xdc?.joinRealtimeChannel) return null;
    try {
      realtime = xdc.joinRealtimeChannel();
    } catch (err) {
      log("realtime join: " + err);
      return null;
    }
    return realtime;
  }

  function api() {
    return window.strudel || {};
  }

  function registerBank() {
    const S = api();
    if (typeof S.samples !== "function") return 0;
    const map = Samples.strudelMap();
    const n = Object.keys(map).length;
    if (n) S.samples(map);
    return n;
  }

  function ensureStrudel() {
    if (ready) return ready;
    ready = (async () => {
      if (typeof window.initStrudel !== "function") {
        throw new Error("vendored @strudel/web missing (src/vendor/strudel-web.js)");
      }
      await window.initStrudel({
        prebake: async () => {
          const n = registerBank();
          log("prebake bank · " + n + " sounds");
        },
      });
      log("strudel 1.3.0 ready");
    })();
    return ready;
  }

  function setPlaying(on) {
    playing = on;
    $("play").disabled = on;
    $("stop").disabled = !on;
    const host = xdc ? "vector" : "solo";
    $("status").textContent = host + " · " + (on ? "playing" : roomWantsPlay ? "room live — tap play" : "paused");
  }

  async function evalNow(reason) {
    const code = $("code").value;
    await ensureStrudel();
    registerBank();
    const S = api();
    const run = S.evaluate || window.evaluate;
    if (typeof run !== "function") throw new Error("evaluate() not on strudel bundle");
    await run(code);
    setPlaying(true);
    log("eval (" + reason + ")");
  }

  async function play() {
    try {
      await evalNow("play");
      publishDoc();
      pulseRealtime();
    } catch (err) {
      log("play failed: " + err);
      setPlaying(false);
    }
  }

  function stop() {
    try {
      const S = api();
      const hush = S.hush || window.hush;
      if (typeof hush === "function") hush();
    } catch (err) {
      log("hush: " + err);
    }
    roomWantsPlay = false;
    setPlaying(false);
    publishDoc();
  }

  function cpm() {
    return Math.max(1, Number($("cpm").value) || 33);
  }

  function payload() {
    evalSeq += 1;
    return {
      v: 1,
      type: "doc",
      code: $("code").value,
      cps: cpm() / 60,
      playing,
      title: "strudel-xdc",
      evalSeq,
      author: selfAddr,
      pack: Samples.listSounds(),
    };
  }

  function applyDoc(doc) {
    if (!doc || doc.type !== "doc") return;
    if (doc.author === selfAddr && doc.evalSeq && doc.evalSeq <= evalSeq) return;
    if (typeof doc.evalSeq === "number") {
      if (doc.evalSeq <= lastRemoteSeq) return;
      lastRemoteSeq = doc.evalSeq;
      evalSeq = Math.max(evalSeq, doc.evalSeq);
    }
    if (typeof doc.code === "string" && doc.code !== $("code").value) $("code").value = doc.code;
    if (typeof doc.cps === "number") $("cpm").value = String(Math.round(doc.cps * 60));
    roomWantsPlay = !!doc.playing;
    log("hydrated evalSeq " + doc.evalSeq + " from " + (doc.author || "?"));
    if (playing && roomWantsPlay) {
      evalNow("room").catch((err) => log("room eval: " + err));
    } else if (roomWantsPlay && !playing) {
      $("status").textContent = (xdc ? "vector" : "solo") + " · room live — tap play";
    }
  }

  function publishDoc() {
    if (!xdc?.sendUpdate) return;
    const now = Date.now();
    const interval = Number(xdc.sendUpdateInterval) || 0;
    if (interval && now - lastPublish < interval && lastPublish !== 0) {
      log("sendUpdate throttled");
      return;
    }
    const p = payload();
    const update = { payload: p, document: p.title, summary: playing ? "live" : "paused" };
    try {
      const raw = JSON.stringify(update);
      const max = Number(xdc.sendUpdateMaxSize) || 128000;
      if (raw.length > max) {
        log("doc too large for sendUpdate (" + raw.length + " > " + max + ")");
        return;
      }
      xdc.sendUpdate(update, "");
      lastPublish = now;
      log("sendUpdate evalSeq " + p.evalSeq);
    } catch (err) {
      log("sendUpdate failed: " + err);
    }
  }

  function pulseRealtime() {
    const ch = realtimeChannel();
    if (!ch) return;
    try {
      const msg = new TextEncoder().encode(
        JSON.stringify({
          v: 1,
          type: "eval",
          evalSeq,
          code: $("code").value,
          cps: cpm() / 60,
          author: selfAddr,
        })
      );
      ch.send(msg);
      log("realtime eval (" + msg.byteLength + " B)");
    } catch (err) {
      log("realtime unavailable: " + err);
    }
  }

  function evalToRoom() {
    evalNow("room-btn")
      .then(() => {
        publishDoc();
        pulseRealtime();
      })
      .catch((err) => log("eval failed: " + err));
  }

  function renderBank() {
    const names = Samples.listSounds();
    const meta = $("bankmeta");
    const list = $("banklist");
    list.innerHTML = "";
    if (!names.length) {
      meta.textContent = "empty — import a pack";
      return;
    }
    let files = 0;
    for (const n of names) files += Samples.bank.sounds.get(n).files.length;
    meta.textContent = names.length + " sounds / " + files + " files";
    for (const n of names) {
      const li = document.createElement("li");
      const count = Samples.bank.sounds.get(n).files.length;
      li.textContent = n + (count > 1 ? " ×" + count : "");
      list.appendChild(li);
    }
  }

  async function importPack() {
    try {
      const n = xdc?.importFiles ? await Samples.importViaXdc() : await Samples.importViaInput(true);
      log("imported " + n + " audio files");
      if (ready) registerBank();
      renderBank();
    } catch (err) {
      log("import failed: " + err);
    }
  }

  async function clearBank() {
    await Samples.clear();
    if (ready) registerBank();
    log("imported bank cleared; starter kit kept");
    renderBank();
  }

  $("play").addEventListener("click", play);
  $("stop").addEventListener("click", stop);
  $("eval").addEventListener("click", evalToRoom);
  $("import").addEventListener("click", importPack);
  $("clearbank").addEventListener("click", clearBank);
  $("code").addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      evalToRoom();
    }
  });

  const bundled = Samples.loadStarter();
  if (bundled) log("starter kit " + bundled + " files (Sonic Pi CC0)");

  Samples.restoreFromIdb()
    .then((n) => {
      if (n) log("restored " + n + " imported files from IndexedDB");
      renderBank();
    })
    .catch((err) => log("idb: " + err));

  if (xdc?.setUpdateListener) {
    xdc.setUpdateListener((update) => {
      if (update?.payload) applyDoc(update.payload);
    }, 0);
    log("listening for room document");
  } else {
    log("no webxdc — pack as .xdc and open inside Vector");
  }

  {
    const ch = realtimeChannel();
    if (ch && typeof ch.setListener === "function") {
      try {
        ch.setListener((bytes) => {
          try {
            const msg = JSON.parse(new TextDecoder().decode(bytes));
            if (msg?.type === "eval" && msg.author !== selfAddr && typeof msg.code === "string") {
              applyDoc({
                type: "doc",
                code: msg.code,
                cps: msg.cps,
                playing: true,
                evalSeq: msg.evalSeq,
                author: msg.author,
              });
            }
          } catch (_) {}
        });
        log("realtime channel joined");
      } catch (err) {
        log("realtime listen: " + err);
      }
    }
  }
})();
