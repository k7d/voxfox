import { getSettings } from "./settings.js";

const OFFSCREEN_URL = "offscreen.html";

// Per-tab playback state lives in session storage so it survives service-worker restarts.
async function getActive() {
  const { active } = await chrome.storage.session.get("active");
  return active ?? null; // { tabId, status }
}
async function setActive(active) {
  await chrome.storage.session.set({ active });
}

let creatingOffscreen = null;
async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return contexts.length > 0;
}
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        // WORKERS keeps the document alive while paused or while the model downloads;
        // AUDIO_PLAYBACK alone would close it after 30s of silence.
        reasons: ["AUDIO_PLAYBACK", "WORKERS"],
        justification: "Generate speech on-device with Kokoro and play it back.",
      })
      .finally(() => (creatingOffscreen = null));
  }
  await creatingOffscreen;
}

function toOffscreen(type, payload = {}) {
  return chrome.runtime.sendMessage({ target: "offscreen", type, ...payload });
}

async function injectContent(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function startReading(tab, { selectionOnly = false } = {}) {
  const tabId = tab.id;
  const active = await getActive();
  if (active && active.tabId !== tabId) await stopReading(active.tabId);

  try {
    await injectContent(tabId);
  } catch (err) {
    console.warn("[VoxFox] Cannot access this page", err);
    flashBadge(tabId, "×", "#9ca3af");
    return;
  }

  const page = await chrome.tabs.sendMessage(tabId, { type: "voxfox:extract", selectionOnly });
  if (!page?.chunks?.length) {
    await chrome.tabs.sendMessage(tabId, { type: "voxfox:state", state: { status: "error", error: "Nothing to read on this page." } }).catch(() => {});
    return;
  }

  const settings = await getSettings();
  await ensureOffscreen();
  await setActive({ tabId, status: "loading" });
  setBadge(tabId, "loading");
  await toOffscreen("start", {
    tabId,
    chunks: page.chunks,
    voice: settings.voice,
    speed: settings.speed,
    engine: settings.engine,
  });
}

async function stopReading(tabId) {
  if (await hasOffscreen()) await toOffscreen("stop").catch(() => {});
  await setActive(null);
  if (tabId != null) {
    setBadge(tabId, "idle");
    chrome.tabs.sendMessage(tabId, { type: "voxfox:state", state: { status: "idle" } }).catch(() => {});
  }
}

// One click: start → pause → resume …
async function onActionClick(tab) {
  const active = await getActive();
  if (active?.tabId === tab.id && (await hasOffscreen())) {
    if (["playing", "loading", "paused", "done"].includes(active.status)) {
      await toOffscreen("toggle");
      return;
    }
  }
  await startReading(tab);
}
chrome.action.onClicked.addListener(onActionClick);
// Handy for automated tests and debugging from the service worker console.
self.voxfox = { click: onActionClick, stop: stopReading };

// Messages from the offscreen document (state updates) and the in-page player (controls).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "background" && msg.type === "state") {
    handleState(msg.tabId, msg.state);
    return;
  }
  if (msg?.type === "voxfox:control" && sender.tab) {
    handleControl(sender.tab, msg).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
});

async function handleState(tabId, state) {
  if (tabId == null || tabId < 0) return; // preview from the options page
  const active = await getActive();
  if (state.status === "idle") {
    if (active?.tabId === tabId) await setActive(null);
  } else {
    await setActive({ tabId, status: state.status });
  }
  setBadge(tabId, state.status);
  chrome.tabs.sendMessage(tabId, { type: "voxfox:state", state }).catch(() => {});
}

async function handleControl(tab, msg) {
  const { action } = msg;
  if (action === "stop") return stopReading(tab.id);
  if (action === "restart") return startReading(tab);
  if (!(await hasOffscreen())) return startReading(tab);
  if (action === "setSpeed") {
    await chrome.storage.sync.set({ speed: msg.speed });
    return toOffscreen("setSpeed", { speed: msg.speed });
  }
  if (action === "setVoice") {
    await chrome.storage.sync.set({ voice: msg.voice });
    return toOffscreen("setVoice", { voice: msg.voice });
  }
  if (["toggle", "pause", "resume", "next", "prev"].includes(action)) return toOffscreen(action);
}

// Stop when the tab being read is closed or navigates away.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const active = await getActive();
  if (active?.tabId === tabId) await stopReading(null);
});
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "loading") return;
  const active = await getActive();
  if (active?.tabId === tabId) await stopReading(tabId);
});

// Context menu: read just the selection.
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({ id: "voxfox-selection", title: "Listen to selection", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "voxfox-page", title: "Listen to this page", contexts: ["page"] });
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  startReading(tab, { selectionOnly: info.menuItemId === "voxfox-selection" });
});

// Badge reflects state on the toolbar icon.
function setBadge(tabId, status) {
  const map = {
    loading: ["…", "#f97316"],
    playing: ["▶", "#ea580c"],
    paused: ["❚❚", "#78716c"],
    error: ["!", "#dc2626"],
  };
  const [text, color] = map[status] ?? ["", "#000"];
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (text) chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  const titles = { playing: "Pause VoxFox", paused: "Resume VoxFox", loading: "VoxFox is warming up…" };
  chrome.action.setTitle({ tabId, title: titles[status] ?? "Listen with VoxFox" }).catch(() => {});
}

function flashBadge(tabId, text, color) {
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {}), 2000);
}

// Options page: download model, report status, preview a voice.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "voxfox:modelStatus") {
    hasOffscreen().then((has) => has && toOffscreen("modelStatus"));
    return;
  }
  if (msg?.type === "voxfox:preview") {
    (async () => {
      const active = await getActive();
      if (active) await stopReading(active.tabId);
      await ensureOffscreen();
      const { engine } = await getSettings();
      await toOffscreen("start", { tabId: -1, chunks: [msg.text], voice: msg.voice, speed: msg.speed, engine });
    })();
    return;
  }
  if (msg?.type === "voxfox:preload") {
    (async () => {
      await ensureOffscreen();
      const { engine } = await getSettings();
      await toOffscreen("preload", { engine });
      sendResponse({ ok: true });
    })();
    return true;
  }
});
