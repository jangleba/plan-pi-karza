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
  process.env.BALLWISE_ONBOARDING_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-onboarding-ui-48");
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
const cases = [],
  errors = [];
const ensure = (ok, message) => {
  if (!ok) throw new Error(message);
};
try {
  for (const mode of ["success", "fail_once", "lost_response", "hung"]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
    await page.getByRole("checkbox").first().waitFor();
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    // Go forward until the last step, which carries the save button.
    for (let i = 0; i < 24; i++) {
      if (await page.getByRole("button", { name: "Zapisz", exact: true }).count()) break;
      const step = await page.locator(".ob-step").first().getAttribute("data-step");
      if (step === "calendar") await page.locator(".ob-date").nth(3).click();
      await page.getByRole("button", { name: "Dalej", exact: true }).click();
      await page.locator(`.ob-step:not([data-step="${step}"])`).waitFor();
    }
    await page.screenshot({ path: path.join(work, mode + "-formularz.png") });
    await fs.writeFile(path.join(work, mode + "-formularz.html"), await page.content());
    const save = page.getByRole("button", { name: "Zapisz", exact: true });
    await save.waitFor();
    const at = Date.now();
    await save.click();
    if (mode === "hung" || mode === "fail_once") {
      await page
        .getByText("Odpowiedzi pozostają w formularzu", { exact: false })
        .waitFor({ timeout: 25000 });
      ensure(await save.isEnabled(), mode + ": retry is disabled");
      await page.screenshot({ path: path.join(work, mode + "-zachowane-odpowiedzi.png") });
      if (mode === "fail_once") {
        await save.click();
        await page.getByTestId("profile-saved").waitFor({ timeout: 20000 });
      }
    } else {
      await page.getByTestId("profile-saved").waitFor({ timeout: 20000 });
    }
    const stats = await page.evaluate(() => window.__onboardingQA);
    // The week engine was removed: the save carries the profile only, never a plan.
    ensure(
      stats.planPayloads.every((plan) => plan === null),
      "Onboarding sent a plan: " + JSON.stringify(stats),
    );
    if (mode === "fail_once")
      ensure(
        stats.saveCalls === 2 && stats.consentCalls === 4,
        "Retry repeated consents or writes: " + JSON.stringify(stats),
      );
    if (mode === "lost_response")
      ensure(stats.saveCalls === 1, "Lost response duplicated a write: " + JSON.stringify(stats));
    cases.push({ mode, elapsedMs: Date.now() - at, ...stats });
    await page.close();
  }
  ensure(!errors.length, errors.join("; "));
  await fs.writeFile(
    path.join(work, "wynik.json"),
    JSON.stringify(
      {
        passed: true,
        cases,
        scope:
          "Actual onboarding route, generation worker and profile actions; isolated backend responses, no account writes.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, cases }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
