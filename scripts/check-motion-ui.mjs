#!/usr/bin/env node
import { checkTempoUI } from "./check-tempo-ui.mjs";
/** Full packaged motion player in a real mobile browser; no account or database. */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const work =
  process.env.BALLWISE_MOTION_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || "/tmp", "ballwise-motion-ui-51");
await fs.mkdir(work, { recursive: true });
const pkg = process.env.BALLWISE_PLAYWRIGHT_PACKAGE;
const { chromium, webkit } = pkg
  ? await import(pathToFileURL(path.join(pkg, "index.mjs")).href)
  : await import("playwright");
const engine = process.env.BALLWISE_BROWSER_ENGINE || "chromium";
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(
      /^\/+/,
      "",
    );
    if (name.split("/").includes("..")) throw new Error("path");
    const data = await fs.readFile(path.join(root, "public", name));
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".json": "application/json",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        }[path.extname(name)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port + "/technique/animations/index.html";
const executablePath =
  engine === "webkit"
    ? process.env.BALLWISE_WEBKIT_EXECUTABLE
    : process.env.BALLWISE_CHROMIUM_EXECUTABLE;
let browser;
const checks = [];
const ensure = (value, message) => {
  if (!value) throw new Error(message);
};
try {
  browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("PLAYER", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error("PLAYER CONSOLE", message.text());
  });
  await page.goto(base + "?id=heavy_back_squat&embed=1&compact=1&autoplay=1");
  await page.waitForFunction(() => window.BWPlayer?.ready);
  ensure(
    !(await page.evaluate(() => window.BWPlayer.getState().playing)),
    "Reduced motion autoplays",
  );
  const sweep = await page.evaluate(() => {
    const failures = [];
    let frames = 0;
    for (const record of window.BWPlayer.records) {
      window.BWPlayer.activate(record.id);
      for (const phase of [0, 0.17, 0.37, 0.5, 0.73, 0.98]) {
        window.BWPlayer.renderAt(phase);
        frames++;
        const stage = document.getElementById("stage"),
          bounds = stage.viewBox.baseVal,
          athlete = document.getElementById("athlete"),
          b = athlete.getBBox();
        if (
          athlete.querySelectorAll(".bw-human-natural").length !== 1 ||
          /NaN|Infinity|undefined/.test(athlete.innerHTML)
        )
          failures.push(record.id + ": invalid figure");
        if (
          b.x < bounds.x - 2 ||
          b.y < bounds.y - 2 ||
          b.x + b.width > bounds.x + bounds.width + 2 ||
          b.y + b.height > bounds.y + bounds.height + 2
        )
          failures.push(record.id + ": cropped athlete at " + phase);
        if (!document.getElementById("phase").textContent)
          failures.push(record.id + ": missing phase");
      }
    }
    return { frames, models: window.BWPlayer.records.length, failures: [...new Set(failures)] };
  });
  ensure(!sweep.failures.length, JSON.stringify(sweep.failures));
  checks.push({ name: "all-models-and-stable-framing", ...sweep });
  await page.evaluate(() => window.BWPlayer.activate("goblet_squat"));
  await page.getByRole("button", { name: "Odtwórz", exact: true }).tap();
  await page.waitForTimeout(220);
  ensure(await page.evaluate(() => window.BWPlayer.getState().playing), "Play did not start");
  await page.getByRole("button", { name: "Pauza", exact: true }).tap();
  const before = await page.evaluate(() => window.BWPlayer.getState().phase);
  await page.waitForTimeout(120);
  ensure(
    before === (await page.evaluate(() => window.BWPlayer.getState().phase)),
    "Pause advances phase",
  );
  await page.getByRole("button", { name: "Następna klatka" }).tap();
  ensure(
    before !== (await page.evaluate(() => window.BWPlayer.getState().phase)),
    "Frame step did not advance",
  );
  await page.locator("#progress").evaluate((input) => {
    input.value = "5000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  ensure(
    Math.abs((await page.evaluate(() => window.BWPlayer.getState().phase)) - 0.5) < 0.001,
    "Scrubber does not select phase",
  );
  checks.push({ name: "touch-play-pause-step-and-scrub", passed: true });
  await page.evaluate(() => window.BWPlayer.choose("a_skip_add_step"));
  ensure(await page.locator("#variant").isVisible(), "Missing explicit rhythm choice");
  await page.selectOption("#variant", "review:a_skip:gather");
  ensure(
    (await page.evaluate(() => window.BWPlayer.getState().id)) === "review:a_skip:gather",
    "Wrong chosen rhythm",
  );
  checks.push({ name: "explicit-skip-rhythm", passed: true });
  await page.evaluate(() => window.BWPlayer.activate("heavy_back_squat"));
  for (const [name, id, p] of [
    ["przysiad", "heavy_back_squat", 0.48],
    ["martwy-ciag", "barbell_deadlift", 0],
    ["mobilnosc", "bwprep:adductor", 0.48],
    ["skip", "a_skip", 0.77],
    ["podparcie", "copenhagen_plank", 0.5],
  ]) {
    await page.evaluate(
      ({ id, p }) => {
        window.BWPlayer.choose(id);
        window.BWPlayer.renderAt(p);
      },
      { id, p },
    );
    await page.screenshot({ path: path.join(work, name + ".png"), fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base + "?id=bodyweight_squat&embed=1&compact=1&autoplay=1");
  await page.waitForFunction(() => window.BWPlayer?.ready && window.BWPlayer.getState().playing);
  await page.evaluate(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        origin: location.origin,
        data: { type: "ballwise-animation-pause" },
      }),
    ),
  );
  ensure(
    !(await page.evaluate(() => window.BWPlayer.getState().playing)),
    "Parent pause message ignored",
  );
  await page.evaluate(() => window.BWPlayer.start());
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = await page.evaluate(() => window.BWPlayer.getState().phase);
  await page.waitForTimeout(180);
  ensure(
    hidden === (await page.evaluate(() => window.BWPlayer.getState().phase)),
    "Hidden player advances",
  );
  checks.push({ name: "autoplay-and-background-pause", passed: true });
  checks.push(await checkTempoUI({ page, base, work, ensure }));
  ensure(!errors.length, errors.join("\n"));
  await page.close();
  const result = { passed: true, engine, checks };
  await fs.writeFile(path.join(work, "wynik.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
