/* Strudel XDC Phase 1.1 — hot-swap eval + live typing, no scheduler restart. */
(() => {
  const $ = (id) => document.getElementById(id);
  const log = (line) => {
    const el = $("log");
    el.textContent = `[${new Date().toISOString().slice(11, 19)}] ${line}\n` + el.textContent;
  };

  (function patchWorklets() {
    const proto = window.AudioWorklet && window.AudioWorklet.prototype;
    if (proto && !proto.__xdcPatch) {
      const orig = proto.addModule;
      proto.addModule = async function (url) {
        try {
          return await orig.call(this, url);
        } catch (err) {
          if (typeof url === "string" && url.startsWith("data:")) {
            const cut = url.indexOf(",");
            const body = url.slice(cut + 1);
            const src = /base64/i.test(url.slice(0, cut)) ? atob(body) : decodeURIComponent(body);
            const blobUrl = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
            return orig.call(this, blobUrl);
          }
          throw err;
        }
      };
      proto.__xdcPatch = true;
    }
    const Orig = window.AudioWorkletNode;
    if (Orig && !Orig.__xdcPatch) {
      function FallbackNode(ctx) {
        const g = ctx.createGain();
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.connect(g);
        try { osc.start(); } catch (_) {}
        const dummy = ctx.createGain().gain;
        g.parameters = { get: () => dummy };
        g.port = { postMessage() {}, addEventListener() {}, onmessage: null };
        return g;
      }
      function SafeWorklet(ctx, name, opts) {
        try {
          return new Orig(ctx, name, opts);
        } catch (err) {
          log("worklet fallback · " + name);
          return FallbackNode(ctx);
        }
      }
      SafeWorklet.prototype = Orig.prototype;
      SafeWorklet.__xdcPatch = true;
      window.AudioWorkletNode = SafeWorklet;
    }
  })();

  const xdc = window.webxdc || null;
  const selfName = xdc?.selfName || "solo";
  const selfAddr = xdc?.selfAddr || "local";
  $("who").textContent = selfName;
  $("status").textContent = xdc ? "vector · waiting for room state" : "solo · no webxdc host";

  const Samples = window.StrudelSamples;
  let playing = false;
  let evalSeq = 0;
  let lastRemoteSeq = 0;
  const remoteSeqByAuthor = Object.create(null);
  let ready = null;
  let repl = null;
  let roomWantsPlay = false;
  let lastPublish = 0;
  let lastRealtime = 0;
  let realtime = null;
  let lastEvalCode = "";
  let liveTimer = 0;
  let applyingRemote = false;
  let evalInFlight = false;
  let hiRaf = 0;
  let audioArmed = false;
  let followJam = false;

  function realtimeChannel() {
    if (realtime) return realtime;
    if (!xdc?.joinRealtimeChannel) return null;
    try { realtime = xdc.joinRealtimeChannel(); }
    catch (err) { log("realtime join: " + err); return null; }
    return realtime;
  }

  function api() { return window.strudel || {}; }

  function installSliderFns() {
    const S = api();
    const values = window.__sliderValues || (window.__sliderValues = {});
    const sliderWithID = (id, value) => {
      if (value !== undefined) values[id] = value;
      return values[id];
    };
    const slider = (value) => value;
    window.sliderWithID = sliderWithID;
    window.slider = slider;
    try { if (typeof S.evalScope === "function") S.evalScope({ sliderWithID, slider }); } catch (_) {}
  }

  function registerBank() {
    const S = api();
    if (typeof S.samples !== "function") return 0;
    const map = Samples.strudelMap();
    const n = Object.keys(map).length;
    if (n) S.samples(map);
    return n;
  }

  function showErr(msg) {
    const el = $("err");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
  }

  function flashEditor() {
    const el = $("code");
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 180);
  }

  function liveOn() { return !!$("live")?.checked; }

  function doughCtx() {
    const S = api();
    try {
      if (typeof S.getAudioContext === "function") {
        const ctx = S.getAudioContext();
        if (ctx) return ctx;
      }
    } catch (_) {}
    return null;
  }

  function unlockAudioSync(beep) {
    const S = api();
    let ctx = doughCtx();
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { log("no AudioContext in this webview"); return null; }
      ctx = new AC();
      if (typeof S.setAudioContext === "function") S.setAudioContext(ctx);
    }
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch((err) => log("resume: " + err));
    } catch (err) { log("resume threw: " + err); }
    if (beep) {
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.12;
        osc.frequency.value = 523.25;
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
        log("beep " + ctx.state);
      } catch (err) { log("beep failed: " + err); }
    }
    audioArmed = ctx.state === "running";
    log("audio ctx " + ctx.state + " @ " + (ctx.sampleRate || "?"));
    return ctx;
  }

  async function armAudio() {
    unlockAudioSync(false);
    const S = api();
    try {
      if (typeof S.initAudio === "function") await S.initAudio({ disableWorklets: false });
    } catch (err) { log("initAudio: " + err); }
    const ctx = doughCtx();
    if (ctx && ctx.state !== "running") {
      try { await ctx.resume(); } catch (err) { log("audio resume: " + err); }
    }
    audioArmed = !!(ctx && ctx.state === "running");
    if (ctx) log("audio ctx " + ctx.state + " @ " + ctx.sampleRate);
    return audioArmed;
  }

  function ensureStrudel() {
    if (ready) return ready;
    ready = (async () => {
      if (typeof window.initStrudel !== "function") {
        throw new Error("vendored @strudel/web missing (src/vendor/strudel-web.js)");
      }
      const done = window.initStrudel({
        prebake: async () => {
          const n = registerBank();
          log("prebake bank · " + n + " sounds");
        },
      });
      repl = await done;
      installSliderFns();
      log("strudel 1.3.0 ready · hot-swap on");
    })();
    return ready;
  }

  function setPlaying(on) {
    playing = on;
    $("play").disabled = on;
    $("stop").disabled = !on;
    const host = xdc ? "vector" : "solo";
    const live = liveOn() ? " · live" : "";
    $("status").textContent =
      host + " · " + (on ? "playing" + live : roomWantsPlay ? "room live — tap play" : "paused");
  }

  function runner() {
    if (repl && typeof repl.evaluate === "function") return (code) => repl.evaluate(code, true, false);
    const S = api();
    const run = S.evaluate || window.evaluate;
    if (typeof run === "function") return (code) => run(code, true);
    return null;
  }

  async function evalNow(reason) {
    const code = $("code").value;
    if (reason === "live" && code === lastEvalCode) return;
    await ensureStrudel();
    installSliderFns();
    registerBank();
    const run = runner();
    if (!run) throw new Error("evaluate() not on strudel bundle");
    if (evalInFlight) return;
    evalInFlight = true;
    try {
      await run(code);
      if (repl && repl.state && repl.state.evalError) throw repl.state.evalError;
      lastEvalCode = code;
      setPlaying(true);
      showErr("");
      if (reason !== "live") flashEditor();
      log("eval (" + reason + ")");
      renderSliders(code);
      paintHighlights();
      startHighlightLoop();
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      showErr(msg);
      log("eval error: " + msg);
      throw err;
    } finally {
      evalInFlight = false;
    }
  }

  function scheduleLiveEval() {
    if (applyingRemote) return;
    if (!playing || !liveOn()) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      evalNow("live").then(() => pulseRealtime(true)).catch(() => {});
    }, 220);
  }

  function offsetOf(loc) {
    if (loc == null) return null;
    if (typeof loc === "number" && Number.isFinite(loc)) return loc;
    if (Array.isArray(loc)) {
      const n = loc[2] ?? loc[1];
      return typeof n === "number" ? n : null;
    }
    if (typeof loc === "object") {
      if (typeof loc.offset === "number") return loc.offset;
      if (typeof loc.start === "number") return loc.start;
    }
    return null;
  }

  function hapRanges(hap) {
    const ctx = (hap && hap.context) || (hap && hap.value && hap.value.context) || {};
    const locs = ctx.locations || hap.locations || [];
    const out = [];
    for (const loc of locs) {
      if (!loc) continue;
      const a = offsetOf(loc.start != null ? loc.start : loc);
      const b = offsetOf(loc.end != null ? loc.end : null);
      if (a != null && b != null && b > a) out.push([a, b]);
    }
    return out;
  }

  function activeRanges() {
    if (!repl || !playing) return [];
    const pattern = repl.state && repl.state.pattern;
    const sched = repl.scheduler;
    if (!pattern || !sched || typeof pattern.queryArc !== "function") return [];
    try {
      const t = sched.now();
      const haps = pattern.queryArc(Math.max(0, t - 0.02), t + 0.08);
      const ranges = [];
      for (const hap of haps) {
        if (hap && typeof hap.isActive === "function" && !hap.isActive(t)) continue;
        ranges.push.apply(ranges, hapRanges(hap));
      }
      return ranges.sort((a, b) => a[0] - b[0]);
    } catch (_) { return []; }
  }

  function mergeRanges(ranges) {
    if (!ranges.length) return [];
    const out = [];
    let [a, b] = ranges[0];
    for (let i = 1; i < ranges.length; i++) {
      const [c, d] = ranges[i];
      if (c <= b) b = Math.max(b, d);
      else { out.push([a, b]); a = c; b = d; }
    }
    out.push([a, b]);
    return out;
  }

  function esc(s) {
    return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
  }

  function paintHighlights() {
    const hi = $("codehi");
    const el = $("code");
    if (!hi || !el) return;
    const code = el.value;
    const ranges = mergeRanges(activeRanges()).filter(([a, b]) => a >= 0 && b <= code.length);
    if (!ranges.length) {
      hi.textContent = code + "\n";
      hi.scrollTop = el.scrollTop;
      hi.scrollLeft = el.scrollLeft;
      return;
    }
    let html = "";
    let i = 0;
    for (const [a, b] of ranges) {
      if (a > i) html += esc(code.slice(i, a));
      html += '<mark class="hap">' + esc(code.slice(a, b)) + "</mark>";
      i = b;
    }
    if (i < code.length) html += esc(code.slice(i));
    hi.innerHTML = html + "\n";
    hi.scrollTop = el.scrollTop;
    hi.scrollLeft = el.scrollLeft;
  }

  function startHighlightLoop() {
    if (hiRaf) return;
    const tick = () => {
      hiRaf = 0;
      paintHighlights();
      if (playing) hiRaf = requestAnimationFrame(tick);
    };
    hiRaf = requestAnimationFrame(tick);
  }

  function stopHighlightLoop() {
    if (hiRaf) cancelAnimationFrame(hiRaf);
    hiRaf = 0;
    paintHighlights();
  }

  async function play() {
    followJam = true;
    try {
      await armAudio();
      await evalNow("play");
      publishDoc();
      pulseRealtime(false);
    } catch (err) {
      log("play failed: " + err);
      setPlaying(false);
    }
  }

  function stop() {
    clearTimeout(liveTimer);
    try {
      if (repl && typeof repl.stop === "function") repl.stop();
      else {
        const S = api();
        const hush = S.hush || window.hush;
        if (typeof hush === "function") hush();
      }
    } catch (err) { log("hush: " + err); }
    roomWantsPlay = false;
    followJam = false;
    lastEvalCode = "";
    setPlaying(false);
    stopHighlightLoop();
    publishDoc();
  }

  function cpm() { return Math.max(1, Number($("cpm").value) || 33); }

  function payload() {
    evalSeq += 1;
    return {
      v: 1, type: "doc", code: $("code").value, cps: cpm() / 60,
      playing, title: "strudel-xdc", evalSeq, author: selfAddr, pack: Samples.listSounds(),
    };
  }

  function applyDoc(doc) {
    if (!doc || doc.type !== "doc") return;
    if (doc.author && doc.author === selfAddr) return;
    if (doc.author && typeof doc.evalSeq === "number") {
      const prev = remoteSeqByAuthor[doc.author] || 0;
      if (doc.evalSeq <= prev) return;
      remoteSeqByAuthor[doc.author] = doc.evalSeq;
      lastRemoteSeq = Math.max(lastRemoteSeq, doc.evalSeq);
    }
    applyingRemote = true;
    try {
      if (typeof doc.code === "string" && doc.code !== $("code").value) {
        $("code").value = doc.code;
        paintHighlights();
        renderSliders(doc.code);
      }
      if (typeof doc.cps === "number") $("cpm").value = String(Math.round(doc.cps * 60));
      roomWantsPlay = doc.playing !== false;
      log("room code from " + (doc.author || "?") + " evalSeq " + doc.evalSeq);
      if (roomWantsPlay && (playing || followJam)) {
        evalNow("room").catch((err) => log("room eval: " + err));
      } else if (roomWantsPlay) {
        $("status").textContent = (xdc ? "vector" : "solo") + " · room live — tap Play once to join";
      }
    } finally { applyingRemote = false; }
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
      if (raw.length > max) { log("doc too large for sendUpdate (" + raw.length + " > " + max + ")"); return; }
      xdc.sendUpdate(update, "");
      lastPublish = now;
      log("sendUpdate evalSeq " + p.evalSeq);
    } catch (err) { log("sendUpdate failed: " + err); }
  }

  function pulseRealtime(throttled) {
    const ch = realtimeChannel();
    if (!ch) return;
    const now = Date.now();
    if (throttled && now - lastRealtime < 400) return;
    try {
      const msg = new TextEncoder().encode(JSON.stringify({
        v: 1, type: "eval", evalSeq, code: $("code").value, cps: cpm() / 60, author: selfAddr,
      }));
      ch.send(msg);
      lastRealtime = now;
      log("realtime eval (" + msg.byteLength + " B)");
    } catch (err) { log("realtime unavailable: " + err); }
  }

  function evalToRoom() {
    evalNow("room-btn").then(() => { publishDoc(); pulseRealtime(false); }).catch((err) => log("eval failed: " + err));
  }

  const SLIDER_RE = /\bslider\(\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+))?\s*(?:,\s*(-?[\d.]+))?\s*(?:,\s*(-?[\d.]+))?\s*\)/g;

  function parseSliders(code) {
    const out = [];
    SLIDER_RE.lastIndex = 0;
    let m;
    while ((m = SLIDER_RE.exec(code))) {
      const value = Number(m[1]);
      const min = m[2] === undefined ? 0 : Number(m[2]);
      const max = m[3] === undefined ? 1 : Number(m[3]);
      const step = m[4] === undefined ? (max - min) / 1000 : Number(m[4]);
      out.push({ index: m.index, length: m[0].length, raw: m[0], value, min, max, step });
    }
    return out;
  }

  function renderSliders(code) {
    const host = $("sliders");
    if (!host) return;
    const found = parseSliders(code);
    host.hidden = found.length === 0;
    if (!found.length) { host.innerHTML = ""; return; }
    const same =
      host.dataset.sig === found.map((s) => s.min + ":" + s.max + ":" + s.step).join("|") &&
      host.children.length === found.length;
    if (same) {
      Array.from(host.querySelectorAll("input[type=range]")).forEach((input, i) => {
        if (document.activeElement !== input) {
          input.value = String(found[i].value);
          const lab = input.parentElement.querySelector(".sliderval");
          if (lab) lab.textContent = formatSlider(found[i].value);
        }
      });
      return;
    }
    host.dataset.sig = found.map((s) => s.min + ":" + s.max + ":" + s.step).join("|");
    host.innerHTML = "";
    found.forEach((s, i) => {
      const row = document.createElement("label");
      row.className = "slider-row";
      const name = document.createElement("span");
      name.className = "slidername";
      name.textContent = "s" + i;
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(s.value);
      const val = document.createElement("span");
      val.className = "sliderval";
      val.textContent = formatSlider(s.value);
      input.addEventListener("input", () => {
        val.textContent = formatSlider(Number(input.value));
        rewriteSlider(i, Number(input.value));
      });
      row.appendChild(name);
      row.appendChild(input);
      row.appendChild(val);
      host.appendChild(row);
    });
  }

  function formatSlider(n) {
    if (!Number.isFinite(n)) return String(n);
    const a = Math.abs(n);
    if (a >= 100) return String(Math.round(n));
    if (a >= 10) return n.toFixed(1);
    return String(parseFloat(n.toFixed(3)));
  }

  function rewriteSlider(index, value) {
    const el = $("code");
    const code = el.value;
    const found = parseSliders(code);
    const s = found[index];
    if (!s) return;
    const next = formatSlider(value);
    const rebuilt = s.raw.replace(/slider\(\s*-?[\d.]+/, "slider(" + next);
    const start = s.index;
    applyingRemote = true;
    const sel = el.selectionStart;
    el.value = code.slice(0, start) + rebuilt + code.slice(start + s.length);
    try { el.selectionStart = el.selectionEnd = sel; } catch (_) {}
    applyingRemote = false;
    evalNow("slider").then(() => pulseRealtime(true)).catch(() => {});
  }

  function renderBank() {
    const names = Samples.listSounds();
    const meta = $("bankmeta");
    const list = $("banklist");
    list.innerHTML = "";
    if (!names.length) { meta.textContent = "empty — import a pack"; return; }
    let files = 0;
    for (const n of names) files += Samples.soundCount(n);
    meta.textContent = names.length + " sounds / " + files + " files";
    for (const n of names) {
      const li = document.createElement("li");
      const count = Samples.soundCount(n);
      const spec = Samples.stockManifest()[n];
      const pitched = spec && spec.kind === "notes";
      const inBank = Samples.bank.sounds.has(n);
      li.textContent = n + (count > 1 ? " ×" + count : "") + (pitched ? " ♪" : "") + (!inBank && spec ? " (zip)" : "");
      list.appendChild(li);
    }
  }

  async function ingestPicked(files, source) {
    const list = files && files.length != null ? files : [];
    log(source + " picked " + list.length);
    const n = await Samples.importFilesList(list);
    log("imported " + n + " audio files via " + source);
    if (ready) registerBank();
    renderBank();
  }

  async function importFromChat() {
    log("importFiles present: " + typeof xdc?.importFiles);
    try {
      if (!xdc?.importFiles) throw new Error("importFiles not on this host");
      const files = await xdc.importFiles({ multiple: true });
      await ingestPicked(files, "chat");
    } catch (err) { log("chat import failed: " + err); }
  }

  async function clearBank() {
    await Samples.clear();
    if (ready) registerBank();
    log("imported bank cleared; starter + stock kept");
    renderBank();
  }

  function onPlayGesture() {
    unlockAudioSync(true);
    play();
  }
  $("play").addEventListener("pointerdown", () => unlockAudioSync(false));
  $("play").addEventListener("click", onPlayGesture);
  $("stop").addEventListener("click", stop);
  $("eval").addEventListener("click", evalToRoom);
  $("importfile").addEventListener("change", (ev) => {
    ingestPicked(ev.target.files, "file").catch((err) => log("file import: " + err));
    ev.target.value = "";
  });
  if (xdc?.importFiles) {
    $("importchat").hidden = false;
    $("importchat").addEventListener("click", importFromChat);
  }
  $("clearbank").addEventListener("click", clearBank);
  $("live").addEventListener("change", () => {
    setPlaying(playing);
    if (playing && liveOn()) scheduleLiveEval();
  });
  $("code").addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") { ev.preventDefault(); evalToRoom(); }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === ".") { ev.preventDefault(); stop(); }
  });
  $("code").addEventListener("input", () => {
    renderSliders($("code").value);
    paintHighlights();
    scheduleLiveEval();
  });
  $("code").addEventListener("scroll", () => {
    const hi = $("codehi");
    if (!hi) return;
    hi.scrollTop = $("code").scrollTop;
    hi.scrollLeft = $("code").scrollLeft;
  });

  paintHighlights();
  ensureStrudel().catch((err) => log("init: " + err));
  document.addEventListener("strudel.log", (ev) => {
    const d = ev.detail || {};
    if (d.message) log(String(d.message));
  });
  log("host importFiles=" + typeof xdc?.importFiles);

  const bundled = Samples.loadStarter();
  if (bundled) log("starter kit " + bundled + " files (Sonic Pi CC0)");

  Samples.loadStock()
    .then((info) => {
      log("stock instruments " + info.sounds + " sounds / " + info.fetched + " fetched of " + info.files + " (piano + VCSL)");
      if (ready) registerBank();
      renderBank();
    })
    .catch((err) => log("stock: " + err));

  Samples.restoreFromIdb()
    .then((n) => {
      if (n) log("restored " + n + " imported files from IndexedDB");
      renderBank();
    })
    .catch((err) => log("idb: " + err));

  renderSliders($("code").value);

  if (xdc?.setUpdateListener) {
    xdc.setUpdateListener((update) => { if (update?.payload) applyDoc(update.payload); }, 0);
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
              applyDoc({ type: "doc", code: msg.code, cps: msg.cps, playing: true, evalSeq: msg.evalSeq, author: msg.author });
            }
          } catch (_) {}
        });
        log("realtime channel joined");
      } catch (err) { log("realtime listen: " + err); }
    }
  }
})();
