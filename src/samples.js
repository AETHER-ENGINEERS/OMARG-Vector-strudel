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

function addToBank(path, blob) {
  const sound = soundNameFromPath(path);
  if (!bank.sounds.has(sound)) bank.sounds.set(sound, { name: sound, files: [] });
  bank.sounds.get(sound).files.push({ name: path, blob });
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
  bank.sounds.clear();
  bank.decoded.clear();
  const rows = await idbGetAll().catch(() => []);
  for (const row of rows) {
    if (typeof row.key === "string" && row.blob) addToBank(row.key, row.blob);
  }
  return rows.length;
}

function listSounds() {
  return [...bank.sounds.keys()].sort();
}

function snippet() {
  const names = listSounds();
  if (!names.length) return "// no local samples yet — Import pack";
  return (
    "samples({\n" +
    names
      .map((n) => {
        const count = bank.sounds.get(n).files.length;
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
  const audioBuf = await ctx.decodeAudioData(buf.slice(0));
  bank.decoded.set(key, audioBuf);
  return audioBuf;
}

async function playSample(ctx, sound, when, index) {
  const audioBuf = await decodeSound(ctx, sound, index || 0);
  if (!audioBuf) return false;
  const src = ctx.createBufferSource();
  src.buffer = audioBuf;
  src.connect(ctx.destination);
  src.start(when ?? ctx.currentTime);
  return true;
}

async function importViaXdc() {
  const xdc = window.webxdc;
  if (!xdc?.importFiles) throw new Error("importFiles not on this host");
  const files = await xdc.importFiles({
    multiple: true,
    mimeTypes: [
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/mpeg",
      "audio/ogg",
      "audio/flac",
      "audio/mp4",
      "application/zip",
    ],
    extensions: [".wav", ".mp3", ".ogg", ".oga", ".opus", ".flac", ".m4a", ".zip"],
  });
  let n = 0;
  for (const f of files || []) n += await ingestFile(f);
  return n;
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

window.StrudelSamples = {
  bank,
  restoreFromIdb,
  importViaXdc,
  importViaInput,
  listSounds,
  snippet,
  playSample,
  decodeSound,
  clear: async () => {
    bank.sounds.clear();
    bank.decoded.clear();
    await idbClear();
  },
};
