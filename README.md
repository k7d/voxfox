# 🦊 VoxFox

Listen to any webpage with a single click. VoxFox reads articles aloud with natural-sounding
[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) voices that run **entirely on your device**:
no account, no API key, and no text sent to a server.

## Features

- **One click** on the toolbar icon (or `⌃⌘V` on Mac, `Alt+Shift+V` on Windows/Linux) starts reading; click again to pause or resume.
- **Smart extraction** with Mozilla Readability, so it reads the article and skips the nav, ads, and footer.
- **Read a selection**: highlight text first, or right-click → *Listen to selection*.
- **Floating player** with skip back/forward, speed (0.75×–2×), and a voice picker.
- **Follows along** by highlighting and scrolling to the paragraph being read.
- **22 English voices** (American and British).
- **Fast**: uses WebGPU when available (≈6× faster than real time) and falls back to CPU (WASM).

## Development

```bash
npm install
npm run build        # → dist/
npm run watch        # rebuild on change
npm run zip          # → voxfox.zip for the Chrome Web Store
```

Load it in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `dist/`.

The first time you use it, the Kokoro model downloads from Hugging Face and is cached (~330 MB fp32 for
WebGPU, ~90 MB q8 for CPU).

### Tests

```bash
VOXFOX_TEST=1 npm run build   # adds localhost host permission for automation
node test/e2e.mjs             # loads the extension, reads an article end to end
node test/audio-check.mjs     # generation speed on WebGPU vs WASM
```

## Architecture

| File | Role |
|---|---|
| `src/background.js` | Service worker: toolbar click, context menu, badge, routing messages |
| `src/content.js` + `src/extract.js` | Injected on click: extracts and chunks text, renders the floating player |
| `src/offscreen.js` | Offscreen document: playback queue, prefetches 3 chunks ahead, Web Audio |
| `src/tts-worker.js` | Web Worker running `kokoro-js` (Transformers.js + ONNX Runtime Web) |
| `src/options.js` | Settings: voice, speed, engine, model pre-download |

ONNX Runtime's WASM files are bundled in `dist/ort/`, so no executable code is loaded from a CDN
(required by Manifest V3).
