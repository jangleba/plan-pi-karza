#!/usr/bin/env node
/** First-person IQ browser QA: real Vite build, three.js scene and models. Build-only works without Chromium. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url)),
  require = createRequire(path.join(root, "package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: react } = await import(
  pathToFileURL(require.resolve("@vitejs/plugin-react")).href
);
const { default: tailwindcss } = await import(
  pathToFileURL(require.resolve("@tailwindcss/vite")).href
);
const work =
  process.env.BALLWISE_IQ_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-iq-first-person");
await fs.mkdir(work, { recursive: true });
await fs.writeFile(
  path.join(work, "index.html"),
  '<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>',
);
await fs.writeFile(
  path.join(work, "entry.js"),
  `import ${JSON.stringify(path.join(root, "src/features/football-iq-match/__qa__/FirstPersonHarness.tsx"))};`,
);
const dist = path.join(work, "dist");
await build({
  configFile: false,
  root: work,
  envDir: work,
  base: "/",
  publicDir: false,
  resolve: { alias: { "@": path.join(root, "src") } },
  plugins: [react(), tailwindcss()],
  build: { outDir: dist, emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
if (process.argv.includes("--build-only")) {
  console.log(JSON.stringify({ built: dist, assets: "real FBX and animation clips" }));
  process.exit(0);
}
const packagePath = process.env.BALLWISE_PLAYWRIGHT_PACKAGE;
const { chromium } = packagePath
  ? await import(pathToFileURL(path.join(packagePath, "index.mjs")).href)
  : await import("playwright");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".fbx": "application/octet-stream",
  ".glb": "model/gltf-binary",
};
const server = http.createServer(async (req, res) => {
  try {
    const name =
      decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") ||
      "index.html";
    if (name.split("/").includes("..")) {
      res.writeHead(400);
      res.end();
      return;
    }
    let data;
    try {
      data = await fs.readFile(path.join(dist, name));
    } catch {
      data = await fs.readFile(path.join(root, "public", name));
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(name)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const shots = process.env.BALLWISE_IQ_SHOTS || work;
await fs.mkdir(shots, { recursive: true });
let browser;
const errors = [];
const report = {};
const ensure = (value, message) => {
  if (!value) throw new Error(message);
};
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BALLWISE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.BALLWISE_CHROMIUM_EXECUTABLE }
      : {}),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("UI ERROR", e.message);
  });
  const url = `http://127.0.0.1:${server.address().port}/?seed=${process.env.BALLWISE_FP_SEED || 52}`;
  await page.goto(url);
  // 1. Demonstration of one principle, from above.
  await page.waitForSelector('[data-stage="intro"]', { timeout: 60000 });
  await page.waitForTimeout(2500);
  ensure(
    /Zasada/i.test(await page.locator(".fp-card").innerText()),
    "Intro must name the principle",
  );
  await page.screenshot({ path: path.join(shots, "01-demo-390.png") });
  // 2. Ready: first-person picture, phone held in front (no motion sensor here → drag).
  await page.getByRole("button", { name: "Twoja kolej" }).click();
  await page.waitForSelector('[data-stage="ready"]');
  await page.waitForTimeout(1800);
  ensure(
    /Przeciągaj palcem/.test(await page.locator(".fp-card").innerText()),
    "Without motion data the screen must explain dragging",
  );
  await page.screenshot({ path: path.join(shots, "02-ready-390.png") });
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForSelector('[data-stage="play"]');
  // Look around by dragging (fallback control); then aim the first touch forward.
  const box = await page.locator(".fp-stage").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.evaluate(() => window.__fpScene.setPaused(true));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, "03-play-look-390.png") });
  await page.evaluate(() => window.__fpScene.setPaused(false));
  await page.evaluate(() => window.__fpScene.recenterForward());
  await page.locator(".fp-thumb").click();
  // Wait for the ball, then look at the runner and pass.
  await page.waitForFunction(
    () => document.querySelector(".fp-thumb")?.textContent === "Podaj",
    null,
    { timeout: 15000 },
  );
  // Freeze the action while the (slow, software-rendered) screenshot is taken.
  await page.evaluate(() => {
    window.__fpScene.setPaused(true);
    window.__fpScene.lookAt("support");
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, "04-play-ball-390.png") });
  await page.evaluate(() => window.__fpScene.setPaused(false));
  await page.locator(".fp-thumb").click();
  await page.waitForSelector('[data-stage="replay"]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "05-replay-390.png") });
  await page.waitForSelector(".fp-debrief", { timeout: 20000 });
  const debrief = await page.locator(".fp-debrief").innerText();
  ensure(
    /Wybór/.test(debrief) && /Wykonanie/.test(debrief) && /Rezultat/.test(debrief),
    "Debrief must separate choice, execution and result",
  );
  await page.screenshot({ path: path.join(shots, "06-debrief-390.png") });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ballwise:iq:fp:v1:fp-browser-qa") || "[]"),
  );
  ensure(saved.length === 1 && saved[0].version === 1, "Result must be saved once, versioned");
  report.saved = saved[0];
  // Replay again must not save a second time.
  await page.getByRole("button", { name: "Powtórka" }).click();
  await page.waitForTimeout(800);
  const again = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ballwise:iq:fp:v1:fp-browser-qa") || "[]"),
  );
  ensure(again.length === 1, "Watching the replay again must not save another result");
  // Hidden app pauses the action.
  await page.waitForSelector(".fp-debrief", { timeout: 20000 });
  await page.getByRole("button", { name: "Nowy wariant" }).click();
  await page.waitForSelector('[data-stage="ready"], [data-stage="intro"]', { timeout: 20000 });
  const variantAfter = await page.locator(".fp-root").getAttribute("data-fp-variant");
  ensure(variantAfter !== report.saved.variant, "Next lesson must change the variant");
  report.nextVariant = variantAfter;
  // Landscape layout.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, "07-landscape-844.png") });
  // Frame-time sample (software WebGL here; only a smoke check, not an iPhone measurement).
  report.frameMs = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const t = [];
        let last = performance.now();
        const tick = (now) => {
          t.push(now - last);
          last = now;
          if (t.length < 90) requestAnimationFrame(tick);
          else resolve(t.slice(10).reduce((a, b) => a + b, 0) / (t.length - 10));
        };
        requestAnimationFrame(tick);
      }),
  );
  ensure(errors.length === 0, `Page errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, shots, ...report }, null, 2));
} finally {
  await browser?.close();
  server.close();
}
