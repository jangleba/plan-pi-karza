#!/usr/bin/env node
/** Actual React/CSS, authored isolated records, no account/backend writes. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  require = createRequire(path.join(root, "package.json"));
const work =
  process.env.BALLWISE_PROGRESS_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-progress-ui-36");
await fs.mkdir(work, { recursive: true });
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: react } = await import(
  pathToFileURL(require.resolve("@vitejs/plugin-react")).href
);
const { default: tailwindcss } = await import(
  pathToFileURL(require.resolve("@tailwindcss/vite")).href
);
await fs.writeFile(
  path.join(work, "index.html"),
  '<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>',
);
await fs.writeFile(
  path.join(work, "entry.js"),
  `import ${JSON.stringify(path.join(root, "src/components/progress/__qa__/ProgressHarness.tsx"))};`,
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
  console.log(JSON.stringify({ built: dist }));
  process.exit(0);
}
const packagePath = process.env.BALLWISE_PLAYWRIGHT_PACKAGE;
const { chromium } = packagePath
  ? await import(pathToFileURL(path.join(packagePath, "index.mjs")).href)
  : await import("playwright");
const types = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};
const server = http.createServer(async (req, res) => {
  try {
    const name =
      decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") ||
      "index.html";
    if (name.split("/").includes("..")) throw Error("path");
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
let browser, page;
const errors = [],
  views = [];
const ensure = (value, message) => {
  if (!value) throw Error(message);
};
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BALLWISE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.BALLWISE_CHROMIUM_EXECUTABLE }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 390, height: 740 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}/`;
  async function open(query = "") {
    await page.goto(base + query);
    await page.locator("[data-progress-workspace]").waitFor();
  }
  async function fit(name) {
    ensure(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
      "Horizontal overflow: " + name,
    );
    ensure(
      !/NaN|Infinity/.test(await page.locator("[data-progress-workspace]").textContent()),
      "Invalid numeric output",
    );
    await page.screenshot({ path: path.join(work, name + ".png"), fullPage: true });
    views.push(name);
  }
  for (const [width, height] of [
    [320, 640],
    [390, 740],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await open();
    await page.getByText("74 min", { exact: true }).waitFor();
    ensure(
      (await page.locator("[data-progress-period]").getAttribute("data-progress-period")) === "7",
      "Wrong default range",
    );
    await fit(`postep-${width}x${height}`);
  }
  await page.setViewportSize({ width: 390, height: 740 });
  await open();
  ensure(
    (await page.getByRole("link", { name: /Otwórz plan:/ }).getAttribute("href")) === "/plan",
    "Plan shortcut points to the wrong screen",
  );
  ensure(
    (
      await page.getByRole("link", { name: "Uzupełnij RPE →", exact: true }).getAttribute("href")
    ).includes("/sesja/2026-10-31?slot=1#session-completion-two"),
    "Missing-RPE link lost the session identity",
  );
  await page.getByRole("button", { name: "Pokaż treningi z tego okresu", exact: true }).click();
  ensure(
    (await page.locator("article").count()) === 3,
    "Time shortcut did not open the selected period",
  );
  ensure(
    (
      await page
        .getByRole("link", { name: "Otwórz trening: two", exact: true })
        .getAttribute("href")
    ).includes("/sesja/2026-10-31?slot=1#session-completion-two"),
    "History row opens a different session",
  );
  await page.getByRole("tab", { name: "Podsumowanie", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż RPE z tego okresu", exact: true }).click();
  ensure(
    (await page.locator("article").count()) === 3,
    "RPE shortcut did not open its source sessions",
  );
  await page.getByRole("button", { name: "Brak RPE", exact: true }).click();
  ensure(
    (await page.locator("article").count()) === 1,
    "RPE shortcut did not select missing assessments",
  );
  await fit("sesje-bez-rpe");
  await page.getByRole("tab", { name: "Podsumowanie", exact: true }).click();
  await page.getByRole("button", { name: "28 dni", exact: true }).click();
  await page.getByText("134 min", { exact: true }).waitFor();
  ensure(
    (await page.getByRole("img", { name: /Tydzień od/ }).count()) === 4,
    "Expected four weekly load bars",
  );
  await fit("postep-28-dni");
  await page.getByRole("button", { name: "7 dni", exact: true }).click();
  await page.locator("[data-qa-correction]").click();
  await page.getByText("62 min", { exact: true }).waitFor();
  ensure(
    (
      await page.getByRole("heading", { name: "Obciążenie treningowe" }).locator("..").textContent()
    ).includes("128"),
    "Correction did not update load",
  );
  await fit("korekta-zapisu");
  await page.getByText("Pomiary Lab i trening IQ", { exact: true }).click();
  await page.locator("[data-progress-measurements]").waitFor();
  ensure(
    (
      await page
        .getByRole("link", { name: /Otwórz historię Lab:/ })
        .first()
        .getAttribute("href")
    ).includes("/lab?view=history"),
    "Lab result link does not open saved history",
  );
  await page.getByText("Zmiana zapisu:", { exact: false }).waitFor();
  ensure(
    (await page.getByRole("region", { name: "Trening IQ" }).textContent()).includes(
      "Przećwiczone akcje: 1",
    ),
    "Missing validated IQ practice",
  );
  await fit("lab-i-iq");
  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  ensure(
    (await page
      .getByRole("tab", { name: "Historia", exact: true })
      .getAttribute("aria-selected")) === "true",
    "Keyboard history tab failed",
  );
  await fit("historia-zapisow");
  await open("?case=history");
  await page.getByRole("tab", { name: "Historia", exact: true }).click();
  ensure((await page.locator("article").count()) === 20, "Unbounded first history page");
  await page.getByRole("button", { name: "Pokaż kolejne 20", exact: true }).click();
  ensure((await page.locator("article").count()) === 40, "Pagination failed");
  await page.getByRole("button", { name: "Mecz", exact: true }).click();
  ensure((await page.locator("article").count()) === 15, "Match filter failed");
  await fit("historia-filtrowana");
  await open("?case=empty");
  await fit("postep-bez-danych");
  ensure(!errors.length, errors.join("; "));
  await fs.writeFile(
    path.join(work, "wynik.json"),
    JSON.stringify(
      {
        passed: true,
        views,
        inputs:
          "authored isolated records, actual React/CSS; no account/backend or athletic accuracy validation",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, views }));
} catch (error) {
  await fs.writeFile(
    path.join(work, "wynik.json"),
    JSON.stringify({ passed: false, message: error.message, errors, views }, null, 2),
  );
  await page?.screenshot({ path: path.join(work, "blad.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
