// Renders static/icons/icon.svg to PNGs using a local Chrome via puppeteer-core.
import puppeteer from "puppeteer-core";
import { readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  const pdir = `${homedir()}/.cache/puppeteer/chrome`;
  if (existsSync(pdir)) for (const v of readdirSync(pdir)) candidates.push(`${pdir}/${v}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
  return candidates.find(existsSync);
}

const svg = readFileSync("static/icons/icon.svg", "utf8");
mkdirSync("static/icons", { recursive: true });
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg", `<svg width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: `static/icons/icon-${size}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`icon-${size}.png`);
}
await browser.close();
