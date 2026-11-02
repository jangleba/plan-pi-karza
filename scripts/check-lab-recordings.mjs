#!/usr/bin/env node
/** Real authored MP4s, FFprobe references, actual app parser/geometry and Chromium.
 * Synthetic controls test software; they do not validate athlete/pose accuracy. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  require = createRequire(path.join(root, "package.json"));
const work =
  process.env.BALLWISE_LAB_REAL_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-lab-real-ui-35");
const clipsDir =
  process.env.BALLWISE_LAB_RECORDINGS ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-lab-control-35");
await fs.mkdir(work, { recursive: true });
const ensure = (v, msg) => {
  if (!v) throw new Error(msg);
};
const esbuild = require("esbuild"),
  corePath = path.join(work, "core.mjs");
await esbuild.build({
  stdin: {
    contents: ["videoParser", "results", "protocols", "manualLongJump"]
      .map(
        (name) =>
          `export * from ${JSON.stringify(path.join(root, "src/features/browser-lab", name + ".ts"))};`,
      )
      .join("\n"),
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: corePath,
});
const core = await import(pathToFileURL(corePath).href);
let manifest,
  measurements = [];
if (!process.argv.includes("--build-only")) {
  manifest = JSON.parse(await fs.readFile(path.join(clipsDir, "WYNIKI-KONTROLNE.json"), "utf8"));
  for (const clip of manifest.clips) {
    const data = await fs.readFile(path.join(clipsDir, clip.file));
    ensure(
      crypto.createHash("sha256").update(data).digest("hex") === clip.sha256,
      "Corrupt control clip " + clip.file,
    );
    const video = core.parseJumpVideo(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
    ensure(video.timeline.frames.length === clip.frameCount, "Wrong frame count " + clip.file);
    video.timeline.frames.forEach((f, i) =>
      ensure(Math.abs(f.seconds - i / clip.fps) < 1e-6, "PTS mismatch " + clip.file + ":" + i),
    );
    let spatial;
    if (clip.id === "standing_long_jump") {
      const image = async (name) => ({
        width: clip.width,
        height: clip.height,
        data: new Uint8ClampedArray(
          await fs.readFile(path.join(clipsDir, ".audit", name + ".rgba")),
        ),
      });
      spatial = core.completeManualJump(
        core.prepareManualJump(await image("start"), clip.start),
        await image("end"),
        clip.heel,
        clip.end,
      );
    }
    const attempt = core.attemptPlan([clip.id]).find((a) => a.side === clip.side);
    const result = core.createBrowserResult({
      attempt,
      sessionId: "independent-control-videos",
      timeline: video.timeline,
      start: clip.start,
      end: clip.end,
      turnFrameIndex: clip.turn,
      sourceName: clip.file,
      sourceHash: clip.sha256,
      sourceBytes: data.length,
      codec: video.config.codec,
      guidePositions: [clip.line ?? 0.8, clip.line ?? 0.8],
      notes: "Synthetic QA control",
      ...(spatial ? { spatial } : {}),
    });
    const error = Math.abs(result.primaryValue - clip.expected);
    ensure(error < (spatial ? 5 : 1e-5), "Measurement mismatch " + clip.file + ":" + error);
    measurements.push({
      file: clip.file,
      expected: clip.expected,
      actual: result.primaryValue,
      error,
      unit: result.primaryUnit,
      frames: clip.frameCount,
      fps: video.timeline.fps,
      version: result.version,
      config: { ...video.config, description: [...new Uint8Array(video.config.description)] },
    });
  }
  await fs.writeFile(
    path.join(work, "wynik-danych.json"),
    JSON.stringify({ passed: true, synthetic: true, measurements }, null, 2),
  );
  console.log(
    JSON.stringify({
      dataPassed: true,
      clips: measurements.length,
      frames: measurements.reduce((s, r) => s + r.frames, 0),
    }),
  );
}
if (process.argv.includes("--audit-only")) process.exit(0);
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
  `import ${JSON.stringify(path.join(root, "src/features/browser-lab/__qa__/LabRealHarness.tsx"))};`,
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
  console.log(
    JSON.stringify({ built: dist, inputs: "actual decoder, workers, WASM and geometry" }),
  );
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
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".task": "application/octet-stream",
  ".mp4": "video/mp4",
};
const server = http.createServer(async (req, res) => {
  try {
    const name =
      decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") ||
      "index.html";
    if (name.split("/").includes("..")) throw new Error("path");
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
const browserResults = [],
  errors = [];
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BALLWISE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.BALLWISE_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [width, height] of [
    [320, 640],
    [390, 740],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(base);
    await page.locator(".bl-test-card").first().waitFor();
    ensure(
      (await page.locator(".bl-test-card").count()) === 5,
      "Expected only five individual test cards",
    );
    ensure((await page.locator(".bl-profile").count()) === 0, "Old full-profile hero remains");
    ensure(
      !(await page.getByText("17 prób", { exact: false }).count()),
      "Aggregate trial count remains at entry",
    );
    ensure(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
      "Horizontal overflow",
    );
    await page.screenshot({ path: path.join(work, `testy-${width}x${height}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  async function goFrame(index) {
    await page.locator('[aria-label="Pozycja w filmie"]').evaluate((el, index) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        el,
        String(index),
      );
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, index);
    await page.waitForFunction((i) => {
      const el = document.querySelector("[data-lab-painted]");
      return el?.dataset.labPainted === String(i) && el.dataset.labFrame === String(i);
    }, index);
  }
  for (const clip of manifest.clips) {
    await page.unrouteAll();
    // One clip tries the real model. Others deliberately verify the supported manual fallback.
    if (clip.id !== "cmj")
      await page.route("**/models/pose_landmarker_lite.task", (route) => route.abort());
    await page.goto(base + `?case=${clip.id}&side=${clip.side ?? ""}`);
    const cfg = measurements.find((r) => r.file === clip.file).config;
    const supported = await page.evaluate(
      async (c) =>
        (await VideoDecoder.isConfigSupported({ ...c, description: new Uint8Array(c.description) }))
          .supported,
      cfg,
    );
    await page
      .locator('input[aria-label="Wybierz oryginalny film"]')
      .setInputFiles(path.join(clipsDir, clip.file));
    if (!supported) {
      await page.locator('[role="alert"]').first().waitFor();
      ensure(
        !(await page.locator("[data-lab-saved]").count()),
        "Unsupported codec produced a result",
      );
      browserResults.push({ file: clip.file, supported: false, refused: true });
      continue;
    }
    await page.waitForFunction(
      () => {
        const el = document.querySelector("[data-lab-loaded]");
        return el?.dataset.labLoaded === "true" && el.dataset.labReading === "false";
      },
      undefined,
      { timeout: 90000 },
    );
    const proposed =
      (await page.getByRole("button", { name: "Oznacz wszystko ręcznie", exact: true }).count()) >
      0;
    if (proposed) {
      ensure(
        !(await page.locator('[aria-label="Wynik próby"]').count()),
        "Unreviewed proposal exposed a result",
      );
      await page.getByRole("button", { name: "Oznacz wszystko ręcznie", exact: true }).click();
    }
    if (clip.id === "standing_long_jump") {
      await page.getByRole("button", { name: "Wskaż lądowanie ręcznie", exact: true }).click();
      await goFrame(clip.start);
      await page.getByRole("button", { name: "To klatka przed skokiem", exact: true }).click();
      await goFrame(clip.end);
      const hit = page.getByRole("button", {
          name: "Wskaż bliższą piętę na lądowaniu",
          exact: true,
        }),
        box = await hit.boundingBox();
      await hit.click({ position: { x: box.width * clip.heel[0], y: box.height * clip.heel[1] } });
    } else {
      await goFrame(clip.start);
      await page.getByRole("button", { name: /^Oznacz (wybicie|pierwszy ruch|wejście)$/i }).click();
      if (clip.turn) {
        await goFrame(clip.turn);
        await page.getByRole("button", { name: "Oznacz nawrót", exact: true }).click();
      }
      await goFrame(clip.end);
      await page.getByRole("button", { name: /^Oznacz (lądowanie|meta 10 m|powrót)$/i }).click();
      await page.locator('input[type="checkbox"]').check();
    }
    await page.getByRole("region", { name: "Wynik próby" }).waitFor();
    await page.getByRole("button", { name: "Zapisz wynik", exact: true }).click();
    await page.locator("[data-lab-saved]").waitFor();
    const saved = await page.evaluate(() => window.__labRealQA.saved);
    ensure(saved.length === 1, "Duplicate result " + clip.file);
    ensure(
      Math.abs(saved[0].primaryValue - clip.expected) <
        (clip.id === "standing_long_jump" ? 5 : 1e-5),
      "Wrong real-video result " + clip.file,
    );
    await page.screenshot({ path: path.join(work, clip.file.replace(".mp4", "") + "-wynik.png") });
    browserResults.push({
      file: clip.file,
      supported: true,
      proposed,
      actual: saved[0].primaryValue,
      expected: clip.expected,
    });
  }
  ensure(!errors.length, errors.join("; "));
  ensure(
    browserResults.filter((r) => r.supported).length >= 5,
    "Too few actual decoder paths exercised",
  );
  await fs.writeFile(
    path.join(work, "wynik-przegladarki.json"),
    JSON.stringify({ passed: true, synthetic: true, browserResults }, null, 2),
  );
  console.log(JSON.stringify({ browserPassed: true, clips: browserResults.length }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
