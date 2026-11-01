#!/usr/bin/env node
/** Real Chromium layout/interaction checks with explicitly simulated video/pose inputs.
 * Does not sign in, access accounts or certify camera/AI measurement accuracy. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const esbuild = require("esbuild");
const work =
  process.env.BALLWISE_LAB_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-lab-ui-24");
await fs.mkdir(work, { recursive: true });
const mockVideo = `
export const MAX_VIDEO_BYTES=128*1024*1024;
export async function openJumpVideo(file,signal){signal.throwIfAborted();const q=window.__labQA;return {timeline:q.timeline,config:{codec:'avc1.640029',codedWidth:q.portrait?720:1280,codedHeight:q.portrait?1280:720},rotation:0,samples:[],sourceName:file.name,sourceBytes:Math.max(1,file.size),sourceHash:'a'.repeat(64)}}
export function createJumpFrameDecoder(video){return{dispose(){},async decode(index,signal){signal.throwIfAborted();const c=document.createElement('canvas');c.width=video.config.codedWidth;c.height=video.config.codedHeight;const x=c.getContext('2d');x.fillStyle='#edf3f8';x.fillRect(0,0,c.width,c.height);x.fillStyle='#d2dfeb';x.fillRect(0,c.height*.68,c.width,c.height*.32);x.fillStyle='#0b446d';x.font=Math.round(c.width*.035)+'px sans-serif';x.fillText('Dane kontrolne — klatka '+(index+1),c.width*.05,c.height*.08);x.fillRect(c.width*.43,c.height*.2,c.width*.1,c.height*.37);x.fillRect(c.width*.43,c.height*.57,c.width*.035,c.height*.11);x.fillRect(c.width*.495,c.height*.57,c.width*.035,c.height*.11);c.displayWidth=c.width;c.displayHeight=c.height;c.timestamp=video.timeline.frames[index].timestampUs;c.close=()=>{c.width=0;c.height=0};return c}}}
`;
const mockCamera = `
export function stopCamera(camera){clearInterval(camera.qaTimer);camera.stream.getTracks().forEach(t=>t.stop())}
export async function openLabCamera(signal){signal.throwIfAborted();const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');const stream=c.captureStream(30);const qaTimer=setInterval(()=>{x.fillStyle='#d2dfeb';x.fillRect(0,0,640,360);x.fillStyle='#0b446d';x.font='24px sans-serif';x.fillText('Podgląd kontrolny',30,50)},50);return{stream,qaTimer,mimeType:'video/mp4',settings:{width:640,height:360,frameRate:30}}}
export function recordLabCamera(camera,signal,onSeconds,limit=8){let complete,reject;const finished=new Promise((a,b)=>{complete=a;reject=b});const start=Date.now();let ended=false;let timer;const stop=()=>{if(ended)return;ended=true;clearInterval(timer);stopCamera(camera);complete(new File(['qa'],'Kontrola.mp4',{type:'video/mp4'}))};timer=setInterval(()=>{onSeconds(Math.min(limit,Math.floor((Date.now()-start)/1000)));if(Date.now()-start>=limit*1000)stop()},250);signal.addEventListener('abort',()=>{clearInterval(timer);stopCamera(camera);reject(signal.reason)},{once:true});return{finished,stop}}
`;
const mocks = {
  video: mockVideo,
  camera: mockCamera,
  longJumpAuto: `export async function analyzeLongJump(video,signal,progress){signal.throwIfAborted();progress(100);return window.__labQA.spatial}`,
  deliverExportFile: `export async function deliverExportFile(){return 'delivered'} export async function deliverExportBlob(){return 'delivered'}`,
};
await esbuild.build({
  entryPoints: [path.join(root, "src/features/browser-lab/__qa__/LabHarness.tsx")],
  outfile: path.join(work, "lab-ui.js"),
  bundle: true,
  write: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
  plugins: [
    {
      name: "isolated-lab-inputs",
      setup(build) {
        build.onResolve(
          { filter: /(?:^|\/)(video|camera|longJumpAuto|deliverExportFile)(?:\.tsx?)?$/ },
          (args) => {
            const key = path.basename(args.path).replace(/\.tsx?$/, "");
            if (!mocks[key]) return;
            return { path: key, namespace: "lab-qa" };
          },
        );
        build.onLoad({ filter: /.*/, namespace: "lab-qa" }, (args) => ({
          contents: mocks[args.path],
          loader: "js",
        }));
        build.onResolve({ filter: /\?url$/ }, (args) => ({
          path: path.resolve(path.dirname(args.importer), args.path.slice(0, -4)),
          namespace: "qa-asset",
        }));
        build.onLoad({ filter: /.*/, namespace: "qa-asset" }, async (args) => ({
          contents:
            "export default " +
            JSON.stringify(
              "data:video/mp4;base64," + (await fs.readFile(args.path)).toString("base64"),
            ),
          loader: "js",
        }));
      },
    },
  ],
});
const publicDir = path.join(root, ".output/public");
const assets = await fs.readdir(path.join(publicDir, "assets"));
const cssFiles = assets.filter((name) => /^styles-.*\.css$/.test(name));
if (!cssFiles.length) throw new Error("Build the web application before visual QA.");
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
  "\nbody{margin:0;background:var(--background);color:var(--foreground)}.lab-qa-banner{font-size:11px;padding:12px 20px;color:var(--muted-foreground);border-bottom:1px solid var(--border)}";
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
    JSON.stringify({ built: work, inputs: "simulated video/pose; real React/CSS components" }),
  );
  process.exit(0);
}
const packagePath = process.env.BALLWISE_PLAYWRIGHT_PACKAGE;
const { chromium } = packagePath
  ? await import(pathToFileURL(path.join(packagePath, "index.mjs")).href)
  : await import("playwright");
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.VideoDecoder ??= class {};
    window.EncodedVideoChunk ??= class {};
  });
  const url = pathToFileURL(path.join(work, "index.html")).href;
  const ensure = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  async function fit(name) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ensure(overflow <= 1, name + ": horizontal overflow " + overflow);
    const modal = await page.locator(".bl-auto-correction,.bl-camera-overlay").count();
    await page.screenshot({ path: path.join(work, name + ".png"), fullPage: !modal });
    results.push(name);
  }
  async function goto(query = "") {
    await page.goto(url + query);
    await page.locator(".browser-lab").waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  async function importClip() {
    await page
      .locator('input[aria-label="Wybierz oryginalny film"]')
      .setInputFiles({
        name: "Kontrola.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("qa-input"),
      });
  }
  async function goFrame(index) {
    await page.locator('[aria-label="Pozycja w filmie"]').evaluate((el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        el,
        String(value),
      );
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, index);
    await page.locator(".bl-frame-loading").waitFor({ state: "hidden" });
  }
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await goto();
    ensure(
      (await page.locator('button[aria-label^="Rozpocznij"]').count()) === 5,
      "Five individual test targets must be available",
    );
    for (const box of await page
      .locator(".bl-test-card")
      .evaluateAll((els) =>
        els.map((el) => ({
          w: el.getBoundingClientRect().width,
          h: el.getBoundingClientRect().height,
        })),
      ))
      ensure(box.w >= 44 && box.h >= 44, "Small test touch target");
    await fit("testy-" + width + "x" + height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await goto("?history=1");
  await page.getByRole("tab", { name: /Testy/ }).focus();
  await page.keyboard.press("ArrowRight");
  ensure(
    (await page.getByRole("tab", { name: /Historia/ }).getAttribute("aria-selected")) === "true",
    "Keyboard tab navigation",
  );
  await fit("historia-390");
  await goto("?mode=cmj");
  await page.getByRole("button", { name: "Nagraj próbę", exact: true }).click();
  await page.locator(".bl-camera-shutter").waitFor();
  await page.getByLabel("Opóźnienie startu").selectOption("10");
  await page.getByLabel("Długość nagrania").selectOption("15");
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [568, 320],
  ]) {
    await page.setViewportSize({ width, height });
    const areas = await page.locator(".bl-camera-overlay").evaluate((el) => {
      const p = el.querySelector(".bl-camera-preview").getBoundingClientRect(),
        b = el.querySelector(".bl-camera-bottom").getBoundingClientRect();
      return { separate: p.right <= b.left + 1 || p.bottom <= b.top + 1 };
    });
    ensure(areas.separate, "Camera controls cover the preview");
    await fit("kamera-" + width + "x" + height);
  }
  await page.getByRole("button", { name: "Zamknij kamerę" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await goto("?mode=long-jump&orientation=portrait");
  await importClip();
  await page.locator(".bl-big-value").waitFor();
  async function aligned() {
    const boxes = await page.locator(".bl-frame").evaluate((el) => {
      const c = el.querySelector("canvas");
      const r = el.getBoundingClientRect();
      return { ratio: r.width / r.height, image: c.width / c.height, w: r.width, h: r.height };
    });
    ensure(
      Math.abs(boxes.ratio - boxes.image) < 0.01,
      "Video and heel overlay have different aspect ratios",
    );
  }
  await aligned();
  await fit("skok-pionowy-390");
  await page.getByRole("button", { name: "Popraw punkt pięty", exact: true }).click();
  await aligned();
  ensure(
    (await page.evaluate(() => document.body.style.overflow)) === "hidden",
    "Correction must lock background scrolling",
  );
  const overlay = await page.locator(".bl-auto-overlay").boundingBox();
  await page.mouse.click(overlay.x + 0.128 * overlay.width, overlay.y + 0.6375 * overlay.height);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Popraw punkt pięty" }).waitFor({ state: "hidden" });
  ensure(
    (await page.locator(".bl-big-value").textContent()).includes("214"),
    "Cancel must restore the previous heel",
  );
  await page.getByRole("button", { name: "Popraw punkt pięty", exact: true }).click();
  await fit("korekta-piety-390");
  await page.getByRole("button", { name: "Zatwierdź punkt pięty" }).click();
  await page.getByRole("button", { name: "Zapisz wynik", exact: true }).click();
  ensure(
    (await page.evaluate(() => window.__labQA.saved.length)) === 1,
    "Long-jump result must be saved once",
  );
  await goto("?mode=cmj");
  await importClip();
  await goFrame(60);
  await page.getByRole("button", { name: "Oznacz wybicie", exact: true }).click();
  await goFrame(164);
  await page.getByRole("button", { name: "Oznacz lądowanie", exact: true }).click();
  await page.locator(".bl-result input[type=checkbox]").check();
  await page.getByRole("button", { name: "Zapisz wynik", exact: true }).click();
  const jump = await page.evaluate(() => window.__labQA.saved[0]);
  ensure(
    Math.abs(jump.primaryValue - 23.01838680555555) < 1e-7,
    "CMJ measurement UI path changed the event times",
  );
  await fit("wynik-cmj-390");
  await goto("?mode=505");
  await importClip();
  await goFrame(60);
  await page.getByRole("button", { name: "Oznacz wejście", exact: true }).click();
  await goFrame(350);
  await page.getByRole("button", { name: "Oznacz nawrót", exact: true }).click();
  await goFrame(660);
  await page.getByRole("button", { name: "Oznacz powrót", exact: true }).click();
  await page.locator(".bl-result input[type=checkbox]").check();
  await page.getByRole("button", { name: "Zapisz wynik", exact: true }).click();
  ensure(
    (await page.evaluate(() => window.__labQA.saved[0]?.primaryValue)) === 2.5,
    "505 measurement UI path",
  );
  await fit("wynik-505-390");
  ensure(!errors.length, "Uncaught browser errors: " + errors.join("; "));
  await fs.writeFile(
    path.join(work, "wynik.json"),
    JSON.stringify(
      {
        passed: true,
        views: results,
        inputs: "simulated video/pose; real component rendering; not hardware validation",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, views: results }));
} finally {
  await browser.close();
}
