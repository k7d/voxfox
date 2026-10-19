// End-to-end smoke test: loads the built extension in Chrome for Testing, opens an
// article, triggers the toolbar action, and waits for Kokoro audio to start playing.
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const EXT = path.resolve("dist");
const pdir = `${homedir()}/.cache/puppeteer/chrome`;
const exe = process.env.CHROME_PATH || readdirSync(pdir).sort().reverse()
  .map((v) => `${pdir}/${v}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find(existsSync);

const ARTICLE = `<!doctype html><html lang="en"><head><title>The Red Fox</title></head><body>
<nav><a href="#">Home</a> <a href="#">About</a> <a href="#">Subscribe now!</a></nav>
<main><article>
<h1>The Red Fox</h1>
<p>The red fox is the largest of the true foxes and one of the most widely distributed members of the order Carnivora. It is present across the entire Northern Hemisphere, including most of North America, Europe and Asia, plus parts of North Africa.</p>
<p>Red foxes are usually solitary hunters. They feed primarily on rodents, but they also eat rabbits, birds, reptiles, invertebrates, and fruit. Their keen hearing lets them locate small mammals hidden under snow or thick grass.</p>
<h2>Behaviour</h2>
<p>Foxes communicate with a wide range of sounds, from short barks to long, eerie screams. Dr. Smith noted in 1998 that a single fox may use more than twenty distinct calls. Each call costs very little energy, about $0.00 in fox money.</p>
</article></main>
<footer>© 2026 Fox Facts. Cookie settings.</footer></body></html>`;

const server = createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end(ARTICLE); });
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  enableExtensions: [EXT],
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1200,850", "--enable-unsafe-webgpu"],
});

const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const t0 = Date.now();
try {
  const swTarget = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("background.js"));
  const sw = await swTarget.worker();
  sw.on("console", (m) => log("[sw]", m.text()));

  // Close the options page that opens on install.
  await new Promise((r) => setTimeout(r, 800));
  for (const p of await browser.pages()) if (p.url().includes("options.html")) await p.close();

  const page = await browser.newPage();
  page.on("console", (m) => log("[page]", m.text()));
  await page.goto(url);
  await page.bringToFront();

  browser.on("targetcreated", async (t) => {
    if (t.url().includes("offscreen.html")) {
      const p = await t.asPage().catch(() => null);
      p?.on("console", (m) => log("[offscreen]", m.text()));
      p?.on("pageerror", (e) => log("[offscreen error]", e.message));
      log("offscreen document created");
    }
  });

  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await self.voxfox.click(tab);
  });
  log("clicked action");

  // Poll the player state through the session storage + the badge.
  let lastStatus = "";
  const deadline = Date.now() + 10 * 60_000;
  let playingSeen = false;
  while (Date.now() < deadline) {
    const st = await sw.evaluate(async () => (await chrome.storage.session.get("active")).active);
    const badge = await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return chrome.action.getBadgeText({ tabId: tab.id });
    });
    const s = `${st?.status ?? "none"} badge=${badge}`;
    if (s !== lastStatus) { log("state:", s); lastStatus = s; }
    if (st?.status === "playing" && !playingSeen) {
      playingSeen = true;
      await page.screenshot({ path: "test/playing.png" });
      log("screenshot saved: test/playing.png");
      // One click pauses, the next resumes.
      const click = () => sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await self.voxfox.click(tab);
      });
      const status = () => sw.evaluate(async () => (await chrome.storage.session.get("active")).active?.status);
      await click(); await new Promise((r) => setTimeout(r, 600));
      const paused = await status();
      await click(); await new Promise((r) => setTimeout(r, 600));
      const resumed = await status();
      log(`toggle: ${paused} → ${resumed}`);
      if (paused !== "paused" || !["playing", "loading"].includes(resumed)) throw new Error("toggle failed");
    }
    if (st?.status === "error") throw new Error("Player reported an error");
    if (playingSeen && st?.status === "done") { log("finished reading the article ✅"); break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!playingSeen) throw new Error("Never started playing");
} finally {
  await browser.close();
  server.close();
}
