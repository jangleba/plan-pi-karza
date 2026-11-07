#!/usr/bin/env node
/** Real authored MP4s, FFprobe references, actual app parser/geometry and Chromium.
 * Synthetic controls test software; they do not validate athlete/pose accuracy. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
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
    contents: [
      "videoParser",
      "results",
      "protocols",
      "manualLongJump",
      "longJump",
      "markerGeometry",
      "timingQuality",
    ]
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
      await page.getByRole("button", { name: /^Oznacz (lądowanie|metę 10 m|powrót)$/i }).click();
    }
    await page.getByRole("region", { name: "Wynik próby" }).waitFor();
    ensure(
      await page.getByRole("button", { name: "Zapisz wynik", exact: true }).isDisabled(),
      "Unchecked technique was saveable",
    );
    await page.locator('input[type="checkbox"]').check();
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
  const sprint = manifest.clips.find((clip) => clip.id === "sprint_10m");
  const qualityControls = [];
  // Real MP4 changes preserve presentation time; no mocked decoder or source timestamps.
  for (const kind of ["missing-start-frame", "30fps"]) {
    const file = path.join(work, `sprint-${kind}.mp4`);
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      path.join(clipsDir, sprint.file),
      "-vf",
      kind === "30fps" ? "fps=30" : `select=not(eq(n\\,${sprint.start - 1}))`,
      "-fps_mode",
      "vfr",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "20",
      "-an",
      file,
    ]);
    const buffer = await fs.readFile(file);
    const video = core.parseJumpVideo(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    );
    const at = (seconds) =>
      video.timeline.frames.findIndex((frame) => frame.seconds >= seconds - 1e-6);
    const start = at(sprint.start / sprint.fps),
      end = at(sprint.end / sprint.fps);
    await page.unrouteAll();
    await page.goto(base + "?case=sprint_10m");
    await page.locator('input[aria-label="Wybierz oryginalny film"]').setInputFiles(file);
    await page.waitForFunction(() => {
      const el = document.querySelector("[data-lab-loaded]");
      return el?.dataset.labLoaded === "true" && el.dataset.labReading === "false";
    });
    await goFrame(start);
    await page.getByRole("button", { name: "Oznacz pierwszy ruch", exact: true }).click();
    await goFrame(end);
    await page.getByRole("button", { name: "Oznacz metę 10 m", exact: true }).click();
    if (kind === "missing-start-frame") {
      ensure(
        !(await page.locator('[aria-label="Wynik próby"]').count()),
        "Missing event frame exposed a result",
      );
      await page.getByRole("alert").filter({ hasText: "Brakuje klatek" }).waitFor();
      ensure(!(await page.locator("[data-lab-saved]").count()), "Missing event frame was saved");
      qualityControls.push({ kind, blocked: true, fps: video.timeline.fps });
    } else {
      await page.locator(".bl-timing-quality-indicative").waitFor();
      await page.locator('input[type="checkbox"]').check();
      await page.getByRole("button", { name: "Zapisz wynik", exact: true }).click();
      await page.locator("[data-lab-saved]").waitFor();
      const saved = await page.evaluate(() => window.__labRealQA.saved);
      ensure(
        saved.length === 1 && Math.abs(saved[0].fps - 30) < 0.01,
        "Low-rate recording was not saved accurately",
      );
      ensure(saved[0].timingReview?.method === "manual", "Manual review method was lost");
      qualityControls.push({ kind, indicative: true, saved: true, fps: video.timeline.fps });
    }
    await page.screenshot({ path: path.join(work, `sprint-${kind}.png`) });
  }
  // A real VFR jump with a 95.8 ms gap at takeoff must never save as a short flight.
  const single = manifest.clips.find(
    (clip) => clip.id === "single_leg_cmj" && clip.side === "left",
  );
  const brokenFile = path.join(work, "single-leg-missing-takeoff.mp4");
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    path.join(clipsDir, single.file),
    "-vf",
    "select=not(between(n\\,192\\,213))",
    "-fps_mode",
    "vfr",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "20",
    "-an",
    brokenFile,
  ]);
  const broken = await fs.readFile(brokenFile);
  const brokenVideo = core.parseJumpVideo(
    broken.buffer.slice(broken.byteOffset, broken.byteOffset + broken.byteLength),
  );
  const brokenAt = (seconds) =>
    brokenVideo.timeline.frames.findIndex((frame) => frame.seconds >= seconds - 1e-6);
  await page.unrouteAll();
  await page.route("**/models/pose_landmarker_lite.task", (route) => route.abort());
  await page.goto(base + "?case=single_leg_cmj&side=left");
  await page.locator('input[aria-label="Wybierz oryginalny film"]').setInputFiles(brokenFile);
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-lab-loaded]");
    return el?.dataset.labLoaded === "true" && el.dataset.labReading === "false";
  });
  await goFrame(brokenAt(214 / 240));
  await page.getByRole("button", { name: "Oznacz wybicie", exact: true }).click();
  await goFrame(brokenAt(single.end / single.fps));
  await page.getByRole("button", { name: "Oznacz lądowanie", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Brakuje klatek" }).waitFor();
  ensure(
    !(await page.locator('[aria-label="Wynik próby"]').count()),
    "Incomplete jump exposed a result",
  );
  ensure(
    !(await page.getByRole("button", { name: "Zapisz wynik", exact: true }).count()),
    "Incomplete jump exposed a save",
  );
  qualityControls.push({
    kind: "single-leg-missing-takeoff",
    blocked: true,
    fps: brokenVideo.timeline.fps,
  });
  await page.screenshot({ path: path.join(work, "single-leg-missing-takeoff.png") });

  // Rasterize exactly the SVG files supplied to athletes, with their real printed text.
  const targetDir = path.join(work, "printed-targets");
  await fs.mkdir(targetDir, { recursive: true });
  await page.setViewportSize({ width: 840, height: 1188 });
  for (const name of ["start", "range"]) {
    const svg = await fs.readFile(
      path.join(root, name === "start" ? "public/lab-wzorzec.svg" : "public/lab-wzorzec-3m.svg"),
      "utf8",
    );
    await page.setContent(
      "<style>html,body{margin:0}svg{width:840px;height:1188px;display:block}</style>" + svg,
    );
    await page.screenshot({ path: path.join(targetDir, name + "-printed-asset.png") });
  }
  execFileSync("python3", [path.join(root, "scripts/generate-lab-target-scenes.py"), targetDir], {
    stdio: "inherit",
  });
  const targetCases = JSON.parse(
    await fs.readFile(path.join(targetDir, "printed-target-cases.json"), "utf8"),
  );
  const targetControls = [];
  for (const c of targetCases) {
    const image = {
      width: c.width,
      height: c.height,
      data: new Uint8ClampedArray(await fs.readFile(path.join(targetDir, c.name + ".rgba"))),
    };
    const markers = core.findBallWiseCalibrationMarkers(image);
    ensure(markers, "Actual printed target not detected: " + c.name);
    const start = core.orientStartMarker(markers.start.corners, markers.range.corners);
    let measurement;
    try {
      measurement = core.longJumpMeasurement({
        method: "ballwise-marker-pose-v4",
        referenceCorners: start,
        rangeCorners: markers.range.corners,
        landingReferenceCorners: start,
        landingRangeCorners: markers.range.corners,
        referenceWidthCm: 20,
        referenceDepthCm: 24,
        baselineCm: 300,
        imageWidth: c.width,
        imageHeight: c.height,
        calibrationFrameIndex: 1,
        lineFrameIndex: 1,
        heelFrameIndex: 2,
        takeoffLine: core.takeoffEdgeFromMarkers(start, markers.range.corners),
        heel: c.heel,
        poseConfidence: 0,
        markerQuality: Math.min(markers.start.quality, markers.range.quality),
        heelSource: "manual",
      });
    } catch (e) {
      ensure(
        /wrażliwa|wzorzec|geometrii|kadr/i.test(e.message),
        "Unexpected target geometry failure: " + e.message,
      );
    }
    if (measurement)
      ensure(
        Math.abs(measurement.primaryValue - c.expectedCm) < 3,
        "Printed target distance mismatch: " + c.name,
      );
    targetControls.push({
      name: c.name,
      detected: true,
      accepted: !!measurement,
      actualCm: measurement?.primaryValue,
    });
    // Black rectangular frames alone must not masquerade as the coloured BallWise targets.
    for (let i = 0; i < image.data.length; i += 4) {
      const grey = Math.round((image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = grey;
    }
    ensure(
      !core.findBallWiseCalibrationMarkers(image),
      "Greyscale scene accepted as coloured targets: " + c.name,
    );
  }
  ensure(
    targetControls.some((c) => c.accepted),
    "All target scenes rejected by geometry",
  );
  await fs.writeFile(
    path.join(work, "wynik-wzorcow.json"),
    JSON.stringify({ passed: true, synthetic: true, targetControls }, null, 2),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "?case=sprint_10m");
  await page.screenshot({ path: path.join(work, "sprint-przygotowanie.png") });
  ensure(!errors.length, errors.join("; "));
  ensure(
    browserResults.filter((r) => r.supported).length >= 5,
    "Too few actual decoder paths exercised",
  );
  await fs.writeFile(
    path.join(work, "wynik-przegladarki.json"),
    JSON.stringify(
      { passed: true, synthetic: true, browserResults, qualityControls, targetControls },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ browserPassed: true, clips: browserResults.length }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
