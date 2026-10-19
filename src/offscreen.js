// Offscreen document: owns the TTS worker and audio playback for the active reading session.
// Sentences are generated a few steps ahead of playback so speech flows without gaps.

const PREFETCH = 3;

const worker = new Worker(new URL("./tts-worker.js", import.meta.url), { type: "module" });

let ctx = null;
let session = null; // { tabId, chunks, index, voice, speed, engine, epoch, cache, playing, paused, source }
let modelReady = false;
let device = null;
let downloadProgress = null;

let nextRequestId = 1;
const pending = new Map(); // requestId -> { resolve, reject }
let generating = false;

worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "progress") {
    downloadProgress = msg.total ? msg.loaded / msg.total : null;
    broadcast();
  } else if (msg.type === "ready") {
    modelReady = true;
    device = msg.device;
    downloadProgress = null;
    broadcast();
  } else if (msg.type === "audio") {
    pending.get(msg.id)?.resolve(msg);
    pending.delete(msg.id);
  } else if (msg.type === "error") {
    if (pending.has(msg.id)) {
      pending.get(msg.id).reject(new Error(msg.message));
      pending.delete(msg.id);
    } else if (session) {
      fail(msg.message);
    }
  }
};

function requestAudio(text, voice, speed, engine) {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: "generate", id, text, voice, speed, engine });
  });
}

function getContext() {
  if (!ctx) ctx = new AudioContext({ sampleRate: 24000 });
  return ctx;
}

function status() {
  if (!session) return "idle";
  if (session.error) return "error";
  if (session.done) return "done";
  if (session.paused) return "paused";
  if (session.playing) return "playing";
  return "loading";
}

function broadcast() {
  chrome.runtime.sendMessage({ type: "model", modelReady, device, downloadProgress }).catch(() => {});
  if (!session) return;
  chrome.runtime.sendMessage({
    target: "background",
    type: "state",
    tabId: session.tabId,
    state: {
      status: status(),
      index: session.index,
      total: session.chunks.length,
      text: session.chunks[session.index] ?? "",
      speed: session.speed,
      voice: session.voice,
      modelReady,
      device,
      downloadProgress,
      error: session.error ?? null,
    },
  }).catch(() => {});
}

function fail(message) {
  if (!session) return;
  session.error = message;
  session.playing = false;
  broadcast();
}

// Generate upcoming chunks in order, one at a time, staying PREFETCH ahead of playback.
async function pump() {
  if (generating || !session) return;
  generating = true;
  try {
    while (session && !session.error) {
      const s = session;
      const epoch = s.epoch;
      let target = -1;
      for (let i = s.index; i < Math.min(s.chunks.length, s.index + PREFETCH); i++) {
        if (!s.cache.has(i)) { target = i; break; }
      }
      if (target === -1) break;
      const msg = await requestAudio(s.chunks[target], s.voice, s.speed, s.engine);
      if (session !== s || s.epoch !== epoch) continue; // stale (seek / speed / voice change)
      const audioCtx = getContext();
      const buffer = audioCtx.createBuffer(1, msg.samples.length, msg.sampleRate);
      buffer.copyToChannel(msg.samples, 0);
      s.cache.set(target, buffer);
      if (target === s.index && !s.source && !s.paused) playCurrent();
    }
  } catch (err) {
    fail(String(err?.message || err));
  } finally {
    generating = false;
  }
}

function playCurrent() {
  const s = session;
  if (!s || s.paused) return;
  if (s.index >= s.chunks.length) {
    s.done = true;
    s.playing = false;
    broadcast();
    return;
  }
  const buffer = s.cache.get(s.index);
  if (!buffer) {
    s.playing = false;
    broadcast();
    pump();
    return;
  }
  const audioCtx = getContext();
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.onended = () => {
    if (session !== s || s.source !== source) return;
    s.source = null;
    s.cache.delete(s.index);
    s.index++;
    playCurrent();
  };
  s.source = source;
  s.playing = true;
  source.start();
  broadcast();
  pump();
}

function stopSource() {
  if (session?.source) {
    const src = session.source;
    session.source = null;
    try { src.stop(); } catch {}
  }
}

function seek(index) {
  const s = session;
  if (!s) return;
  index = Math.max(0, Math.min(s.chunks.length - 1, index));
  stopSource();
  s.index = index;
  s.done = false;
  s.paused = false;
  // Keep any already-generated chunks that are still ahead of us.
  for (const k of s.cache.keys()) if (k < index || k >= index + PREFETCH) s.cache.delete(k);
  if (ctx?.state === "suspended") ctx.resume();
  playCurrent();
}

function resetGeneration() {
  const s = session;
  if (!s) return;
  s.epoch++;
  s.cache.clear();
  stopSource();
  s.done = false;
  s.paused = false;
  playCurrent();
}

const handlers = {
  async start({ tabId, chunks, voice, speed, engine }) {
    stopSource();
    session = {
      tabId, chunks, voice, speed, engine,
      index: 0, epoch: 0, cache: new Map(),
      playing: false, paused: false, done: false, source: null,
    };
    const audioCtx = getContext();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    broadcast();
    pump();
  },
  pause() {
    if (!session || session.paused || session.done) return;
    session.paused = true;
    ctx?.suspend();
    broadcast();
  },
  resume() {
    if (!session) return;
    if (session.done) return seek(0);
    if (!session.paused) return;
    session.paused = false;
    ctx?.resume();
    if (!session.source) playCurrent();
    broadcast();
  },
  toggle() {
    if (!session) return;
    if (session.paused || session.done) handlers.resume();
    else handlers.pause();
  },
  stop() {
    if (!session) return;
    stopSource();
    session.epoch++;
    const tabId = session.tabId;
    session = null;
    ctx?.resume();
    chrome.runtime.sendMessage({ target: "background", type: "state", tabId, state: { status: "idle" } }).catch(() => {});
  },
  next() { if (session) seek(session.index + 1); },
  prev() { if (session) seek(session.index - 1); },
  seek({ index }) { seek(index); },
  setSpeed({ speed }) {
    if (!session || session.speed === speed) return;
    session.speed = speed;
    resetGeneration();
  },
  setVoice({ voice }) {
    if (!session || session.voice === voice) return;
    session.voice = voice;
    resetGeneration();
  },
  preload({ engine }) {
    worker.postMessage({ type: "load", engine });
  },
  modelStatus() {
    chrome.runtime.sendMessage({ type: "model", modelReady, device, downloadProgress }).catch(() => {});
  },
  getState() {
    broadcast();
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;
  const handler = handlers[msg.type];
  if (handler) {
    Promise.resolve(handler(msg)).then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
