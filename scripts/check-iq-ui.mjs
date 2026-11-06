#!/usr/bin/env node
/** Real Vite/FBX/Three browser QA. Build-only works without a socket or Chromium. */
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
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-iq-ui-34");
await fs.mkdir(work, { recursive: true });
await fs.writeFile(
  path.join(work, "index.html"),
  '<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>',
);
await fs.writeFile(
  path.join(work, "entry.js"),
  `import ${JSON.stringify(path.join(root, "src/features/football-iq-match/__qa__/IQHarness.tsx"))};`,
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
let browser;
const errors = [],
  views = [];
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
  const base = `http://127.0.0.1:${server.address().port}/`;
  const page = await browser.newPage({
    viewport: { width: 390, height: 560 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  async function ready(target = page) {
    await target.locator('[data-iq-renderer="ready"]').waitFor({ timeout: 45000 });
    await target.evaluate(() => document.fonts.ready);
  }
  async function snap(name, target = page) {
    ensure(
      (await target.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
      "Horizontal overflow " + name,
    );
    await target.screenshot({ path: path.join(work, name + ".png"), animations: "disabled" });
    views.push(name);
  }
  async function saved(target = page) {
    return target.evaluate(() =>
      localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa:draft"),
    );
  }
  async function spatialPoint(target = page) {
    return target.evaluate(() => {
      const id = document.querySelector("[data-iq-scenario]").getAttribute("data-iq-scenario");
      const s = window.__iqQA.current(id),
        p = s.world.positions[s.controlledId ?? "you"];
      const canvas = document.querySelector(".bwiq-pitch-canvas canvas");
      const bounds = canvas?.getBoundingClientRect();
      const corners = canvas ? JSON.parse(canvas.dataset.iqPitchCorners) : null;
      const players = canvas
        ? Object.values(JSON.parse(canvas.dataset.iqProjectedPlayers))
        : [...document.querySelectorAll("[data-iq-figure]")].map((e) => {
            const r = e.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          });
      const field = document.querySelector(".iqD-field > g");
      const project = (q) => {
        if (canvas)
          return {
            x:
              bounds.x +
              corners[0].x +
              ((corners[1].x - corners[0].x) * q.x) / 100 +
              ((corners[2].x - corners[0].x) * q.y) / 140,
            y:
              bounds.y +
              corners[0].y +
              ((corners[1].y - corners[0].y) * q.x) / 100 +
              ((corners[2].y - corners[0].y) * q.y) / 140,
          };
        const r = new DOMPoint(q.x, q.y).matrixTransform(field.getScreenCTM());
        return { x: r.x, y: r.y };
      };
      for (const dx of [13, -13, 20, -20, 7, -7])
        for (const dy of [-13, 13, -20, 20, -7, 7]) {
          const q = {
            x: Math.max(5, Math.min(95, p.x + dx)),
            y: Math.max(7, Math.min(133, p.y + dy)),
          };
          if (Math.hypot(q.x - p.x, q.y - p.y) > 31) continue;
          const pixel = project(q);
          if (
            players.every(
              (r) =>
                Math.hypot(pixel.x - r.x - (bounds?.x ?? 0), pixel.y - r.y - (bounds?.y ?? 0)) > 21,
            )
          )
            return { world: q, pixel };
        }
      throw Error("No clear user-selected test point");
    });
  }
  async function preview(target = page) {
    const point = await spatialPoint(target);
    await target.mouse.click(point.pixel.x, point.pixel.y);
    await target.locator("[data-iq-commit]").waitFor();
    ensure(
      (await target.locator("[data-iq-commit]").getAttribute("data-iq-commit")).includes("free6:"),
      "Spatial touch did not create a free choice",
    );
    return point;
  }
  async function clickPlayer(id, target = page) {
    const pixel = await target.locator(".bwiq-pitch-canvas canvas").evaluate((canvas, id) => {
      const p = JSON.parse(canvas.dataset.iqProjectedPlayers)[id],
        r = canvas.getBoundingClientRect();
      return { x: r.x + p.x, y: r.y + p.y };
    }, id);
    await target.mouse.click(pixel.x, pixel.y);
  }
  const measurements = [];
  for (const [width, height] of [
    [320, 560],
    [390, 560],
    [390, 635],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(base);
    await ready();
    ensure(
      (await page
        .locator('select[aria-label="Zamiar i moment"],.iqL-option-nav,.iqL-mode-menu')
        .count()) === 0,
      "Preset decision UI remains",
    );
    ensure((await page.locator("[data-iq-commit]").count()) === 0, "A move is already selected");
    const geometry = await page.evaluate(() => {
      const root = document.querySelector(".iqB-spatial").getBoundingClientRect(),
        stage = document.querySelector(".iqJ-stage").getBoundingClientRect(),
        c = document.querySelector(".bwiq-pitch-canvas canvas"),
        r = c.getBoundingClientRect();
      return {
        stageHeight: stage.height,
        availableHeight: root.height,
        canvasWidth: r.width,
        fieldWidth: Number(c.dataset.iqFieldWidth),
        playerHeight: Number(c.dataset.iqControlledHeight),
        orientation: document.querySelector("[data-iq-layout]").dataset.iqLayout,
      };
    });
    ensure(
      geometry.stageHeight >= (width < 500 ? geometry.availableHeight * 0.48 : 120),
      "Pitch allocation too small " + JSON.stringify(geometry),
    );
    ensure(
      geometry.fieldWidth >= (width < 500 ? geometry.canvasWidth * 0.78 : 240),
      "Pitch letterboxed too narrowly " + JSON.stringify(geometry),
    );
    ensure(
      geometry.playerHeight >= 8 && geometry.playerHeight <= 28,
      "Player is unreadable or too large " + JSON.stringify(geometry),
    );
    measurements.push({ width, height, ...geometry });
    await snap(`iq-boisko-${width}x${height}`);
    const before = await saved();
    await preview();
    ensure((await saved()) === before, "Preview saved a decision");
    ensure(
      await page.getByRole("button", { name: "Rozegraj", exact: true }).isVisible(),
      "Missing explicit execution",
    );
    await snap(`iq-wlasny-ruch-${width}x${height}`);
  }
  await page.setViewportSize({ width: 390, height: 635 });
  await page.goto(base + "?fixture=carry");
  await ready();
  await clickPlayer("support");
  ensure(
    (await page.locator("[data-iq-commit]").getAttribute("data-iq-commit")).includes(
      "t:pass:support:ground",
    ),
    "Player touch does not plan a pass",
  );
  await page.getByRole("button", { name: "Sposób i moment wykonania", exact: true }).click();
  await page.getByRole("button", { name: "Po chwili", exact: true }).click();
  await page.getByRole("button", { name: "Wróć do boiska", exact: true }).click();
  ensure(
    (await page.locator("[data-iq-commit]").getAttribute("data-iq-commit")).includes("delay:"),
    "Timing change not applied",
  );
  await snap("iq-wlasne-podanie");
  await page.getByRole("button", { name: "Usuń planowany ruch", exact: true }).click();
  await preview();
  const before = await saved();
  await page.getByRole("button", { name: "Przewidź", exact: true }).click();
  await snap("iq-przewidywanie-na-zyczenie");
  await page.getByRole("button", { name: "Zwiń i wróć do boiska", exact: true }).click();
  ensure((await saved()) === before, "Cancelled prediction changed replay");
  await page.getByRole("button", { name: "Przewidź", exact: true }).click();
  await page.getByRole("button", { name: "Przesunie się do piłki", exact: true }).click();
  await page.getByRole("button", { name: "Zaplanuj kolejny krok", exact: true }).click();
  await page.getByRole("button", { name: "Sprawdzę ponownie grę do przodu", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const fixedOrientation = await page
    .locator(".bwiq-pitch-canvas canvas")
    .getAttribute("data-iq-landscape-view");
  const beforeFrame = await page.locator(".bwiq-pitch-canvas canvas").screenshot();
  await page.getByRole("button", { name: "Rozegraj i sprawdź", exact: true }).click();
  await page.locator('[data-iq-phase="playing"]').waitFor();
  const duringFrame = await page.locator(".bwiq-pitch-canvas canvas").screenshot();
  ensure(!beforeFrame.equals(duringFrame), "No actual animated change");
  await snap("iq-plynna-akcja");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('[data-iq-phase="feedback"]').waitFor();
  let draft = JSON.parse(await saved());
  ensure(
    draft.choices[0].id.includes("free6:") &&
      draft.mode === "learn" &&
      draft.forecasts.length === 1,
    "Free guided decision/prediction not saved",
  );
  ensure(
    (await page.locator(".bwiq-pitch-canvas canvas").getAttribute("data-iq-landscape-view")) ===
      fixedOrientation,
    "Camera rotated during a decision",
  );
  await snap("iq-skutek-wlasnej-decyzji");
  await page.reload();
  await ready();
  ensure(JSON.parse(await saved()).choices.length === 1, "Reload lost free decision");
  await preview();
  await page.getByRole("button", { name: "Rozegraj", exact: true }).click();
  ensure((await page.locator("dialog.iqF-sheet[open]").count()) === 0, "Forecast is forced");
  for (let turns = 0; turns < 9; turns++) {
    if (await page.getByRole("region", { name: "Wnioski z akcji" }).count()) break;
    if (await page.locator('[data-iq-phase="feedback"]').count()) {
      await page.getByRole("button", { name: /^(Następny krok|Wnioski z akcji)$/ }).click();
    } else if (await page.locator('[data-iq-phase="board"]').count()) {
      await page.getByRole("button", { name: "Zostań w pozycji", exact: true }).click();
      await page.getByRole("button", { name: "Rozegraj", exact: true }).click();
    } else await page.waitForTimeout(50);
  }
  await page.getByRole("region", { name: "Wnioski z akcji" }).waitFor();
  await snap("iq-wnioski-z-wlasnej-akcji");
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa")),
  );
  ensure(
    records.length === 1 && records[0].forecasts.length === 1,
    "Completion duplicated or lost progress",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Zapisz wskazówkę", exact: true }).click();
  await (await download).saveAs(path.join(work, "wniosek-na-mecz.txt"));
  await page.getByRole("button", { name: "Zobacz ten moment", exact: true }).click();
  await snap("iq-analiza-wlasnego-ruchu");
  const independent = await browser.newPage({
    viewport: { width: 390, height: 560 },
    reducedMotion: "reduce",
  });
  await independent.goto(base + "?fixture=carry");
  await ready(independent);
  await independent.getByRole("button", { name: "Podpowiedzi na życzenie", exact: true }).click();
  ensure(
    (await independent.getByRole("button", { name: "Wskazówka", exact: true }).count()) === 0,
    "Independent mode exposes hints",
  );
  await preview(independent);
  await independent.getByRole("button", { name: "Rozegraj", exact: true }).click();
  await independent.locator('[data-iq-phase="board"],[data-iq-phase="summary"]').waitFor();
  ensure(
    (await independent.locator('[data-iq-phase="feedback"]').count()) === 0,
    "Independent play interrupted with evaluation",
  );
  await snap("iq-pelna-samodzielnosc", independent);
  await independent.close();
  const partner = await browser.newPage({
    viewport: { width: 390, height: 635 },
    reducedMotion: "reduce",
  });
  await partner.goto(base + "?fixture=partner");
  await ready(partner);
  await partner.getByRole("button", { name: /^Zdecyduj za / }).click();
  await clickPlayer("you", partner);
  const takeover = await partner.locator("[data-iq-commit]").getAttribute("data-iq-commit");
  ensure(takeover.startsWith("as6:"), "Wrong actor for takeover");
  await snap("iq-decyzja-partnera", partner);
  await partner.getByRole("button", { name: "Rozegraj", exact: true }).click();
  const takeoverRecord = await partner.evaluate(
    () =>
      JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa:draft")) ??
      JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa"))?.at(-1),
  );
  ensure(takeoverRecord.choices.at(-1).id === takeover, "Takeover not saved");
  await partner.close();
  const fallback = await browser.newPage({
    viewport: { width: 390, height: 560 },
    reducedMotion: "reduce",
  });
  await fallback.route(/running.*\.fbx/, (route) => route.abort());
  await fallback.goto(base + "?fixture=carry");
  await fallback.locator('[data-iq-renderer="fallback"]').waitFor({ timeout: 45000 });
  await fallback.locator('[data-iq-phase="board"]').waitFor();
  const expectedPlayers = await fallback.evaluate(
    () =>
      window.__iqQA.current(
        document.querySelector("[data-iq-scenario]").getAttribute("data-iq-scenario"),
      ).players.length,
  );
  ensure(
    (await fallback.locator("[data-iq-figure]").count()) === expectedPlayers,
    "Fallback lost players",
  );
  await preview(fallback);
  await fallback.getByRole("button", { name: "Rozegraj", exact: true }).click();
  await fallback.locator('[data-iq-phase="feedback"]').waitFor();
  await snap("iq-bez-webgl", fallback);
  await fallback.close();
  ensure(errors.length === 0, errors.join("; "));
  const result = { passed: true, real3D: true, views, measurements };
  await fs.writeFile(path.join(work, "wynik-iq.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
