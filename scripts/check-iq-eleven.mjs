#!/usr/bin/env node
/** 11v11 IQ browser QA: real Vite build, three.js scene and models, third person, landscape.
 * Build-only works without Chromium. Screens go to BALLWISE_IQ_SHOTS (default: the work dir). */
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
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-iq-eleven");
await fs.mkdir(work, { recursive: true });
await fs.writeFile(
  path.join(work, "index.html"),
  '<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>',
);
await fs.writeFile(
  path.join(work, "entry.js"),
  `import ${JSON.stringify(path.join(root, "src/features/football-iq-match/__qa__/ElevenHarness.tsx"))};`,
);
const dist = path.join(work, "dist");
await build({
  configFile: false,
  root: work,
  envDir: work,
  base: "/",
  publicDir: false,
  logLevel: "warn",
  resolve: { alias: { "@": path.join(root, "src") } },
  plugins: [react(), tailwindcss()],
  build: { outDir: dist, emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});
if (process.argv.includes("--build-only")) {
  console.log(JSON.stringify({ built: dist }));
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BALLWISE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.BALLWISE_CHROMIUM_EXECUTABLE }
      : {}),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("UI ERROR", e.message);
  });
  const seed = process.env.BALLWISE_E11_SEED || 3;
  await page.goto(`http://127.0.0.1:${server.address().port}/?seed=${seed}&role=mid`);
  const scene = () => page.evaluate(() => window.__e11Scene.debugState());

  // 1. Intro: the starting picture from behind your player, role and hints to choose.
  await page.waitForSelector('[data-stage="intro"]', { timeout: 90000 });
  await page.screenshot({ path: path.join(shots, "01-intro-844.png") });
  ensure(
    (await page.getByRole("button", { name: "Z podpowiedziami" }).getAttribute("aria-pressed")) ===
      "true",
    "Hints are on by default",
  );

  // 2. Play, landscape: 22 players, chips over the 10 team-mates.
  await page.getByRole("button", { name: /^Start/ }).click();
  await page.waitForSelector('[data-stage="play"]');
  await wait(600);
  await page.evaluate(() => window.__e11Scene.setPaused(true));
  await page.screenshot({ path: path.join(shots, "02-play-start-844.png") });
  const chips = await page.locator(".e11-chip").count();
  ensure(chips === 10, `Ten team-mate chips expected, got ${chips}`);
  report.visibleChips = await page.locator(".e11-chip:visible").count();
  await page.evaluate(() => window.__e11Scene.setPaused(false));

  // 3. Move with the stick; the run starts and the view stays on the rivals' goal.
  const stick = await page.locator(".e11-stick").boundingBox();
  const cx = stick.x + stick.width / 2,
    cy = stick.y + stick.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 50, { steps: 4 });
  await wait(900);
  await page.mouse.up();
  report.afterStick = await scene();
  await page.screenshot({ path: path.join(shots, "03-running-844.png") });

  // 4. Wait until the runner is about to burst, then play the ball into space to him with a chip tap.
  const info = await scene();
  const runner = info.runs[0];
  const t0 = Date.now();
  while ((await scene()).tick < runner.burst - 12) {
    if (Date.now() - t0 > 60000) break;
    await wait(40);
  }
  await page.evaluate(() => window.__e11Scene.setPaused(true));
  await page.screenshot({ path: path.join(shots, "04-before-pass-844.png") });
  await page.getByRole("button", { name: "W wolne miejsce" }).click();
  await page.evaluate(() => window.__e11Scene.setPaused(false));
  report.passAccepted = await page.evaluate((to) => {
    const chip = document.querySelector(`.e11-chip[data-index="${to}"]`);
    chip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    return true;
  }, runner.to);
  await page.waitForSelector('[data-stage="debrief"]', { timeout: 90000 });
  await wait(500);
  await page.screenshot({ path: path.join(shots, "05-debrief-844.png") });
  report.debriefText = (await page.locator(".e11-panel").innerText()).slice(0, 500);
  ensure(await page.locator(".e11-pitch").count(), "The replay from above must be drawn");

  // 5. Open the first moment: the replay stops there and explains it.
  await page.locator(".e11-moments button").nth(1).click();
  await wait(300);
  await page.screenshot({ path: path.join(shots, "06-moment-844.png") });
  report.momentText = await page.locator(".e11-moments button[data-open]").innerText();

  // 6. Upright phone: the notice replaces the game on the next start.
  await page.setViewportSize({ width: 390, height: 780 });
  await wait(300);
  await page.screenshot({ path: path.join(shots, "07-debrief-portrait-390.png") });
  ensure(errors.length === 0, `Page errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ passed: true, report }, null, 2));
} finally {
  await browser?.close();
  server.close();
}
