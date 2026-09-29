/* Strudel XDC Phase 0 — transport + local audio probe. */
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

  let audio = null;
  let playing = false;
  let timer = null;
  let evalSeq = 0;
  const Samples = window.StrudelSamples;

  function ensureAudio() {
    if (audio) return audio;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      log("no AudioContext in this webview");
      return null;
    }
    audio = new Ctx();
    return audio;
  }

  function beep(kind, t) {
    const ctx = audio;
    if (!ctx) return;
    const when = t ?? ctx.currentTime;
    if (kind === "bd") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(140, when);
      o.frequency.exponentialRampToValueAtTime(40, when + 0.12);
      g.gain.setValueAtTime(0.9, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(when);
      o.stop(when + 0.2);
    } else if (kind === "sd") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(220, when);
      g.gain.setValueAtTime(0.4, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(when);
      o.stop(when + 0.14);
    } else if (kind === "hh") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 8000;
      g.gain.setValueAtTime(0.05, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
      o.connect(g).connect(ctx.destination);
      o.start(when);
      o.stop(when + 0.05);
    } else if (kind === "saw") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.value = 87.3;
      f.type = "lowpass";
      f.frequency.value = 600;
      g.gain.setValueAtTime(0.15, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
      o.connect(f).connect(g).connect(ctx.destination);
      o.start(when);
      o.stop(when + 0.22);
    }
  }

  function cpm() {
    return Math.max(1, Number($("cpm").value) || 33);
  }

  function stepLoop() {
    if (!playing || !audio) return;
    const beat = 60 / (cpm() * 4);
    const t = audio.currentTime + 0.05;
    const hit = (sound, when, fallback) => {
      Samples.playSample(audio, sound, when, 0).then((ok) => {
        if (!ok) beep(fallback, when);
      });
    };
    hit("bd", t, "bd");
    hit("hh", t, "hh");
    beep("saw", t);
    hit("hh", t + beat, "hh");
    hit("sd", t + beat * 2, "sd");
    hit("hh", t + beat * 2, "hh");
    beep("saw", t + beat * 2);
    hit("hh", t + beat * 3, "hh");
    timer = setTimeout(stepLoop, beat * 4 * 1000);
  }

  async function play() {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
    playing = true;
    $("play").disabled = true;
    $("stop").disabled = false;
    $("status").textContent = (xdc ? "vector" : "solo") + " · playing";
    log("audio armed @ " + ctx.sampleRate + " Hz");
    stepLoop();
    publishDoc();
  }

  function stop() {
    playing = false;
    if (timer) clearTimeout(timer);
    $("play").disabled = false;
    $("stop").disabled = true;
    $("status").textContent = (xdc ? "vector" : "solo") + " · paused";
    publishDoc();
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
    if (typeof doc.code === "string" && doc.code !== $("code").value) $("code").value = doc.code;
    if (typeof doc.cps === "number") $("cpm").value = String(Math.round(doc.cps * 60));
    log("hydrated evalSeq " + doc.evalSeq + " from " + (doc.author || "?"));
  }

  function publishDoc() {
    if (!xdc?.sendUpdate) return;
    const p = payload();
    try {
      xdc.sendUpdate({ payload: p, document: "strudel", summary: playing ? "live" : "paused" }, "");
      log("sendUpdate evalSeq " + p.evalSeq);
    } catch (err) {
      log("sendUpdate failed: " + err);
    }
  }

  function evalToRoom() {
    publishDoc();
    if (xdc?.joinRealtimeChannel) {
      try {
        const ch = xdc.joinRealtimeChannel();
        const msg = new TextEncoder().encode(JSON.stringify({ v: 1, type: "eval", evalSeq, code: $("code").value, cps: cpm() / 60, author: selfAddr }));
        ch.send(msg);
        log("realtime eval sent (" + msg.byteLength + " B)");
      } catch (err) {
        log("realtime unavailable: " + err);
      }
    }
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
      renderBank();
    } catch (err) {
      log("import failed: " + err);
    }
  }

  async function clearBank() {
    await Samples.clear();
    log("imported bank cleared; starter kit kept");
    renderBank();
  }

  $("play").addEventListener("click", play);
  $("stop").addEventListener("click", stop);
  $("eval").addEventListener("click", evalToRoom);
  $("import").addEventListener("click", importPack);
  $("clearbank").addEventListener("click", clearBank);

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
})();
