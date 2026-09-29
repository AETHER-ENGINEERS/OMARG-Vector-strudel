/* Local sample bank. Bytes stay on this device. Never sendUpdate them. */
const AUDIO_EXT = /\.(wav|wave|mp3|ogg|oga|opus|flac|m4a|aac)$/i;
const IDB_NAME = "strudel-xdc-samples";
const IDB_STORE = "files";

const bank = {
  sounds: new Map(),
  decoded: new Map(),
};

function stem(path) {
  const base = path.split("/").pop() || path;
  return base.replace(/\.[^.]+$/, "");
}

function soundNameFromPath(path) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return stem(parts[parts.length - 1] || "sample");
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).openCursor();
    const out = [];
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out);
      out.push({ key: c.key, blob: c.value });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbClear() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function ensureSound(sound, kind) {
  if (!bank.sounds.has(sound)) {
    bank.sounds.set(sound, { name: sound, kind: kind || "hits", files: [], notes: {} });
  }
  const entry = bank.sounds.get(sound);
  if (kind) entry.kind = kind;
  return entry;
}

function addToBank(path, blob) {
  const sound = soundNameFromPath(path);
  const entry = ensureSound(sound, "hits");
  entry.files.push({ name: path, blob });
}

function addPitched(sound, note, path, blob) {
  const entry = ensureSound(sound, "notes");
  entry.notes[note] = { name: path, blob };
  entry.files.push({ name: path, blob, note });
}

function readU32(v, o) {
  return v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24);
}
function readU16(v, o) {
  return v[o] | (v[o + 1] << 8);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("no DecompressionStream — cannot unpack deflated zip entries");
  }
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function unzip(arrayBuffer, onFile) {
  const u8 = new Uint8Array(arrayBuffer);
  let o = 0;
  let n = 0;
  while (o + 30 < u8.length) {
    const sig = readU32(u8, o);
    if (sig !== 0x04034b50) break;
    const method = readU16(u8, o + 8);
    const compSize = readU32(u8, o + 18);
    const nameLen = readU16(u8, o + 26);
    const extraLen = readU16(u8, o + 28);
    const name = new TextDecoder("utf-8").decode(u8.subarray(o + 30, o + 30 + nameLen));
    const dataStart = o + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > u8.length) break;
    if (!name.endsWith("/")) {
      let payload = u8.subarray(dataStart, dataEnd);
      if (method === 8) payload = await inflateRaw(payload);
      else if (method !== 0) {
        o = dataEnd;
        continue;
      }
      await onFile(name, new Blob([payload]));
      n++;
    }
    o = dataEnd;
  }
  return n;
}

async function ingestFile(file, prefix) {
  const name = (prefix ? prefix + "/" : "") + (file.webkitRelativePath || file.name);
  if (name.endsWith(".zip") || file.type === "application/zip") {
    const n = await unzip(await file.arrayBuffer(), async (path, blob) => {
      if (AUDIO_EXT.test(path)) {
        addToBank(path, blob);
        await idbPut(path, blob);
      }
    });
    return n;
  }
  if (AUDIO_EXT.test(name) || (file.type && file.type.startsWith("audio/"))) {
    addToBank(name, file);
    await idbPut(name, file);
    return 1;
  }
  return 0;
}

async function restoreFromIdb() {
  const rows = await idbGetAll().catch(() => []);
  for (const row of rows) {
    if (typeof row.key === "string" && row.blob) addToBank(row.key, row.blob);
  }
  return rows.length;
}

function stockManifest() {
  return window.STOCK_PACK && typeof window.STOCK_PACK === "object" ? window.STOCK_PACK : {};
}

function listSounds() {
  const names = new Set(bank.sounds.keys());
  for (const n of Object.keys(stockManifest())) names.add(n);
  return [...names].sort();
}

function soundCount(name) {
  if (bank.sounds.has(name)) return bank.sounds.get(name).files.length;
  const spec = stockManifest()[name];
  if (!spec) return 0;
  if (spec.kind === "notes") return Object.keys(spec.files || {}).length;
  return (spec.files || []).length;
}

function snippet() {
  const names = listSounds();
  if (!names.length) return "// no local samples yet — Import pack";
  return (
    "samples({\n" +
    names
      .map((n) => {
        const count = soundCount(n);
        const spec = stockManifest()[n];
        if ((spec && spec.kind === "notes") || (bank.sounds.get(n) && bank.sounds.get(n).kind === "notes")) {
          return `  ${JSON.stringify(n)}: /* pitched x${count} */`;
        }
        return `  ${JSON.stringify(n)}: [${Array.from({ length: count }, (_, i) => i).join(", ")}]`;
      })
      .join(",\n") +
    "\n}) // local bank, already loaded\n"
  );
}

async function decodeSound(ctx, sound, index) {
  const entry = bank.sounds.get(sound);
  if (!entry || !entry.files[index]) return null;
  const key = sound + ":" + index;
  if (bank.decoded.has(key)) return bank.decoded.get(key);
  const buf = await entry.files[index].blob.arrayBuffer();
  const audio = await ctx.decodeAudioData(buf.slice(0));
  bank.decoded.set(key, audio);
  return audio;
}

async function playSample(ctx, sound, when, index) {
  const audio = await decodeSound(ctx, sound, index || 0);
  if (!audio) return false;
  const src = ctx.createBufferSource();
  src.buffer = audio;
  src.connect(ctx.destination);
  src.start(when ?? ctx.currentTime);
  return true;
}

async function asFile(f) {
  if (!f) return null;
  if (typeof File !== "undefined" && f instanceof File) return f;
  if (typeof Blob !== "undefined" && f instanceof Blob) {
    return new File([f], f.name || "sample", { type: f.type || "application/octet-stream" });
  }
  if (f.blob) {
    const blob = f.blob;
    return new File([blob], f.name || "sample", { type: blob.type || f.type || "application/octet-stream" });
  }
  if (f.base64) {
    const blob = b64ToBlob(f.base64, f.type || f.mime);
    return new File([blob], f.name || "sample", { type: blob.type });
  }
  return null;
}

async function importFilesList(files) {
  let n = 0;
  for (const raw of files || []) {
    const f = await asFile(raw);
    if (f) n += await ingestFile(f);
  }
  return n;
}

async function importViaXdc() {
  const xdc = window.webxdc;
  if (!xdc?.importFiles) throw new Error("importFiles not on this host");
  const files = await xdc.importFiles({
    multiple: true,
    extensions: [".wav", ".mp3", ".ogg", ".oga", ".opus", ".flac", ".m4a", ".zip"],
  });
  return importFilesList(files);
}

async function importViaInput(multiple) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple !== false;
    input.accept = "audio/*,.wav,.mp3,.ogg,.opus,.flac,.zip";
    input.onchange = async () => {
      try {
        let n = 0;
        for (const f of Array.from(input.files || [])) n += await ingestFile(f);
        resolve(n);
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}

function b64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "audio/ogg" });
}

function loadStarter() {
  const pack = window.STARTER_PACK;
  if (!Array.isArray(pack) || !pack.length) return 0;
  let n = 0;
  for (const item of pack) {
    if (!item || !item.path || !item.data) continue;
    const blob = b64ToBlob(item.data, item.mime);
    addToBank("starter/" + item.path, blob);
    n++;
  }
  return n;
}

const urlCache = new Map();

function revokeUrls() {
  for (const url of urlCache.values()) {
    try { URL.revokeObjectURL(url); } catch (_) {}
  }
  urlCache.clear();
}

function urlFor(path, blob) {
  if (urlCache.has(path)) return urlCache.get(path);
  const url = URL.createObjectURL(blob);
  urlCache.set(path, url);
  return url;
}

function stockUrlMap() {
  const map = {};
  const pack = stockManifest();
  for (const [name, spec] of Object.entries(pack)) {
    const base = spec.base || "";
    if (spec.kind === "notes") {
      const notes = {};
      for (const [note, file] of Object.entries(spec.files || {})) notes[note] = base + file;
      map[name] = notes;
    } else {
      map[name] = (spec.files || []).map((file) => base + file);
    }
  }
  return map;
}

async function fetchBlob(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.blob();
  } catch (_) {
    return null;
  }
}

async function loadStock() {
  const pack = stockManifest();
  const names = Object.keys(pack);
  if (!names.length) return { sounds: 0, files: 0, fetched: 0 };
  let files = 0;
  let fetched = 0;
  for (const [name, spec] of Object.entries(pack)) {
    const base = spec.base || "";
    if (spec.kind === "notes") {
      for (const [note, file] of Object.entries(spec.files || {})) {
        files += 1;
        const path = base + file;
        const blob = await fetchBlob(path);
        if (blob) {
          addPitched(name, note, path, blob);
          fetched += 1;
        }
      }
    } else {
      for (const file of spec.files || []) {
        files += 1;
        const path = base + file;
        const blob = await fetchBlob(path);
        if (blob) {
          addToBank(path, blob);
          fetched += 1;
        }
      }
    }
  }
  return { sounds: names.length, files, fetched };
}

function strudelMap() {
  const map = stockUrlMap();
  for (const [name, entry] of bank.sounds) {
    if (entry.kind === "notes" && entry.notes && Object.keys(entry.notes).length) {
      const notes = {};
      for (const [note, f] of Object.entries(entry.notes)) notes[note] = urlFor(f.name, f.blob);
      map[name] = notes;
    } else {
      map[name] = entry.files.map((f) => urlFor(f.name, f.blob));
    }
  }
  return map;
}

window.StrudelSamples = {
  bank,
  restoreFromIdb,
  loadStarter,
  loadStock,
  stockUrlMap,
  stockManifest,
  soundCount,
  importViaXdc,
  importViaInput,
  importFilesList,
  listSounds,
  snippet,
  playSample,
  decodeSound,
  strudelMap,
  clear: async () => {
    bank.sounds.clear();
    bank.decoded.clear();
    revokeUrls();
    await idbClear();
    loadStarter();
    await loadStock();
  },
};
