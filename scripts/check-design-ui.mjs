#!/usr/bin/env node
/** Real app screens, inert account adapters and authored data; presentation/interaction verification. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  require = createRequire(path.join(root, "package.json"));
const work =
  process.env.BALLWISE_DESIGN_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-design-ui-37");
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
  `import ${JSON.stringify(path.join(root, "src/components/design/__qa__/DesignHarness.tsx"))};`,
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
        find: /^@\/lib\/loadwise\/store$/,
        replacement: path.join(root, "src/components/design/__qa__/DesignStore.ts"),
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
  ".svg": "image/svg+xml",
  ".png": "image/png",
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
let browser;
const errors = [],
  views = [];
const ensure = (v, m) => {
  if (!v) throw Error(m);
};
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BALLWISE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.BALLWISE_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}/`;
  async function snap(name) {
    ensure(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
      "Horizontal overflow: " + name,
    );
    await page.screenshot({ path: path.join(work, name + ".png"), fullPage: true });
    views.push(name);
  }
  if (!process.argv.includes("--motion-only")) {
    for (const [width, height] of [
      [320, 640],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      for (const screen of [
        "start",
        "plan",
        "profile",
        "auth",
        "onboarding",
        "lab",
        "sprint",
        "strength",
      ]) {
        await page.goto(base + "?screen=" + screen);
        await page
          .locator(
            '[data-design-screen="' +
              screen +
              '"] h1, [data-design-screen="' +
              screen +
              '"] h2, .onboarding-premium, .auth-premium form',
          )
          .first()
          .waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (screen === "lab") await page.locator(".bl-test-card").first().waitFor();
        await snap(screen + "-" + width);
        if (screen === "auth" && width === 390) {
          await page
            .getByRole("button", { name: "Masz już konto? Zaloguj się", exact: true })
            .click();
          await page.getByRole("button", { name: "Zaloguj się", exact: true }).waitFor();
          await snap("auth-login");
          await page.getByRole("button", { name: "Nie pamiętam hasła", exact: true }).click();
          await page.getByRole("button", { name: "Wyślij link", exact: true }).waitFor();
          await snap("auth-reset");
        }
        if (screen === "start" && width === 390) {
          ensure(
            (await page.getByRole("button", { name: /Samopoczucie|Oceń samopoczucie/ }).count()) ===
              0,
            "Start still asks health questions",
          );
          const choose = async (name) => {
            await page.getByRole("button", { name: /Plan na dziś/ }).click();
            if (await page.getByRole("button", { name: "Chcę coś zmienić", exact: true }).count())
              await page.getByRole("button", { name: "Chcę coś zmienić", exact: true }).click();
            await page.getByRole("button", { name, exact: true }).click();
          };
          await choose("Mniej serii lub odcinków");
          await page.waitForFunction(
            () => window.__startQA.plan()[0].sections.main[0].prescription === "3 × 8",
          );
          ensure(
            (await page.evaluate(() => window.__startQA.plan()[0].intensity)) === "wysoka",
            "Shorter strength changes intensity metadata",
          );
          await snap("start-mniej-serii");
          await choose("Mniej serii lub odcinków");
          ensure(
            (await page.evaluate(
              () => window.__startQA.plan()[0].sections.main[0].prescription,
            )) === "3 × 8",
            "Repeated choice compounds the reduction",
          );
          const beforeFuture = await page.evaluate(() =>
            JSON.stringify(window.__startQA.plan().slice(1)),
          );
          await choose("Pomiń lub zaproponuj inny termin");
          await page.getByRole("dialog", { name: "Chcesz przenieść tę sesję?" }).waitFor();
          ensure(
            (await page.evaluate(() => JSON.stringify(window.__startQA.plan().slice(1)))) ===
              beforeFuture,
            "Skip silently modifies another day",
          );
          await page.getByRole("button", { name: "Nie nadrabiaj", exact: true }).click();
          ensure(
            (await page.evaluate(() => window.__startQA.plan()[0].durationMin)) === 0,
            "Skip leaves training active",
          );
          const record = await page.evaluate(() => {
            const k = Object.keys(localStorage).find(
              (k) => k.includes("daily-plan-checkin") && k.endsWith(":2026-11-02"),
            );
            return JSON.parse(localStorage.getItem(k));
          });
          ensure(
            Object.keys(record).sort().join(",") === "completedAt,date,primaryAction,secondAction",
            "Check-in stores additional personal observations",
          );
          await snap("start-pominiety-bez-odrabiania");
          await page.goto(base + "?screen=start");
          await page.locator(".bw-home-checks").waitFor();
          await choose("Pomiń lub zaproponuj inny termin");
          await page.getByRole("button", { name: /polecane/ }).click();
          await page.waitForFunction(() => window.__startQA.changes.length === 2);
          ensure(
            (await page.evaluate(
              () => window.__startQA.plan().filter((day) => day.durationMin > 0).length,
            )) === 1,
            "Move duplicates the removed training",
          );
          await snap("start-przeniesienie-po-akceptacji");
          await page.goto(base + "?screen=start&locked=1");
          await page.locator(".bw-home-checks").waitFor();
          await choose("Mniej serii lub odcinków");
          ensure(
            (await page.evaluate(() => window.__startQA.changes.length)) === 0,
            "Started training was changed",
          );
          views.push("start-chroni-rozpoczeta-sesje");
          await page.goto(base + "?screen=start&locked=1&second=1");
          await page.locator(".bw-home-checks").waitFor();
          const firstBefore = await page.evaluate(() =>
            JSON.stringify({ ...window.__startQA.plan()[0], secondSession: null }),
          );
          await page.getByRole("button", { name: /Plan na dziś/ }).click();
          await page.getByRole("button", { name: "Trenuję według planu", exact: true }).click();
          await page.getByRole("button", { name: "Tak", exact: true }).click();
          await page.getByRole("button", { name: "Chcę coś zmienić", exact: true }).click();
          await page.getByRole("button", { name: "Druga sesja lżej", exact: true }).click();
          await page.waitForFunction(
            () =>
              window.__startQA.plan()[0].secondSession.sections.main[0].prescription === "15 min",
          );
          ensure(
            (await page.evaluate(() =>
              JSON.stringify({ ...window.__startQA.plan()[0], secondSession: null }),
            )) === firstBefore,
            "Second-session change rewrites the executed first session",
          );
          views.push("start-druga-sesja-niezalezna");
        }
        if (screen === "plan" && width === 390) {
          await page
            .getByRole("button", { name: /Następny tydzień/ })
            .first()
            .click();
          await snap("plan-kolejny-tydzien");
        }
        if (screen === "lab" && width === 390) {
          const target = page.getByRole("button", { name: "Rozpocznij CMJ", exact: true });
          await target.focus();
          await target.click();
          await page.getByRole("dialog").waitFor();
          await snap("lab-przygotowanie");
          await page.keyboard.press("Escape");
          await page.waitForFunction(
            () => document.activeElement?.getAttribute("aria-label") === "Rozpocznij CMJ",
          );
          await target.click();
          await page.getByRole("button", { name: /Przejdź do pomiaru/ }).click();
          await page.locator(".bl-session-header").waitFor();
          await snap("lab-pomiar");
        }
        if (screen === "sprint" && width === 390) {
          await page.locator(".bw-skip-title-trigger").first().click();
          const element = await page
            .locator(".bw-exercise-panel:not([hidden]) iframe")
            .elementHandle();
          const frame = await element.contentFrame();
          await frame.waitForFunction(() => window.BWPlayer?.ready);
          ensure((await element.boundingBox()).height < 600, "Inline animation is too tall");
          await frame.getByRole("button", { name: "Odtwórz", exact: true }).click();
          await frame.waitForFunction(() => window.BWPlayer.getState().playing);
          await page.locator(".bw-skip-title-trigger").nth(1).click();
          await frame.waitForFunction(() => !window.BWPlayer.getState().playing);
          ensure(
            (await page.locator(".bw-exercise-panel:not([hidden])").count()) === 1,
            "More than one exercise open",
          );
          await page.locator(".bw-skip-title-trigger").first().click();
          await snap("sprint-szczegoly");
          const preparation = page.locator(".bw-exercise-name").first().locator("..");
          await preparation.click();
          await page
            .locator(".bw-exercise-panel:not([hidden])")
            .getByRole("button", { name: "Start", exact: true })
            .click();
          await page.waitForFunction(
            () =>
              document.querySelector('.bw-exercise-panel:not([hidden]) [role="timer"]')
                ?.textContent !== "01:00",
          );
          const remaining = await page.locator('[role="timer"]').first().textContent();
          await page.locator(".bw-skip-title-trigger").first().click();
          await preparation.click();
          ensure(
            (await page
              .locator('.bw-exercise-panel:not([hidden]) [role="timer"]')
              .textContent()) !== "01:00",
            "Rest reset on folding",
          );
          ensure(remaining !== null, "Rest not started");
          await snap("sprint-zachowana-przerwa");
        }
        if (screen === "strength" && width === 390) {
          const rows = page.locator(".bw-exercise-open");
          await rows.first().click();
          let panel = page.locator(".bw-exercise-panel:not([hidden])");
          await panel.locator(".bw-set-fields input").nth(0).fill("20");
          await panel.locator(".bw-set-fields input").nth(1).fill("8");
          if ((await panel.locator(".bw-set-fields input").count()) > 2)
            await panel.locator(".bw-set-fields input").nth(2).fill("3");
          await rows.nth(1).click();
          await rows.first().click();
          ensure(
            (await panel.locator(".bw-set-fields input").first().inputValue()) === "20",
            "Strength draft lost on folding",
          );
          await panel.getByRole("button", { name: "Zapisz serię", exact: true }).click();
          await rows.first().click();
          panel = page.locator(".bw-exercise-panel:not([hidden])");
          ensure(
            (await panel.getByLabel("Wybierz serię").inputValue()) === "2",
            "Saved set lost after switching exercises",
          );
          await snap("sila-zachowana-seria");
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const screen of ["plan", "profile", "auth", "onboarding", "lab", "strength"]) {
      await page.goto(base + "?screen=" + screen);
      await page.locator("[data-design-screen]").waitFor();
      if (screen === "lab") await page.locator(".bl-test-card").first().waitFor();
      else await page.locator("h1,h2,.auth-premium form,.onboarding-premium").first().waitFor();
      await page.addStyleTag({ content: "html{font-size:200%}" });
      await snap(screen + "-duzy-tekst");
    }
  }
  // Real animated panels: two detents, a drag gesture, retained exit content and focus return.
  const motionContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
    recordVideo: { dir: path.join(work, "motion"), size: { width: 390, height: 844 } },
  });
  const motion = await motionContext.newPage();
  motion.on("pageerror", (e) => errors.push(e.message));
  await motion.goto(base + "?screen=lab");
  const startTest = motion.getByRole("button", { name: "Rozpocznij CMJ", exact: true });
  await startTest.waitFor();
  await startTest.click();
  const panel = motion.locator('.bw-sheet[data-state="open"]');
  await panel.waitFor();
  await motion.waitForTimeout(380);
  ensure(
    Math.abs((await panel.boundingBox()).y - 844 * 0.42) < 4,
    "Panel is not at its medium detent",
  );
  ensure(
    (await panel.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)) === "28px",
    "Rounded sheet missing",
  );
  await panel.getByRole("button", { name: "Rozwiń panel", exact: true }).click();
  await motion.waitForTimeout(380);
  ensure(Math.abs((await panel.boundingBox()).y - 844 * 0.06) < 4, "Panel does not expand");
  await motion.screenshot({ path: path.join(work, "iphone-panel-rozwiniety.png") });
  await panel.getByRole("button", { name: "Zwiń panel do połowy", exact: true }).click();
  await motion.waitForTimeout(380);
  ensure(Math.abs((await panel.boundingBox()).y - 844 * 0.42) < 4, "Panel does not collapse");
  await motion.screenshot({ path: path.join(work, "iphone-panel-polowa.png") });
  const handle = await panel.locator("[data-vaul-handle]").boundingBox();
  await motion.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await motion.mouse.down();
  await motion.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 385, {
    steps: 14,
  });
  await motion.mouse.up();
  await motion.locator('.bw-sheet[data-state="open"]').waitFor({ state: "detached" });
  await motion.waitForTimeout(600);
  ensure(
    await startTest.evaluate((e) => e === document.activeElement),
    "Focus did not return after swipe",
  );
  await startTest.click();
  await motion.waitForTimeout(380);
  await motion.getByRole("button", { name: "Zamknij", exact: true }).click();
  await motion.waitForTimeout(40);
  ensure(
    (await motion.locator('.bw-sheet[data-state="closed"]').count()) === 1,
    "Closing panel is unmounted before its exit animation",
  );
  ensure(
    (await motion.locator(".bw-sheet-title").textContent()) === "CMJ",
    "Closing panel loses its content",
  );
  await motion.waitForTimeout(550);
  ensure(
    await startTest.evaluate((e) => e === document.activeElement),
    "Focus did not return after close",
  );
  ensure(
    await motion.evaluate(() => !["hidden"].includes(document.body.style.overflow)),
    "Page remains scroll-locked",
  );
  const video = motion.video();
  await motionContext.close();
  if (video) await video.saveAs(path.join(work, "iphone-panele.webm"));
  views.push("iphone-panel-dwa-poziomy-gest-zamkniecia-fokus");
  ensure(!errors.length, "Browser errors: " + errors.join("; "));
  await fs.writeFile(
    path.join(work, "wynik.json"),
    JSON.stringify(
      {
        passed: true,
        views,
        inputs:
          "Authored data; actual page React/CSS; auth and billing writes disabled. Does not verify an account or a deployed app.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, views }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
