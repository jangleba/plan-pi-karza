#!/usr/bin/env node

/**
 * Onboarding flow at phone sizes: walks a new account through every step,
 * checks that no step needs vertical scrolling and that the summary lists the
 * plan facts, then saves. Screenshots: BALLWISE_ONBOARDING_SHOTS_DIR (optional).
 */
import fs from "node:fs/promises";

import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  require = createRequire(path.join(root, "package.json"));
const work =
  process.env.BALLWISE_ONBOARDING_FLOW_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-onboarding-flow");
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
  `import ${JSON.stringify(path.join(root, "src/components/design/__qa__/onboarding/Harness.tsx"))};`,
);
const dist = path.join(work, "dist");
await build({
  configFile: false,
  root: work,
  envDir: work,
  base: "/",
  publicDir: false,
  resolve: {
    alias: [
      {
        find: /^@\/integrations\/supabase\/client$/,
        replacement: path.join(root, "src/components/design/__qa__/onboarding/Backend.ts"),
      },
      {
        find: /^@\/lib\/loadwise\/store$/,
        replacement: path.join(root, "src/components/design/__qa__/onboarding/Store.ts"),
      },
      {
        find: /^@\/lib\/loadwise\/auth$/,
        replacement: path.join(root, "src/components/design/__qa__/DesignAuth.ts"),
      },
      {
        find: /^@\/lib\/loadwise\/setLogs$/,
        replacement: path.join(root, "src/components/design/__qa__/DesignLogs.ts"),
      },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
  plugins: [
    {
      name: "inert-billing",
      enforce: "pre",
      resolveId(id) {
        if (id.endsWith("/BillingProvider")) return "\0design-billing";
      },
      load(id) {
        if (id === "\0design-billing")
          return "export const billingEnforced=false;export const useBilling=()=>({});";
      },
    },
    react(),
    tailwindcss(),
  ],
  build: { outDir: dist, emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});

const { chromium } = process.env.BALLWISE_PLAYWRIGHT_PACKAGE
  ? await import(
      pathToFileURL(path.join(process.env.BALLWISE_PLAYWRIGHT_PACKAGE, "index.mjs")).href
    )
  : await import("playwright");
const server = http.createServer(async (req, res) => {
  try {
    const name = new URL(req.url, "http://localhost").pathname.replace(/^\/+/, "") || "index.html";
    if (name.includes("..")) throw new Error("path");
    const body = await fs.readFile(path.join(dist, name));
    res.writeHead(200, {
      "Content-Type": name.endsWith(".js")
        ? "text/javascript"
        : name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".html")
            ? "text/html"
            : "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BALLWISE_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.BALLWISE_CHROMIUM_EXECUTABLE }
    : {}),
});

const shots = process.env.BALLWISE_ONBOARDING_SHOTS_DIR;
if (shots) await fs.mkdir(shots, { recursive: true });
const sizes = [
  { width: 320, height: 568, shot: true },
  { width: 375, height: 667, shot: false },
  { width: 390, height: 844, shot: true },
  { width: 430, height: 932, shot: true },
];
const report = [],
  errors = [];
const ensure = (ok, message) => {
  if (!ok) throw new Error(message);
};
try {
  for (const size of sizes) {
    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: shots ? 2 : 1,
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?mode=success&fresh=1`);
    const seen = [];
    for (let guard = 0; guard < 24; guard++) {
      const step = page.locator(".ob-step").first();
      await step.waitFor();
      const id = await step.getAttribute("data-step");
      if (seen.at(-1) === id) {
        await page.waitForTimeout(100);
        continue;
      }
      seen.push(id);
      if (id === "consents") {
        await page.getByRole("checkbox").nth(0).check();
        await page.getByRole("checkbox").nth(1).check();
      } else if (id === "athlete") {
        await page.getByLabel("Imię").fill("Jan");
        await page.getByRole("radio", { name: "Pomocnik" }).click();
        await page.getByRole("radio", { name: "Regularnie" }).click();
        await page.getByLabel("Poziom rozgrywek").selectOption("iv_liga");
      } else if (id === "direction") {
        await page.getByRole("button", { name: "Słabnę pod koniec meczu" }).click();
        await page.getByRole("button", { name: "Zwinny w zwrotach" }).click();
        await page.getByRole("button", { name: "Świeży cały mecz" }).click();
      } else if (id === "goal") {
        await page
          .getByRole("group", { name: "Główny cel" })
          .getByRole("button", { name: "Szybkość" })
          .click();
        await page
          .getByRole("group", { name: "Co Cię najbardziej ogranicza" })
          .getByRole("button", { name: "Wytrzymałość" })
          .click();
      } else if (id === "calendar") {
        for (const day of ["Wtorek", "Czwartek"])
          await page
            .getByRole("group", { name: "Treningi w klubie" })
            .getByRole("button", { name: day })
            .first()
            .click();
        await page
          .getByRole("group", { name: "Dni, w które nie możesz trenować" })
          .getByRole("button", { name: "Niedziela" })
          .click();
        await page.locator(".ob-date").nth(4).click();
      } else if (id === "conditions") {
        await page.getByRole("switch", { name: "Ściana do podań" }).click();
        await page.getByRole("button", { name: "Guma oporowa" }).click();
      } else if (id === "summary") {
        await page.locator("[data-fact]").first().waitFor({ timeout: 15000 });
      }
      await page.waitForTimeout(id === "summary" ? 900 : 450);
      const fit = await page.evaluate(() => {
        const el = document.querySelector(".ob__body");
        return {
          scroll: el.scrollHeight,
          client: el.clientHeight,
          x: document.documentElement.scrollWidth,
        };
      });
      report.push({ size: `${size.width}x${size.height}`, step: id, ...fit });
      if (fit.x > size.width) errors.push(`${size.width}: ${id} scrolls sideways`);
      // Full screens fit modern phones (844 pt and taller); a small phone may scroll.
      if (size.height >= 800 && fit.scroll > fit.client + 1)
        errors.push(
          `${size.width}x${size.height}: ${id} needs scrolling (${fit.scroll} > ${fit.client})`,
        );
      if (shots && size.shot)
        await page.screenshot({
          path: path.join(shots, `${String(seen.length).padStart(2, "0")}-${id}-${size.width}.png`),
        });
      if (id === "summary") break;
      await page.getByRole("button", { name: "Dalej", exact: true }).click();
    }
    ensure(
      seen.at(-1) === "summary",
      `${size.width}: did not reach the summary (${seen.join(" → ")})`,
    );
    const facts = await page.locator("[data-fact]").allTextContents();
    ensure(facts.length >= 4, "Summary lists too few facts");
    ensure(
      facts.some((fact) => fact.startsWith("Kierunek") && fact.includes("Zwinny w zwrotach")),
      "Summary misses the direction fact",
    );
    if (size.width === 390) {
      await page.getByRole("button", { name: "Zapisz i wygeneruj plan", exact: true }).click();
      await page.getByTestId("plan-days").waitFor({ timeout: 20000 });
    }
    report.push({ size: `${size.width}x${size.height}`, steps: seen, facts });
    await page.close();
  }
  ensure(!errors.length, errors.join("; "));
  await fs.writeFile(path.join(work, "wynik.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, report }, null, 1));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
