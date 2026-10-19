// Generates Chrome Web Store screenshots (1280x800) and promo tiles using the real extension.
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const pdir = `${homedir()}/.cache/puppeteer/chrome`;
const exe = readdirSync(pdir).sort().reverse().map((v) => `${pdir}/${v}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`).find(existsSync);

const ARTICLE = `<!doctype html><html lang="en"><head><title>How Foxes Hear the World</title><style>
body{margin:0;font:19px/1.65 Georgia,serif;color:#1f2937;background:#fff}
header{border-bottom:1px solid #e5e7eb;padding:18px 0;font:600 15px system-ui;color:#6b7280}
header div,article{max-width:720px;margin:0 auto;padding:0 24px}
h1{font:700 44px/1.15 system-ui;letter-spacing:-.02em;margin:48px 0 12px;color:#111827}
.meta{font:15px system-ui;color:#6b7280;margin-bottom:28px}
</style></head><body>
<header><div>The Field Journal &nbsp;·&nbsp; Nature &nbsp;·&nbsp; Science &nbsp;·&nbsp; Travel</div></header>
<article>
<h1>How Foxes Hear the World</h1>
<div class="meta">By Ada Marsh · 6 min read</div>
<p>On a still winter morning, a red fox stands motionless in a snowy field. It tilts its head, listens, and then leaps high into the air before diving nose-first into the snow. A moment later it emerges with a vole in its jaws.</p>
<p>This hunting technique, called mousing, depends almost entirely on hearing. Foxes can detect the faint rustle of a rodent moving beneath a meter of snow, and researchers believe they may even use the Earth's magnetic field to judge the distance of their leap.</p>
<p>Their large, mobile ears act like satellite dishes, funneling sound toward the inner ear. Each ear can rotate independently, letting the fox pinpoint a sound's direction with remarkable precision.</p>
<p>Scientists studying foxes in the Czech Republic found that leaps aimed toward the northeast were far more successful than those in any other direction.</p>
</article></body></html>`;

const server = createServer((_q, r) => { r.setHeader("content-type", "text/html; charset=utf-8"); r.end(ARTICLE); });
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const browser = await puppeteer.launch({
  executablePath: exe, headless: false, pipe: true, enableExtensions: [path.resolve("dist")],
  args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-webgpu", "--hide-scrollbars"],
  defaultViewport: { width: 1280, height: 800 },
});
const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker")).worker();
const id = new URL(sw.url()).host;
await new Promise((r) => setTimeout(r, 800));
for (const p of await browser.pages()) if (p.url().includes("options.html")) await p.close();

// 1. Article being read, with the floating player.
const page = await browser.newPage();
await page.goto(url);
await page.bringToFront();
await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await self.voxfox.click(t); });
for (let i = 0; i < 600; i++) {
  const st = await sw.evaluate(async () => (await chrome.storage.session.get("active")).active?.status);
  if (st === "playing") break;
  await new Promise((r) => setTimeout(r, 500));
}
// advance to the second paragraph so the highlight is visible mid-article
for (let n = 0; n < 2; n++) {
  await sw.evaluate(async () => chrome.runtime.sendMessage({ target: "offscreen", type: "next" }));
  await new Promise((r) => setTimeout(r, 300));
}
for (let i = 0; i < 100; i++) {
  const st = await sw.evaluate(async () => (await chrome.storage.session.get("active")).active?.status);
  if (st === "playing") break;
  await new Promise((r) => setTimeout(r, 200));
}
await new Promise((r) => setTimeout(r, 800));
console.log("highlighted:", await page.evaluate(() => [...document.querySelectorAll("p")].map((p) => p.style.backgroundColor)));
await page.screenshot({ path: "store/screenshot-1-player.png" });
await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await self.voxfox.stop(t.id); });

// 2. Settings page.
const opt = await browser.newPage();
await opt.goto(`chrome-extension://${id}/options.html`);
await new Promise((r) => setTimeout(r, 1500));
await opt.screenshot({ path: "store/screenshot-2-settings.png" });

// 3. Promo tiles rendered from HTML.
const icon = readFileSync("static/icons/icon.svg", "utf8");
const tile = (w, h, big) => `<html><body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:${big ? 48 : 22}px;
  background:radial-gradient(circle at 25% 30%,#fb923c,#c2410c);font-family:system-ui;color:#fff">
  <div style="width:${big ? 260 : 120}px;height:${big ? 260 : 120}px;filter:drop-shadow(0 8px 20px rgba(0,0,0,.25))">${icon.replace("<svg", '<svg width="100%" height="100%"')}</div>
  <div><div style="font:800 ${big ? 96 : 48}px/1 system-ui;letter-spacing:-.03em">VoxFox</div>
  <div style="font:500 ${big ? 30 : 17}px/1.3 system-ui;margin-top:${big ? 16 : 8}px;opacity:.95">Listen to any webpage<br>with one click.</div></div></body></html>`;
const tp = await browser.newPage();
for (const [name, w, h, big] of [["promo-small-440x280", 440, 280, false], ["promo-marquee-1400x560", 1400, 560, true]]) {
  await tp.setViewport({ width: w, height: h });
  await tp.setContent(tile(w, h, big));
  await tp.screenshot({ path: `store/${name}.png` });
}
await browser.close();
server.close();
console.log("done");
