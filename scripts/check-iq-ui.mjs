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
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-iq-ui-32");
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
    ensure((await page.locator("[data-iq-player]").count()) === 12, "Missing actual players");
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
    const choices = await page.locator("[data-iq-choice]").all();
    ensure(choices.length >= 2, "No clear choices");
    const footer = await page.locator(".iqJ-footer").boundingBox();
    const nav = await page.locator(".bw-tab-bar").boundingBox();
    const button = await choices[0].boundingBox();
    ensure(
      button &&
        footer &&
        nav &&
        button.height >= 44 &&
        button.y + button.height <= Math.min(nav.y, footer.y + footer.height),
      "Main IQ choice is hidden " + width + "x" + height,
    );
    await snap("iq-3d-" + width + "x" + height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await enter();
  const id = await page.locator("[data-iq-scenario]").getAttribute("data-iq-scenario");
  const plan = await page.evaluate((id) => window.__iqQA.plan(id), id);
  await page.getByRole("button", { name: "Bez podpowiedzi", exact: true }).click();
  ensure(
    (await page.locator("[data-iq-choice], [data-iq-destination]").count()) === 0,
    "Independent mode leaks suggested choices",
  );
  await page.getByRole("button", { name: "Z podpowiedziami", exact: true }).click();
  for (const [index, decision] of plan.entries()) {
    if (
      decision.delivery &&
      (await page.getByRole("button", { name: decision.delivery, exact: true }).count())
    )
      await page.getByRole("button", { name: decision.delivery, exact: true }).click();
    if (index === 0) await page.emulateMedia({ reducedMotion: "no-preference" });
    const before =
      index === 0 ? await page.locator(".bwiq-pitch-canvas canvas").screenshot() : null;
    await page.locator(`[data-iq-choice="${decision.id}"]`).click();
    if (index === 0) {
      await page.getByRole("heading", { name: "Akcja trwa…", exact: true }).waitFor();
      ensure(
        (await page.locator("[data-iq-choice]").count()) === 0,
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
  // Explicitly reject the model download: figures must still animate and accept a choice.
  const fallback = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await fallback.route(/running.*\.fbx/, (route) => route.abort());
  await fallback.goto(base);
  await fallback.locator('[data-iq-renderer="fallback"]').waitFor({ timeout: 45000 });
  ensure(
    (await fallback.locator("[data-iq-figure]").count()) === 12,
    "Fallback lost the human figures",
  );
  await fallback.locator("[data-iq-choice]").first().click();
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
