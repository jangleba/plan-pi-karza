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
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  async function enter(query = "") {
    await page.goto(base + query);
    await page.locator('[data-iq-renderer="ready"]').waitFor({ timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    ensure(
      (await page.locator(".bwiq-pitch-canvas canvas").count()) === 1,
      "Missing real 3D canvas",
    );
    ensure(
      (await page.locator(".bwiq-pitch-canvas canvas").getAttribute("data-iq-player-count")) ===
        "13",
      "Missing actual players",
    );
    ensure(
      (await page.locator("[data-iq-player]").count()) <= 3,
      "Guided view shows too many numbers",
    );
    ensure(
      (await page.locator(".iq3-label-guides, [data-iq-destination]").count()) === 0,
      "Guided view has cluttered leader lines/destination circles",
    );
  }
  async function snap(name) {
    ensure(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
      "Horizontal overflow " + name,
    );
    await page.screenshot({ path: path.join(work, name + ".png") });
    views.push(name);
  }
  const starts = [];
  for (const [width, height] of [
    [320, 640],
    [390, 740],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await enter();
    const id = await page.locator("[data-iq-scenario]").getAttribute("data-iq-scenario");
    ensure(!starts.includes(id), "Fresh entry repeated an unfinished/zero-choice action");
    starts.push(id);
    ensure(
      (await page.locator('[data-iq-phase="observe"]').count()) === 1,
      "Missing observation phase",
    );
    ensure(
      (await page.locator("[data-iq-commit]").count()) === 0,
      "Observation reveals a suggested choice",
    );
    await snap("iq-obserwacja-" + width + "x" + height);
    await page.getByRole("button", { name: "Wybierz rozwiązanie", exact: true }).click();
    const choices = await page.locator("[data-iq-commit]").all();
    ensure(choices.length === 1, "Expected one preview and one explicit execution");
    const footer = await page.locator(".iqJ-footer").boundingBox();
    const nav = await page.locator(".bw-tab-bar").boundingBox();
    const button = await choices[0].boundingBox();
    await page.screenshot({
      path: path.join(work, "iq-choice-debug-" + width + "x" + height + ".png"),
    });

    ensure(
      button &&
        footer &&
        nav &&
        button.height >= 44 &&
        button.y + button.height <= Math.min(nav.y, footer.y + footer.height),
      "Main IQ choice is hidden " + width + "x" + height,
    );
    if (width === 390 && height >= 740) {
      const playerHeight = Number(
        await page.locator(".bwiq-pitch-canvas canvas").getAttribute("data-iq-controlled-height"),
      );
      const field = await page.locator(".iqJ-stage").boundingBox();
      ensure(playerHeight >= 14, "Footballer is illegible in fixed view: " + playerHeight);
      ensure(field.height >= 220, "Too little space for the pitch: " + field.height);
    }
    await snap("iq-3d-" + width + "x" + height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await enter();
  const id = await page.locator("[data-iq-scenario]").getAttribute("data-iq-scenario");
  const plan = await page.evaluate((id) => window.__iqQA.plan(id), id);
  async function setMode(name) {
    await page.locator(".iqL-mode-menu summary").click();
    await page.getByRole("button", { name, exact: true }).click();
  }
  await setMode("Bez podpowiedzi");
  ensure(
    (await page.locator("[data-iq-commit], [data-iq-destination]").count()) === 0,
    "Independent mode leaks suggested choices",
  );
  await setMode("Z podpowiedziami");
  await page.getByRole("button", { name: "Wybierz rozwiązanie", exact: true }).click();
  const beforePreview = await page.evaluate(() =>
    localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa:draft"),
  );
  await page.getByRole("button", { name: "Następny wariant", exact: true }).click();
  ensure(
    (await page.evaluate(() =>
      localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa:draft"),
    )) === beforePreview,
    "Preview saved a decision",
  );
  ensure(
    (await page.locator(".bwiq-pitch-canvas canvas").getAttribute("data-iq-action-count")) === "1",
    "Preview must show one arrow",
  );
  await snap("iq-jeden-wariant");
  ensure(
    (await page.locator(".bwiq-pitch-canvas canvas").getAttribute("data-iq-camera-close")) ===
      "false",
    "Guided view changed to close-up",
  );
  ensure(
    (await page.getByRole("button", { name: /^(Całość|Przybliż)$/ }).count()) === 0,
    "Unnecessary camera controls remain",
  );
  const fixedBounds = await page
    .locator(".bwiq-pitch-canvas canvas")
    .getAttribute("data-iq-view-bounds");
  for (const [index, decision] of plan.entries()) {
    await page
      .getByRole("combobox", { name: "Zamiar i moment", exact: true })
      .selectOption(decision.group);
    if (decision.delivery && (await page.locator('select[aria-label="Rodzaj podania"]').count())) {
      await page
        .getByRole("combobox", { name: "Rodzaj podania" })
        .selectOption({ label: decision.delivery });
    }
    const previous = page.getByRole("button", { name: "Poprzedni wariant", exact: true });
    while (await previous.isEnabled()) await previous.click();
    for (
      let i = 0;
      (await page.locator("[data-iq-commit]").getAttribute("data-iq-commit")) !== decision.id;
      i++
    ) {
      ensure(i < 16, "Requested choice missing from guided previews");
      await page.getByRole("button", { name: "Następny wariant", exact: true }).click();
    }
    if (index === 0) await page.emulateMedia({ reducedMotion: "no-preference" });
    const before =
      index === 0 ? await page.locator(".bwiq-pitch-canvas canvas").screenshot() : null;
    await page.getByRole("button", { name: "Zagraj tak", exact: true }).click();
    if (index === 0) {
      await page.getByRole("heading", { name: "Akcja trwa…", exact: true }).waitFor();
      ensure(
        (await page.locator("[data-iq-commit]").count()) === 0,
        "Playback accepts duplicate input",
      );
      const during = await page.locator(".bwiq-pitch-canvas canvas").screenshot();
      ensure(!before.equals(during), "The 3D action did not change its rendered frame");
      await snap("iq-3d-akcja");
      await page.emulateMedia({ reducedMotion: "reduce" });
    }
    await page.waitForFunction(() => !document.querySelector(".iqJ-transport"), undefined, {
      timeout: 20000,
    });
    ensure(
      (await page.locator(".bwiq-pitch-canvas canvas").getAttribute("data-iq-view-bounds")) ===
        fixedBounds,
      "Camera bounds changed after a decision",
    );
    ensure(
      (await page.locator('[data-iq-phase="feedback"]').count()) === 1,
      "Playback skipped its teaching consequence",
    );
    ensure(
      (await page.locator("[data-iq-commit]").count()) === 0,
      "Feedback overlaps the next choice",
    );
    if (index === 0) await snap("iq-skutek-decyzji");
    if (await page.getByRole("button", { name: "Następny krok", exact: true }).count()) {
      await page.getByRole("button", { name: "Następny krok", exact: true }).click();
      await page.getByRole("button", { name: "Wybierz rozwiązanie", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Przejdź do wniosków", exact: true }).click();
    }
  }
  await page.getByRole("region", { name: "Wnioski z akcji" }).waitFor();
  ensure(
    (await page.evaluate(
      () => JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa")).length,
    )) === 1,
    "Action was not saved exactly once",
  );
  await snap("iq-wnioski");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Zapisz wskazówkę", exact: true }).click();
  await (await download).saveAs(path.join(work, "wniosek-na-mecz.txt"));
  ensure(
    (await fs.readFile(path.join(work, "wniosek-na-mecz.txt"), "utf8")).includes(
      "Kiedy zmienić plan",
    ),
    "Missing conditional match takeaway",
  );
  await page.getByRole("button", { name: "Zobacz ten moment", exact: true }).click();
  ensure(
    (await page.locator(".iqJ-review-nav").count()) === 1,
    "Takeaway is disconnected from the actual decision",
  );
  await snap("iq-analiza-momentu");
  // Explicit takeover must be an unsaved preview until one actual choice is committed.
  const partner = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  partner.on("pageerror", (e) => errors.push(e.message));
  await partner.goto(base + "?fixture=partner&position=goalkeeper");
  await partner.locator('[data-iq-renderer="ready"]').waitFor({ timeout: 45000 });
  await partner.getByRole("button", { name: "Wybierz rozwiązanie", exact: true }).click();
  const actor = await partner
    .getByRole("combobox", { name: "Sterowany zawodnik", exact: true })
    .locator("option")
    .last()
    .getAttribute("value");
  const draftBefore = await partner.evaluate(() =>
    localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa:draft"),
  );
  await partner
    .getByRole("combobox", { name: "Sterowany zawodnik", exact: true })
    .selectOption(actor);
  await partner
    .getByRole("combobox", { name: "Zamiar i moment", exact: true })
    .selectOption("pass:delay");
  ensure(
    (await partner.evaluate(() =>
      localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa:draft"),
    )) === draftBefore,
    "Takeover preview changed the saved decisions",
  );
  ensure((await partner.locator("[data-iq-player]").count()) <= 3, "Takeover crowded the pitch");
  const takeoverId = await partner.locator("[data-iq-commit]").getAttribute("data-iq-commit");
  ensure(takeoverId.startsWith("as6:" + actor + ":"), "Takeover controls the wrong actor");
  await partner.screenshot({ path: path.join(work, "iq-decyzja-partnera.png") });
  views.push("iq-decyzja-partnera");
  await partner.getByRole("button", { name: "Zagraj tak", exact: true }).click();
  await partner.waitForFunction(() => !document.querySelector(".iqJ-transport"));
  const partnerRecord = await partner.evaluate(
    () =>
      JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa:draft")) ??
      JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:iq-browser-qa"))?.at(-1),
  );
  ensure(partnerRecord.choices.at(-1).id === takeoverId, "Takeover was not recorded for replay");
  await partner.close();
  // Explicitly reject the model download: figures must still animate and accept a choice.
  const fallback = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await fallback.route(/running.*\.fbx/, (route) => route.abort());
  await fallback.goto(base);
  await fallback.locator('[data-iq-renderer="fallback"]').waitFor({ timeout: 45000 });
  ensure(
    (await fallback.locator("[data-iq-figure]").count()) === 13,
    "Fallback lost the human figures",
  );
  ensure((await fallback.locator("[data-iq-player]").count()) <= 3, "Fallback shows every number");
  await fallback.getByRole("button", { name: "Wybierz rozwiązanie", exact: true }).click();
  await fallback.getByRole("button", { name: "Zagraj tak", exact: true }).click();
  await fallback.waitForFunction(() => !document.querySelector(".iqJ-transport"));
  await fallback.screenshot({ path: path.join(work, "iq-zawodnicy-bez-webgl.png") });
  views.push("iq-zawodnicy-bez-webgl");
  ensure(!errors.length, errors.join("; "));
  await fs.writeFile(
    path.join(work, "wynik-iq.json"),
    JSON.stringify({ passed: true, real3D: true, starts, views }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, real3D: true, views }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
