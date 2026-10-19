// Generates one sentence via the bundled worker and reports device, timing, and loudness.
import puppeteer from "puppeteer-core";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
const pdir = `${homedir()}/.cache/puppeteer/chrome`;
const exe = readdirSync(pdir).sort().reverse().map((v) => `${pdir}/${v}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`).find(existsSync);
const browser = await puppeteer.launch({ executablePath: exe, headless: false, pipe: true, enableExtensions: [path.resolve("dist")], args: ["--enable-unsafe-webgpu"] });
const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker")).worker();
const id = new URL(sw.url()).host;
const page = await browser.newPage();
await page.goto(`chrome-extension://${id}/offscreen.html`);
for (const engine of ["auto", "wasm"]) {
  const r = await page.evaluate(async (engine) => {
    const w = new Worker("tts-worker.js", { type: "module" });
    const t0 = performance.now();
    const res = await new Promise((resolve) => {
      let device;
      w.onmessage = (e) => {
        if (e.data.type === "ready") device = e.data.device;
        if (e.data.type === "audio") resolve({ device, samples: e.data.samples, sr: e.data.sampleRate });
        if (e.data.type === "error") resolve({ error: e.data.message });
      };
      w.postMessage({ type: "generate", id: 1, engine, voice: "af_heart", speed: 1, text: "The quick brown fox jumps over the lazy dog, and then reads you the news." });
    });
    const t1 = performance.now();
    w.postMessage({ type: "generate", id: 2, engine, voice: "af_heart", speed: 1, text: "A second sentence, to measure warm generation speed." });
    const second = await new Promise((r) => (w.onmessage = (e) => e.data.type === "audio" && r(e.data.samples.length / e.data.sampleRate)));
    const t2 = performance.now();
    w.terminate();
    if (res.error) return res;
    let sum = 0; for (const s of res.samples) sum += s * s;
    return { device: res.device, coldMs: Math.round(t1 - t0), audioSec: +(res.samples.length / res.sr).toFixed(2), rms: +Math.sqrt(sum / res.samples.length).toFixed(4), warmMs: Math.round(t2 - t1), warmAudioSec: +second.toFixed(2) };
  }, engine);
  console.log(engine, r);
}
await browser.close();
