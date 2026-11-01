#!/usr/bin/env node
/** Real Fuel React/CSS browser flows on isolated local data; no accounts or nutrition accuracy certification. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const esbuild = require("esbuild");
const work =
  process.env.BALLWISE_FUEL_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-fuel-ui-26");
await fs.mkdir(work, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(root, "src/components/fuel/__qa__/FuelHarness.tsx")],
  outfile: path.join(work, "lab-ui.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
  plugins: [
    {
      name: "fuel-qa-adapters",
      setup(build) {
        build.onResolve(
          { filter: /(?:^|\/)(nativeReminders|deliverExportFile)(?:\.tsx?)?$/ },
          (args) => ({ path: path.basename(args.path).replace(/\.tsx?$/, ""), namespace: "qa" }),
        );
        build.onLoad({ filter: /.*/, namespace: "qa" }, (args) => ({
          contents:
            args.path === "nativeReminders"
              ? "export const nativeFuelRemindersAvailable=()=>false;export const enableFuelReminderPermission=async()=>false;"
              : "export const deliverExportFile=async()=> 'delivered';",
          loader: "js",
        }));
      },
    },
  ],
});
const publicDir = path.join(root, ".output/public");
const assets = await fs.readdir(path.join(publicDir, "assets"));
const cssFiles = assets.filter((name) => /^styles-.*\.css$/.test(name));
if (!cssFiles.length) throw new Error("Build the web application before Fuel visual QA.");
// Reuse the built application palette/fonts, followed by the actual component CSS.
for (const prefix of ["index-", "ballwise-visual-system-", "_tabs-"]) {
  cssFiles.push(...assets.filter((name) => name.startsWith(prefix) && name.endsWith(".css")));
}
let css = (
  await Promise.all(
    cssFiles.map((name) => fs.readFile(path.join(publicDir, "assets", name), "utf8")),
  )
).join("\n");
const urls = [
  ...new Set(
    [...css.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)]
      .map((m) => m[1])
      .filter((url) => !url.startsWith("data:") && !/^[a-z]+:/i.test(url)),
  ),
];
for (const url of urls) {
  const asset = url.startsWith("/")
    ? path.join(publicDir, url.slice(1))
    : path.resolve(publicDir, "assets", url);
  try {
    const data = await fs.readFile(asset);
    css = css.replaceAll(url, "data:application/octet-stream;base64," + data.toString("base64"));
  } catch {
    /* Unused feature assets are not needed by this component harness. */
  }
}
css += "\n" + (await fs.readFile(path.join(work, "lab-ui.css"), "utf8"));
css +=
  "\nbody{margin:0;background:var(--background);color:var(--foreground)}.fuel-qa-banner{font-size:11px;padding:12px 20px;color:var(--muted-foreground);border-bottom:1px solid var(--border)}";
const js = (await fs.readFile(path.join(work, "lab-ui.js"), "utf8")).replaceAll(
  "</script",
  "<\\/script",
);
await fs.writeFile(
  path.join(work, "index.html"),
  '<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    css +
    '</style><div id="root"></div><script>' +
    js +
    "</script></html>",
);
if (process.argv.includes("--build-only")) {
  console.log(
    JSON.stringify({
      built: work,
      inputs: "isolated local Fuel fixtures; real React/CSS components",
    }),
  );
  process.exit(0);
}

const packagePath = process.env.BALLWISE_PLAYWRIGHT_PACKAGE;
const { chromium } = packagePath
  ? await import(pathToFileURL(path.join(packagePath, "index.mjs")).href)
  : await import("playwright");
const browser = await chromium.launch({ headless: true });
const views = [],
  errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const ensure = (v, m) => {
    if (!v) throw new Error(m);
  };
  async function goto(query = "") {
    await page.goto(pathToFileURL(path.join(work, "index.html")).href + query);
    await page.locator(".fuel-v4-hero").waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  async function snap(name) {
    ensure(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
      "Horizontal overflow " + name,
    );
    await page.screenshot({
      path: path.join(work, name + ".png"),
      fullPage: !(await page.getByRole("dialog").count()),
    });
    views.push(name);
  }
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await goto();
    await snap("fuel-" + width + "x" + height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await goto("?mode=adjusted");
  await page.getByRole("button", { name: "Zjadłem", exact: true }).click();
  ensure(
    await page.evaluate(() => {
      const e = window.__fuelQA.read().entries[0];
      return e.lines.every((l, i) => l.grams === window.__fuelQA.baseLines[i].grams * 2);
    }),
    "Adjusted portions lost",
  );
  const mealTitle = await page.evaluate(() => window.__fuelQA.read().entries[0].title);
  await page
    .locator(".fuel-recent-meal")
    .getByText(mealTitle, { exact: false })
    .waitFor({ timeout: 1500 });
  await page.getByRole("button", { name: /Historia/ }).click();
  await snap("historia-porcje");
  await page.getByRole("button", { name: "Było ciężko", exact: true }).click();
  ensure(
    (await page.evaluate(() => window.__fuelQA.read().entries[0].feedback)) === "heavy",
    "Tolerance feedback not saved",
  );
  await goto("?mode=completed");
  await page.getByRole("button", { name: "Zmień", exact: true }).click();
  await page.getByRole("button", { name: "Zwykły posiłek", exact: true }).click();
  ensure(
    (await page.locator(".fuel-v4-time-value strong").textContent()) === "Zwykły posiłek",
    "Ordinary meal mode failed",
  );
  await goto();
  await page.locator(".fuel-v4-ingredient-change").first().click();
  await page.locator(".fuel-swap-list").waitFor();
  await snap("zamiana-skladnika");
  await goto();
  await page.getByRole("button", { name: /Jutro mecz/ }).click();
  await page.getByRole("button", { name: "Zapisz zestaw na później", exact: true }).click();
  ensure(
    await page.evaluate(
      () => window.__fuelQA.read().entries[0].contextKey === window.__fuelQA.tomorrowKey,
    ),
    "Tomorrow packing saved to today",
  );
  await goto();
  await page.getByText("Napoje · dodaj wypitą ilość", { exact: true }).click();
  await page.getByRole("button", { name: "Zapisz napój", exact: true }).click();
  ensure(
    (await page.evaluate(() => window.__fuelQA.read().drinks[0].ml)) === 250,
    "Drink not saved",
  );
  await page
    .getByText("Napoje · 250 ml zapisane do tej sesji dziś", { exact: true })
    .waitFor({ timeout: 1500 });
  await page.mouse.move(0, 0);
  await page
    .getByText("Zapisano wypity napój.", { exact: true })
    .waitFor({ state: "hidden", timeout: 7000 });
  await snap("napoje");
  await page.getByText("Twój plan · Teraz / Zabierz / Po sesji", { exact: true }).click();
  await snap("plan-sesji");
  ensure(
    (await page.evaluate(() => window.__fuelQA.allergenVerdict)) === "Sprawdź ograniczenia",
    "Declared allergen conflict ignored",
  );
  ensure(!errors.length, "Browser errors: " + errors.join("; "));
  await fs.writeFile(
    path.join(work, "wynik.json"),
    JSON.stringify(
      {
        passed: true,
        views,
        inputs: "isolated local fixtures; real Fuel React/CSS; not individual nutrition validation",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, views }));
} finally {
  await browser.close();
}
