import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const watch = process.argv.includes("--watch");
const out = "dist";

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/ort`, { recursive: true });

// Static files (manifest, html, css, icons).
cpSync("static", out, { recursive: true });
if (!existsSync("static/icons/icon-128.png")) execSync("node scripts/icons.mjs", { stdio: "inherit" }), cpSync("static", out, { recursive: true });

// Test builds get host access, since programmatic action clicks don't grant activeTab.
if (process.env.VOXFOX_TEST) {
  const m = JSON.parse(readFileSync(`${out}/manifest.json`, "utf8"));
  m.host_permissions.push("http://localhost/*");
  writeFileSync(`${out}/manifest.json`, JSON.stringify(m, null, 2));
}

// ONNX Runtime WASM binaries, bundled so nothing executable is loaded from a CDN.
for (const f of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
  cpSync(`node_modules/onnxruntime-web/dist/${f}`, `${out}/ort/${f}`);
}

const common = {
  bundle: true,
  target: "chrome116",
  platform: "browser",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  legalComments: "none",
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
};

const builds = [
  { entryPoints: ["src/background.js"], outfile: `${out}/background.js`, format: "esm" },
  { entryPoints: ["src/content.js"], outfile: `${out}/content.js`, format: "iife" },
  { entryPoints: ["src/offscreen.js"], outfile: `${out}/offscreen.js`, format: "esm" },
  { entryPoints: ["src/tts-worker.js"], outfile: `${out}/tts-worker.js`, format: "esm" },
  { entryPoints: ["src/options.js"], outfile: `${out}/options.js`, format: "esm" },
];

if (watch) {
  for (const b of builds) (await esbuild.context({ ...common, ...b })).watch();
  console.log("Watching for changes…");
} else {
  await Promise.all(builds.map((b) => esbuild.build({ ...common, ...b })));
}
