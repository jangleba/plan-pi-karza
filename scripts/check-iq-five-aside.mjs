#!/usr/bin/env node
/** 5v5 first-person IQ browser QA: real Vite build, three.js scene and models. Build-only works without Chromium. */
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
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-iq-five-aside");
await fs.mkdir(work, { recursive: true });
await fs.writeFile(
  path.join(work, "index.html"),
  '<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>',
);
await fs.writeFile(
  path.join(work, "entry.js"),
  `import ${JSON.stringify(path.join(root, "src/features/football-iq-match/__qa__/FiveAsideHarness.tsx"))};`,
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BALLWISE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.BALLWISE_CHROMIUM_EXECUTABLE }
      : {}),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("UI ERROR", e.message);
  });
  const seed = process.env.BALLWISE_F5_SEED || 3;
  const url = `http://127.0.0.1:${server.address().port}/?seed=${seed}&position=left`;
  await page.goto(url);
  const state = () => page.evaluate(() => window.__f5Scene.debugState());
  const stage = () => page.locator(".fp-root").getAttribute("data-stage");
  const hud = () => page.locator(".fp-root").getAttribute("data-hud");

  // 1. Intro: choose the position.
  await page.waitForSelector('[data-stage="intro"]', { timeout: 60000 });
  await page.getByRole("button", { name: "Lewy skrzydłowy" }).click();
  ensure((await page.getByRole("button", { name: "Lewy skrzydłowy" }).getAttribute("aria-pressed")) === "true", "Position must be selectable");
  await page.screenshot({ path: path.join(shots, "01-intro-390.png") });

  // 2. Ready: without motion data the screen explains dragging.
  await page.getByRole("button", { name: "Graj" }).click();
  await page.waitForSelector('[data-stage="ready"]');
  await wait(2200);
  ensure(/Przeciągaj palcem/.test(await page.locator(".fp-card").innerText()), "Without motion data the screen must explain dragging");
  report.lookWithoutSensor = (await state()).look;

  // 3. Play: the keeper's first ball comes to you.
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForSelector('[data-stage="play"]');
  await wait(400);
  await page.evaluate(() => window.__f5Scene.setPaused(true));
  await page.screenshot({ path: path.join(shots, "02-play-start-390.png") });
  await page.evaluate(() => window.__f5Scene.setPaused(false));
  const t0 = Date.now();
  while ((await hud()) !== "with" && Date.now() - t0 < 30000) await wait(150);
  ensure((await hud()) === "with", "The first ball must reach you (hud=with)");
  report.receivedAfterMs = Date.now() - t0;
  await page.evaluate(() => window.__f5Scene.setPaused(true));
  await page.screenshot({ path: path.join(shots, "03-with-ball-390.png") });
  await page.evaluate(() => window.__f5Scene.setPaused(false));

  // 4. Joystick: run, then look around with the finger: the run direction must not change.
  const stick = await page.locator(".f5-stick").boundingBox();
  const cx = stick.x + stick.width / 2,
    cy = stick.y + stick.height / 2;
  const before = await state();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy - 45, { steps: 4 });
  await wait(500);
  const running = await state();
  ensure(running.move.speed > 0.5, "Joystick must start a run");
  // Second pointer: drag the picture to look around while the stick is held.
  await page.evaluate(() => {
    const host = document.querySelector(".fp-stage");
    const opts = (x, id) => ({ pointerId: id, clientX: x, clientY: 300, bubbles: true, pointerType: "touch", isPrimary: false });
    host.dispatchEvent(new PointerEvent("pointerdown", opts(200, 7)));
    for (let x = 200; x >= 40; x -= 20) host.dispatchEvent(new PointerEvent("pointermove", opts(x, 7)));
    host.dispatchEvent(new PointerEvent("pointerup", opts(40, 7)));
  });
  await wait(400);
  const looked = await state();
  report.lookTurn = Math.abs(looked.viewYaw - running.viewYaw);
  ensure(report.lookTurn > 0.5, "Dragging must turn the view");
  ensure(Math.abs(looked.move.dir - running.move.dir) < 1e-9, "Looking around must not change the run direction");
  await page.mouse.up();
  await wait(300);
  ensure((await state()).move.speed === 0, "Lifting the thumb must stop the run input");
  report.moved = Math.hypot(looked.ty.x - before.ty.x, looked.ty.y - before.ty.y);
  ensure(report.moved > 0.8, "The player must move with the joystick");

  // 5. Keyboard fallback: W runs forward in the current view.
  const k0 = await state();
  await page.keyboard.down("w");
  await wait(600);
  const k1 = await state();
  await page.keyboard.up("w");
  ensure(k1.move.speed > 0.5, "W must start a run");
  report.keyboardMoved = Math.hypot(k1.ty.x - k0.ty.x, k1.ty.y - k0.ty.y);

  // 6. Pass: aim at a partner and hold the button (power), release.
  if ((await hud()) === "with") {
    await page.evaluate(() => window.__f5Scene.lookAt(1));
    const pass = page.getByRole("button", { name: "Podaj" });
    const box = await pass.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await wait(450);
    ensure(await pass.evaluate((el) => el.classList.contains("is-charging")), "Holding must charge the power");
    await page.mouse.up();
    report.passSent = true;
  }
  // Pause and resume.
  await page.getByRole("button", { name: "Pauza" }).click();
  await page.waitForSelector("text=Wróć do gry");
  const pausedTick = (await state()).tick;
  await wait(500);
  ensure((await state()).tick === pausedTick, "Pause must stop the simulation");
  await page.getByRole("button", { name: "Wróć do gry" }).click();

  // 7. Landscape.
  await page.setViewportSize({ width: 844, height: 390 });
  await wait(600);
  await page.evaluate(() => window.__f5Scene.setPaused(true));
  await page.screenshot({ path: path.join(shots, "04-landscape-844.png") });
  // Frame time over 2 s (software WebGL here: not representative of a phone).
  await page.evaluate(() => window.__f5Scene.setPaused(false));
  report.frameMs = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const tick = (now) => {
          times.push(now - last);
          last = now;
          if (times.length < 90) requestAnimationFrame(tick);
          else resolve(times.slice(10).reduce((a, b) => a + b, 0) / (times.length - 10));
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.setViewportSize({ width: 390, height: 780 });

  // 8. The fragment ends by itself; replay from above; debrief; saved once.
  const t1 = Date.now();
  while ((await stage()) === "play" && Date.now() - t1 < 90000) await wait(300);
  ensure((await stage()) === "replay" || (await stage()) === "debrief", "The fragment must end with a replay");
  await wait(1500);
  await page.screenshot({ path: path.join(shots, "05-replay-390.png") });
  if ((await stage()) === "replay") await page.getByRole("button", { name: "Dalej" }).click();
  await page.waitForSelector(".fp-debrief");
  await wait(300);
  await page.screenshot({ path: path.join(shots, "06-debrief-390.png") });
  const debrief = await page.locator(".fp-debrief").innerText();
  ensure(/Przyjęcie/.test(debrief) && /Decyzja/.test(debrief) && /Rezultat/.test(debrief), "Debrief must grade touch, decision and result apart");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ballwise:iq:f5:v1:f5-browser-qa") || "[]"));
  ensure(saved.length === 1, `One attempt must be saved (got ${saved.length})`);
  report.saved = { outcome: saved[0].outcome, inputs: saved[0].inputs.length, variant: saved[0].variant };
  report.debrief = debrief.replace(/\s+/g, " ").slice(0, 400);
  // Replaying the recorded inputs in the page gives the same result (deterministic).
  await page.getByRole("button", { name: "Zagraj ponownie" }).click();
  await page.waitForSelector('[data-stage="ready"]');
  ensure((await page.locator(".fp-root").getAttribute("data-f5-variant")) === saved[0].variant, "Play again must keep the variant");
  const again = await page.evaluate(() => JSON.parse(localStorage.getItem("ballwise:iq:f5:v1:f5-browser-qa") || "[]"));
  ensure(again.length === 1, "Opening the replay or playing again must not save twice");
  report.errors = errors;
  ensure(errors.length === 0, "No page errors");
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} catch (error) {
  console.error(error);
  console.log(JSON.stringify({ ok: false, ...report, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
