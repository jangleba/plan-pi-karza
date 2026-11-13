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
  // Animation material is loaded only on demand (the "Technika" tab), never with the session.
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
  await p.getByRole("button", { name: "Jak wykonać?", exact: true }).click();
  await p.locator(".bw-unit-panel iframe").first().waitFor();
  if (!animationRequests.length) throw Error("Opening „Technika” did not load the animation");
  await p.waitForTimeout(1000);
  await p.screenshot({ path: work + "/how-to-open.png" });
  await p.getByRole("button", { name: "Zamknij instrukcję", exact: true }).click();
  if (await p.locator(".bw-unit-panel iframe").count())
    throw Error("Leaving „Technika” kept the player running");
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
  // The exercise view names the progress on its segment bar, the list in its count row.
  const isCounted = () =>
    /Wykonane\s*1\s*z/.test(
      document.querySelector(".bw-runner-segments")?.getAttribute("aria-label") ??
        document.querySelector(".bw-runner-count")?.textContent ??
        "",
    );
  const counted = () => p.waitForFunction(isCounted);
  // A multi-set task needs every set; keep confirming until the exercise is marked.
  for (let i = 0; i < 8; i += 1) {
    const marked = await p.evaluate(isCounted);
    // A rest between bouts takes the screen; the athlete starts the next one.
    const resume = p.locator(".bw-runner-dock .bw-runner-primary");
    if (!marked && (await resume.count())) await resume.click();
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
  await p.getByRole("textbox", { name: "Seria 1: powtórzenia", exact: true }).fill("4");
  // Steppers: one tap adds a repetition.
  await p.getByRole("button", { name: "Seria 1: powtórzenia: więcej", exact: true }).click();
  await p.getByRole("button", { name: "Seria 1: zapas 3", exact: true }).click();
  await p.getByRole("button", { name: "Zatwierdź serię 1", exact: true }).click();
  await p.locator(".bw-rest-screen").waitFor();
  await p.getByText("60 kg × 5", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Rozpocznij kolejną serię", exact: true }).click();
  await p.getByRole("button", { name: "Seria 1 zapisana, popraw", exact: true }).waitFor();
  await p.waitForFunction(() =>
    JSON.parse(localStorage.getItem("session66:qa-rows") || "[]").some(
      (r) => r.weight_kg === 60 && r.reps === 5 && r.rir === 3,
    ),
  );
  // The next set is prefilled from the saved one.
  const kg2 = p.getByRole("textbox", { name: "Seria 2: ciężar w kg", exact: true });
  if ((await kg2.inputValue()) !== "60") throw Error("Next set not prefilled");
  await p.reload();
  if (await p.locator(".bw-rest-screen").count()) throw Error("Closed rest came back after reload");
  if ((await kg2.inputValue()) !== "60") throw Error("Gym result lost on reload");
  // Correction keeps the same set number (no second log for set 1).
  await p.getByRole("button", { name: "Seria 1 zapisana, popraw", exact: true }).click();
  await p.getByRole("textbox", { name: "Seria 1: powtórzenia", exact: true }).fill("6");
  await p.getByRole("button", { name: "Zapisz poprawkę serii 1", exact: true }).click();
  await p.waitForFunction(() =>
    JSON.parse(localStorage.getItem("session66:qa-rows") || "[]").some(
      (r) => r.weight_kg === 60 && r.reps === 6,
    ),
  );
  await p.getByRole("button", { name: "Seria 1 zapisana, popraw", exact: true }).click();
  await p.getByRole("textbox", { name: "Seria 1: powtórzenia", exact: true }).fill("5");
  await p.getByRole("button", { name: "Zapisz poprawkę serii 1", exact: true }).click();
  await p.getByRole("button", { name: "Zatwierdź serię 2", exact: true }).waitFor();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: work + "/strength-set.png" });
  await p.getByRole("button", { name: "Pozostałe ćwiczenia", exact: true }).click();
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

  // The training panel opened from the week: a large bottom sheet with the
  // list, the exercise tabs, and progress plus rest kept across close/reopen.
  const unit = p.locator(".bw-unit-sheet");
  const openUnit = async () => {
    await p.locator(".bw-qa-open-unit").click();
    await unit.locator(".bw-runner").waitFor();
    await p.waitForTimeout(400);
  };
  const unitMetrics = () =>
    unit.evaluate((el) => {
      const scroll = el.querySelector(".bw-sheet-scroll");
      return {
        height: el.getBoundingClientRect().height,
        overflow: scroll.scrollWidth - scroll.clientWidth,
        accordions: scroll.querySelectorAll("details, [aria-expanded]").length,
        smallTargets: [...el.querySelectorAll(".bw-runner button")]
          .map((b) => b.getBoundingClientRect())
          .filter((box) => box.width > 0 && (box.width < 44 || box.height < 44)).length,
      };
    });
  const shotDir = process.env.BALLWISE_UNIT_SHOTS || work;
  await fs.mkdir(shotDir, { recursive: true });
  for (const width of [430, 390, 320]) {
    await p.setViewportSize({ width, height: 844 });
    await p.goto(base + "?kind=strength&phase=preview&unit=1");
    await openUnit();
    const m = await unitMetrics();
    if (m.height < 844 * 0.85) throw Error(`Panel too small at ${width}: ${m.height}`);
    if (m.overflow > 1) throw Error(`Panel overflow at ${width}: ${m.overflow}`);
    if (m.accordions) throw Error(`Accordions in the panel at ${width}: ${m.accordions}`);
    if (m.smallTargets) throw Error(`Touch target < 44 px in the panel at ${width}`);
    await p.screenshot({ path: path.join(shotDir, `01-lista-${width}.png`) });
    await unit.locator(".bw-rplan-group").nth(1).locator(".bw-rplan-row button").nth(1).click();
    await unit.getByRole("button", { name: "Jak wykonać?", exact: true }).waitFor();
    if ((await unit.locator("input").count()) > 0) throw Error("Preview shows entry fields");
    await p.screenshot({ path: path.join(shotDir, `02-cwiczenie-trening-${width}.png`) });
    await unit.getByRole("button", { name: "Jak wykonać?", exact: true }).click();
    await unit.locator(".bw-howto-panel").waitFor();
    await p.waitForTimeout(width === 390 ? 1500 : 400);
    await p.screenshot({ path: path.join(shotDir, `03-cwiczenie-technika-${width}.png`) });
    reports.push({ case: `unit-preview-${width}`, ...m, passed: true });
  }
  for (const width of [390, 320]) {
    await p.setViewportSize({ width, height: 844 });
    await p.goto(base + "?kind=strength&phase=active&unit=1");
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await openUnit();
    const kgUnit = unit.getByRole("textbox", { name: "Seria 1: ciężar w kg", exact: true });
    for (let i = 0; i < 30 && !(await kgUnit.count()); i += 1)
      await unit.getByRole("button", { name: "Następne", exact: false }).first().click();
    const name = await unit.locator(".bw-set-name").innerText();
    await kgUnit.fill("40");
    await unit.getByRole("textbox", { name: "Seria 1: powtórzenia", exact: true }).fill("8");
    await unit.getByRole("button", { name: "Seria 1: zapas 3", exact: true }).click();
    await p.screenshot({ path: path.join(shotDir, `04a-zapis-serii-${width}.png`) });
    await unit.getByRole("button", { name: "Zatwierdź serię 1", exact: true }).click();
    await unit.locator(".bw-rest-screen").waitFor();
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(shotDir, `04-w-trakcie-seria-przerwa-${width}.png`) });
    const clock = async () => {
      const [mm, ss] = (await unit.locator(".bw-rest-big").innerText()).split(":").map(Number);
      return mm * 60 + ss;
    };
    const before = await clock();
    // Close with the panel's own button, wait, reopen: same exercise, saved set, rest still counting.
    await unit.locator(".bw-sheet-close").click();
    await p.waitForFunction(() => !document.querySelector('.bw-unit-sheet[data-state="open"]'));
    await p.waitForTimeout(2600);
    await openUnit();
    const after = await clock();
    if (!(after <= before - 2 && after > 0))
      throw Error(`Rest did not keep counting while closed: ${before} -> ${after}`);
    await unit.getByRole("button", { name: "Rozpocznij kolejną serię", exact: true }).click();
    if ((await unit.locator(".bw-set-name").innerText()) !== name)
      throw Error("Reopened panel lost the open exercise");
    await unit.getByRole("button", { name: "Seria 1 zapisana, popraw", exact: true }).waitFor();
    await p.screenshot({ path: path.join(shotDir, `04b-seria-2-${width}.png`) });
    // The list keeps the marks and the rest dock.
    await unit.getByRole("button", { name: "Pozostałe ćwiczenia", exact: true }).click();
    await unit.locator(".bw-rplan-now").waitFor();
    await p.screenshot({ path: path.join(shotDir, `05-lista-w-trakcie-${width}.png`) });
    // The phone's back gesture closes the panel instead of leaving the plan.
    await p.evaluate(() => window.__auditRouter.history.back());
    await p.waitForFunction(() => !document.querySelector('.bw-unit-sheet[data-state="open"]'));
    if (!(await p.locator(".bw-qa-open-unit").isVisible())) throw Error("Back left the plan");
    reports.push({ case: `unit-active-close-reopen-${width}`, before, after, passed: true });
  }
  // Every kind of session fits the panel without sideways scroll.
  await p.setViewportSize({ width: 390, height: 844 });
  for (const kind of ["sprint", "run", "intervals", "mobility", "football", "club", "match"])
    for (const phase of ["preview", "active"]) {
      await p.goto(base + `?kind=${kind}&phase=${phase}&unit=1`);
      await p.locator(".bw-qa-open-unit").click();
      await unit.locator(".bw-session-head h1").waitFor();
      await p.waitForTimeout(400);
      const m = await unitMetrics();
      if (m.overflow > 1) throw Error(`Panel overflow for ${kind} ${phase}: ${m.overflow}`);
      await p.screenshot({ path: path.join(shotDir, `06-${kind}-${phase}-390.png`) });
      reports.push({ case: `unit-${kind}-${phase}`, ...m, passed: true });
    }
  if (process.env.BALLWISE_UNIT_SHOTS) reports.push({ case: "unit-shots", dir: shotDir });
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
