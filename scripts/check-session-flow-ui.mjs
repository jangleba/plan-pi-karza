#!/usr/bin/env node
/** Real app screens, inert account adapters and authored data; presentation/interaction verification. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  require = createRequire(path.join(root, "package.json"));
const work = path.resolve(
  process.env.BALLWISE_SESSION_UI_DIR ||
    path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-session-flow-66"),
);
const qa = path.join(root, "src/components/loadwise/session/__qa__");
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
  `import ${JSON.stringify(path.join(qa, "SessionFlowHarness.tsx"))};`,
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
        replacement: path.join(qa, "SessionFlowStore.ts"),
      },
      {
        find: /^@\/lib\/loadwise\/auth$/,
        replacement: path.join(root, "src/components/design/__qa__/DesignAuth.ts"),
      },

      {
        find: /^@\/integrations\/supabase\/client$/,
        replacement: path.join(qa, "SessionFlowClient.ts"),
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
const base = `http://127.0.0.1:${server.address().port}/`;
const b = await chromium.launch({
  headless: true,
  ...(process.env.BALLWISE_CHROMIUM_PATH
    ? { executablePath: process.env.BALLWISE_CHROMIUM_PATH }
    : {}),
});
const reports = [],
  errors = [];

try {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // Animation material is loaded only on demand ("Jak wykonać"), never with the session.
  const animationRequests = [];
  p.on("request", (r) => {
    if (/\/technique\/animations\/(?!thumbs\/)/.test(new URL(r.url()).pathname))
      animationRequests.push(r.url());
  });
  for (const width of [430, 390, 320])
    for (const kind of [
      "strength",
      "sprint",
      "cod",
      "run",
      "intervals",
      "mas",
      "mobility",
      "football",
      "club",
      "match",
    ])
      for (const phase of ["preview", "active"]) {
        await p.setViewportSize({ width, height: 844 });
        await p.goto(base + `?kind=${kind}&phase=${phase}`);
        await p.waitForFunction(() => window.__sessionAudit && document.querySelector("h1"));
        await p.waitForTimeout(250);
        const r = await p.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          overflow: document.documentElement.scrollWidth - innerWidth,
          runnerCards: document.querySelectorAll(".bw-runner-card").length,
          smallTargets: [...document.querySelectorAll(".bw-runner button, .bw-session-head button")]
            .map((el) => el.getBoundingClientRect())
            .filter((box) => box.width > 0 && (box.width < 44 || box.height < 44)).length,
          text: document.body.innerText,
        }));
        reports.push({ width, kind, phase, ...r });
        if (r.overflow > 1) throw new Error(`Overflow ${width} ${kind}: ${r.overflow}`);
        if (r.smallTargets) throw new Error(`Touch target < 44 px ${width} ${kind} ${phase}`);
        if (/zapis będzie dostępny po rozpoczęciu/i.test(r.text))
          throw new Error(`Inactive-recording notice in ${kind} ${phase}`);
        if (width === 390) await p.waitForTimeout(1000);
        await p.screenshot({ path: path.join(work, `${kind}-${phase}-${width}.png`) });
      }
  if (animationRequests.length)
    throw Error("Animations loaded before opening: " + animationRequests.slice(0, 3).join(", "));
  await p.setViewportSize({ width: 390, height: 844 });
  // Start from the preview goes to the first open task, warm-up included.
  await p.goto(base + "?kind=strength&phase=preview");
  await p.getByRole("button", { name: /^Rozpocznij/ }).click();
  await p.locator(".bw-runner-card").first().waitFor();
  const eyebrow = await p.locator(".bw-runner-eyebrow").first().innerText();
  if (!/Rozgrzewka|Przygotowanie/.test(eyebrow))
    throw Error("Start skipped the warm-up: " + eyebrow);
  reports.push({ case: "start-to-warmup", passed: true });
  await p.goto(base + "?kind=strength&phase=active");
  await p.getByRole("button", { name: "Jak wykonać", exact: false }).first().click();
  await p.locator(".bw-runner-card iframe").first().waitFor();
  if (!animationRequests.length) throw Error("Opening „Jak wykonać” did not load the animation");
  await p.waitForTimeout(1000);
  await p.screenshot({ path: work + "/how-to-open.png" });
  await p.getByRole("button", { name: "Jak wykonać", exact: false }).first().click();
  if (await p.locator(".bw-runner-card iframe").count())
    throw Error("Collapsed „Jak wykonać” kept the player running");
  reports.push({ case: "how-to-on-demand", passed: true });
  // A completion mark survives a reload and does not change the prescription.
  await p.goto(base + "?kind=football&phase=active");
  const confirm = p
    .locator(".bw-runner-card button")
    .filter({ hasText: /^(Wykonane|Seria wykonana|Odcinek wykonany|Lewa wykonana|Prawa wykonana)/ })
    .first();
  if (!(await confirm.count()))
    await p
      .getByRole("button", { name: /bez odliczania/ })
      .first()
      .click();
  else await confirm.click();
  const counted = () =>
    p.waitForFunction(() =>
      /Wykonane\s*1\s*z/.test(document.querySelector(".bw-runner-count")?.textContent ?? ""),
    );
  // A multi-set task needs every set; keep confirming until the exercise is marked.
  for (let i = 0; i < 8; i += 1) {
    const marked = await p.evaluate(() =>
      /Wykonane\s*1\s*z/.test(document.querySelector(".bw-runner-count")?.textContent ?? ""),
    );
    if (marked) break;
    const more = p
      .locator(".bw-runner-card button")
      .filter({ hasText: /wykonan|bez odliczania/i })
      .first();
    if (!(await more.count())) break;
    await more.click();
  }
  await counted();
  await p.reload();
  await counted();
  reports.push({ case: "completion-reload", passed: true });
  // Import a 12-minute run, then explicitly rate and finish the entire session.
  await p.goto(base + "?kind=run&phase=active");
  await p.locator("#run-tracker-title").waitFor();
  const points = Array.from(
    { length: 13 },
    (_, i) =>
      `<trkpt lat="${50 + i * 0.001}" lon="19"><time>2026-11-02T10:${String(i).padStart(2, "0")}:00Z</time></trkpt>`,
  ).join("");
  await p.locator('input[type="file"]').setInputFiles({
    name: "12-minut.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(
      `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${points}</trkseg></trk></gpx>`,
    ),
  });
  await p.getByRole("button", { name: "Dalej · podsumowanie", exact: true }).click();
  const sheet = p.getByRole("dialog");
  await sheet.waitFor();
  const duration = await p
    .getByRole("spinbutton", { name: "Czas całej sesji w minutach", exact: true })
    .inputValue();
  if (duration !== "12") throw Error("Planned duration leaked into summary: " + duration);
  if (!(await p.getByRole("button", { name: "Zapisz trening", exact: true }).isDisabled()))
    throw Error("Unselected RPE was saveable");
  await p.getByRole("button", { name: "RPE 7", exact: true }).click();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: work + "/run-summary.png" });
  await p.getByRole("button", { name: "Zapisz trening", exact: true }).click();
  await p.getByRole("tab", { name: "Historia", exact: true }).waitFor();
  if (
    (await p.getByRole("tab", { name: "Historia", exact: true }).getAttribute("aria-selected")) !==
    "true"
  )
    throw Error("Did not navigate to history");
  const receipts = await p.evaluate(() =>
    window.__sessionAudit.receipts
      .filter((r) => r.kind === "complete")
      .map((r) => ({ rpe: r.rpe, duration: r.details.durationMin })),
  );
  if (receipts.at(-1)?.rpe !== 7 || receipts.at(-1)?.duration !== 12)
    throw Error("Wrong completion payload");
  await p.waitForTimeout(1000);
  await p.screenshot({ path: work + "/history-after-run.png" });
  reports.push({ case: "run-finish-history", receipts, passed: true });
  // Actual gym entry -> reload -> completed session -> lazy results in Progress.
  await p.goto(base + "?kind=strength&phase=active");
  const kg = p.getByRole("textbox", { name: "Seria 1: ciężar w kg", exact: true });
  for (let i = 0; i < 30 && !(await kg.count()); i += 1)
    await p.getByRole("button", { name: "Następne", exact: false }).click();
  await kg.fill("60");
  await p.getByRole("textbox", { name: "Seria 1: powtórzenia", exact: true }).fill("5");
  await p.getByRole("textbox", { name: "Seria 1: zapas powtórzeń", exact: true }).fill("3");
  await p.getByRole("button", { name: "Zatwierdź serię 1", exact: true }).click();
  await p.locator(".bw-rest-card").waitFor();
  await p.getByRole("button", { name: "Seria 1 zapisana", exact: true }).waitFor();
  await p.waitForFunction(() =>
    JSON.parse(localStorage.getItem("session66:qa-rows") || "[]").some(
      (r) => r.weight_kg === 60 && r.reps === 5 && r.rir === 3,
    ),
  );
  await p.reload();
  if ((await kg.inputValue()) !== "60") throw Error("Gym result lost on reload");
  // Correction keeps the same set number (no second log for set 1).
  await p.getByRole("textbox", { name: "Seria 1: powtórzenia", exact: true }).fill("6");
  await p.getByRole("button", { name: "Zapisz poprawkę serii 1", exact: true }).click();
  await p.waitForFunction(() =>
    JSON.parse(localStorage.getItem("session66:qa-rows") || "[]").some(
      (r) => r.weight_kg === 60 && r.reps === 6,
    ),
  );
  await p.getByRole("textbox", { name: "Seria 1: powtórzenia", exact: true }).fill("5");
  await p.getByRole("button", { name: "Zapisz poprawkę serii 1", exact: true }).click();
  await p.getByRole("button", { name: "Seria 1 zapisana", exact: true }).waitFor();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: work + "/strength-set.png" });
  await p.getByRole("button", { name: "Cały plan", exact: false }).click();
  await p.getByRole("button", { name: "Zakończ trening teraz", exact: true }).click();
  await p.getByRole("button", { name: "RPE 5", exact: true }).click();
  await p.getByRole("button", { name: "Zapisz trening", exact: true }).click();
  await p.locator("summary").filter({ hasText: "Wyniki sesji" }).click();
  await p.getByText("60 kg × 5 · zapas 3", { exact: false }).waitFor();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: work + "/history-strength-results.png" });
  reports.push({ case: "strength-save-reload-history", passed: true });
  // Timer-only work records time, never phone GPS distance or sprint accuracy.
  await p.goto(base + "?kind=run&phase=active");
  await p.getByRole("button", { name: "Bez GPS", exact: true }).click();
  await p.getByRole("button", { name: "Start biegu", exact: true }).click();
  await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Zakończ bieg", exact: true }).click();
  await p.getByRole("dialog").waitFor();
  const clockRows = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("session66:qa-rows") || "[]").filter(
      (r) => r.metric_kind === "run_clock_partial",
    ),
  );
  if (
    !clockRows.some(
      (r) => r.metric_value > 0 && r.metric_value < 10 && r.weight_kg === null && r.reps === null,
    )
  )
    throw Error("Timer did not persist observed seconds");
  reports.push({ case: "timer-only-observed-seconds", passed: true });
  if (errors.length) throw Error(errors.join("; "));
} catch (error) {
  await b
    .contexts()[0]
    ?.pages()[0]
    ?.screenshot({ path: work + "/failure.png" });
  throw error;
} finally {
  await fs.writeFile(work + "/ui-results.json", JSON.stringify({ reports, errors }, null, 2));
  await b.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify({ passed: true, reports: reports.length }));
