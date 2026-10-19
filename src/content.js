import { extractPage, chunkBlocks } from "./extract.js";
import { SPEEDS, VOICES, SHORTCUT_LABEL } from "./settings.js";

// The script may be injected more than once per page; only set up once.
if (!window.__voxfox) {
  window.__voxfox = true;
  setup();
}

function setup() {
  let host = null;
  let ui = null;
  let lastState = { status: "idle" };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "voxfox:extract") {
      let page = extractPage();
      if (msg.selectionOnly && page.source !== "selection") page = { ...page, blocks: [] };
      const chunks = chunkBlocks(page.blocks);
      ensureUI();
      render({ status: "loading", index: 0, total: chunks.length, modelReady: lastState.modelReady });
      sendResponse({ title: page.title, chunks });
      return;
    }
    if (msg?.type === "voxfox:state") {
      if (msg.state.status === "idle") return removeUI();
      ensureUI();
      render(msg.state);
    }
  });

  function control(action, extra = {}) {
    chrome.runtime.sendMessage({ type: "voxfox:control", action, ...extra }).catch(() => {});
  }

  function ensureUI() {
    if (host?.isConnected) return;
    host = document.createElement("voxfox-player");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; right: 20px; bottom: 20px;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="bar" part="bar">
        <div class="logo" title="VoxFox">${FOX_SVG}</div>
        <button class="btn" data-a="prev" title="Previous sentence">${ICONS.prev}</button>
        <button class="btn play" data-a="toggle" title="Play / pause (${SHORTCUT_LABEL})"></button>
        <button class="btn" data-a="next" title="Next sentence">${ICONS.next}</button>
        <div class="info">
          <div class="label"></div>
          <div class="track"><div class="fill"></div></div>
        </div>
        <button class="pill speed" title="Playback speed"></button>
        <select class="voice" title="Voice"></select>
        <button class="btn close" data-a="stop" title="Stop">${ICONS.close}</button>
      </div>`;
    const $ = (s) => root.querySelector(s);
    ui = {
      root,
      bar: $(".bar"),
      play: $(".play"),
      label: $(".label"),
      fill: $(".fill"),
      speed: $(".speed"),
      voice: $(".voice"),
      track: $(".track"),
    };

    for (const group of ["American", "British"]) {
      const og = document.createElement("optgroup");
      og.label = group;
      for (const v of VOICES.filter((v) => v.accent === group)) {
        const o = document.createElement("option");
        o.value = v.id;
        o.textContent = `${v.name} ${v.gender === "F" ? "♀" : "♂"}`;
        og.append(o);
      }
      ui.voice.append(og);
    }

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-a]");
      if (btn) control(btn.dataset.a === "toggle" && lastState.status === "error" ? "restart" : btn.dataset.a);
    });
    ui.speed.addEventListener("click", () => {
      const cur = lastState.speed ?? 1;
      const next = SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length] ?? 1;
      lastState.speed = next;
      ui.speed.textContent = `${next}×`;
      control("setSpeed", { speed: next });
    });
    ui.voice.addEventListener("change", () => control("setVoice", { voice: ui.voice.value }));

    document.documentElement.append(host);
    chrome.storage.sync.get({ speed: 1, voice: "af_heart" }).then((s) => {
      if (lastState.speed == null) ui.speed.textContent = `${s.speed}×`;
      if (!lastState.voice) ui.voice.value = s.voice;
    });
  }

  function removeUI() {
    host?.remove();
    host = null;
    ui = null;
    lastState = { status: "idle" };
  }

  function render(state) {
    lastState = { ...lastState, ...state };
    const s = lastState;
    if (!ui) return;
    const playing = s.status === "playing";
    const waiting = s.status === "loading";
    ui.play.innerHTML = waiting ? ICONS.spinner : playing ? ICONS.pause : ICONS.play;
    ui.play.title = `${playing ? "Pause" : "Play"} (${SHORTCUT_LABEL})`;
    ui.bar.dataset.status = s.status;

    let label;
    if (s.status === "error") label = s.error || "Something went wrong";
    else if (waiting && s.downloadProgress != null) label = `Downloading voice… ${Math.round(s.downloadProgress * 100)}%`;
    else if (waiting && !s.modelReady) label = "Warming up voice…";
    else if (waiting) label = "Preparing…";
    else if (s.status === "done") label = "Finished";
    else if (s.total) label = `${s.index + 1} / ${s.total}`;
    else label = "";
    ui.label.textContent = label;

    const pct = s.status === "done" ? 100 : s.total ? (s.index / s.total) * 100 : 0;
    ui.fill.style.width = waiting && s.downloadProgress != null ? `${s.downloadProgress * 100}%` : `${pct}%`;
    ui.track.classList.toggle("dl", waiting && s.downloadProgress != null);
    if (s.speed != null) ui.speed.textContent = `${s.speed}×`;
    if (s.voice) ui.voice.value = s.voice;

    highlight(s);
  }

  // Lightly highlight the paragraph currently being read, if we can find it.
  let marked = null;
  function highlight(s) {
    if (marked) {
      marked.style.backgroundColor = marked.dataset.voxfoxBg || "";
      marked.style.transition = "";
      delete marked.dataset.voxfoxBg;
      marked = null;
    }
    if (s.status !== "playing" && s.status !== "paused") return;
    const text = s.text;
    if (!text || text.length < 12) return;
    const needle = text.slice(0, 60).replace(/\.$/, "");
    const has = (el) => el.offsetParent !== null && el.textContent.replace(/\s+/g, " ").includes(needle);
    let el = [...document.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, figcaption, td")].find(has);
    if (!el) {
      // Fallback: the deepest element containing the text (e.g. a byline in a <div>).
      el = [...document.body.querySelectorAll("*")].filter(has).pop();
      if (el && el.closest("voxfox-player")) el = null;
    }
    if (!el) return;
    marked = el;
    el.dataset.voxfoxBg = el.style.backgroundColor;
    el.style.transition = "background-color .3s";
    el.style.backgroundColor = "rgba(249, 115, 22, 0.14)";
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight - 90) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

const ICONS = {
  play: `<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>`,
  prev: `<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12l8.5 6V6z"/></svg>`,
  next: `<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" class="spin"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="36 60" stroke-linecap="round"/></svg>`,
};

const FOX_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <path fill="#f97316" d="M8 6l16 14h16L56 6l-2 28c0 13-10 24-22 24S10 47 10 34z"/>
  <path fill="#fff7ed" d="M14 34c6 0 12 4 18 12 6-8 12-12 18-12-1 11-8 20-18 20S15 45 14 34z"/>
  <path fill="#7c2d12" d="M12 11l9 9-8 4zM52 11l-9 9 8 4z" opacity=".55"/>
  <circle cx="23" cy="32" r="3" fill="#1c1917"/><circle cx="41" cy="32" r="3" fill="#1c1917"/>
  <path fill="#1c1917" d="M29 45h6l-3 3.5z"/>
</svg>`;

const CSS = `
  :host { all: initial; }
  .bar {
    display: flex; align-items: center; gap: 4px;
    font: 500 12.5px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #fafaf9; background: rgba(28, 25, 23, .94);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 999px; padding: 6px 8px 6px 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,.25), 0 2px 6px rgba(0,0,0,.2);
    animation: in .22s ease-out;
    user-select: none;
  }
  @keyframes in { from { opacity: 0; transform: translateY(10px) scale(.98); } }
  .logo { width: 26px; height: 26px; margin-right: 2px; flex: none; }
  .logo svg { width: 100%; height: 100%; display: block; }
  .btn {
    all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 999px;
    display: grid; place-items: center; color: #e7e5e4; flex: none;
  }
  .btn:hover { background: rgba(255,255,255,.1); color: #fff; }
  .btn svg { width: 16px; height: 16px; fill: currentColor; }
  .play { width: 36px; height: 36px; background: #f97316; color: #fff; }
  .play:hover { background: #ea580c; }
  .play svg { width: 18px; height: 18px; }
  .close svg { width: 14px; height: 14px; }
  .info { width: 132px; padding: 0 6px; display: flex; flex-direction: column; gap: 6px; }
  .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #d6d3d1; font-variant-numeric: tabular-nums; }
  .track { height: 3px; border-radius: 3px; background: rgba(255,255,255,.15); overflow: hidden; }
  .fill { height: 100%; width: 0; background: #fb923c; transition: width .4s ease; }
  .track.dl .fill { background: #fdba74; }
  .pill, .voice {
    all: unset; cursor: pointer; height: 26px; padding: 0 9px; border-radius: 999px;
    background: rgba(255,255,255,.08); color: #fafaf9; font: inherit; font-size: 12px;
    font-variant-numeric: tabular-nums; flex: none;
  }
  .pill { min-width: 26px; text-align: center; }
  .voice { max-width: 92px; padding-right: 6px; line-height: 26px; }
  .voice option, .voice optgroup { color: #1c1917; background: #fff; }
  .pill:hover, .voice:hover { background: rgba(255,255,255,.16); }
  .bar[data-status="error"] .label { color: #fca5a5; }
  .spin { animation: spin 1s linear infinite; }
  .spin circle { fill: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .bar, .spin { animation: none; } .fill { transition: none; } }
`;
