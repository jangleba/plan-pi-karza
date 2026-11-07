#!/usr/bin/env node
/** Real Vite/FBX/Three browser QA. Build-only works without a socket or Chromium. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url)),
  require = createRequire(path.join(root, "package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: react } = await import(
  pathToFileURL(require.resolve("@vitejs/plugin-react")).href
);
const { default: tailwindcss } = await import(
  pathToFileURL(require.resolve("@tailwindcss/vite")).href
);
const work =
  process.env.BALLWISE_IQ_UI_DIR ||
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-iq-learning-62");
await fs.mkdir(work, { recursive: true });
await fs.writeFile(
  path.join(work, "index.html"),
  '<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>',
);
await fs.writeFile(
  path.join(work, "entry.js"),
  `import ${JSON.stringify(path.join(root, "src/features/football-iq-match/__qa__/LearningHarness.tsx"))};`,
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
  console.log(JSON.stringify({ built: dist, assets: "real FBX and animation clips" }));
  process.exit(0);
}
const packagePath = process.env.BALLWISE_PLAYWRIGHT_PACKAGE;
const { chromium } = packagePath
  ? await import(pathToFileURL(path.join(packagePath, "index.mjs")).href)
  : await import("playwright");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".fbx": "application/octet-stream",
};
const server = http.createServer(async (req, res) => {
  try {
    const name =
      decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") ||
      "index.html";
    if (name.split("/").includes("..")) {
      res.writeHead(400);
      res.end();
      return;
    }
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
let activePage;
const errors = [],
  views = [];
const ensure = (value, message) => {
  if (!value) throw new Error(message);
};
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BALLWISE_CHROMIUM_EXECUTABLE ? {executablePath:process.env.BALLWISE_CHROMIUM_EXECUTABLE} : {}),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const page = activePage = await browser.newPage({viewport:{width:390,height:700}, deviceScaleFactor:1});
  page.on("pageerror", e => { errors.push(e.message); console.error("UI ERROR",e.message); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url + '?guide=1');
  await page.waitForSelector('.iqE-guide');
  await page.waitForSelector('[data-iq-renderer="ready"]');
  await page.locator('[data-iq-player="you"]').click();
  const tapSpace = async () => {
    const at = await page.locator('canvas[data-iq-pitch-corners]').evaluate(el=>{
      const box=el.getBoundingClientRect(), corners=JSON.parse(el.dataset.iqPitchCorners);
      return {x:box.left+corners.reduce((v,p)=>v+p.x,0)/4+10,y:box.top+corners.reduce((v,p)=>v+p.y,0)/4+10};
    });
    await page.mouse.click(at.x,at.y);
  };
  await tapSpace();
  await page.getByRole('button',{name:'Widzę podanie · dalej',exact:true}).click();
  await tapSpace();
  await page.getByRole('button',{name:'Rozumiem · wróć do lekcji',exact:true}).click();
  ensure(await page.evaluate(()=>!localStorage.getItem('ballwise:iq:journeys:v1:iq-browser-qa:draft')),'Tutorial changed saved decisions');
  await page.getByRole('button',{name:'Obserwuj · zaczynam',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('.iqE-loading'));
  for (const [width,height] of [[390,700],[390,560],[375,667],[844,390]]) {
    await page.setViewportSize({width,height});
    await page.screenshot({path:path.join(work,`IQ-62-${width}x${height}.png`)});
    const result=await page.evaluate(()=>{const p=document.querySelector('.iqE-pitch').getBoundingClientRect();return {width:innerWidth,height:innerHeight,pitch:{width:p.width,height:p.height},overflow:document.documentElement.scrollWidth>innerWidth,bodyHeight:document.documentElement.scrollHeight,nav:getComputedStyle(document.querySelector('.bw-tab-bar')).display};});
    ensure(!result.overflow,'Horizontal overflow'); ensure(result.bodyHeight <= height + 1,'Real tab shell left blank scrolling space'); ensure(result.pitch.height>=150,'Pitch too short'); ensure(result.nav==='none','Navigation should release pitch space');views.push(result);
  }
  await page.setViewportSize({width:390,height:700});
  await page.getByRole('button',{name:'Obserwuj · zaczynam',exact:true}).click();
  await page.waitForSelector('[data-iq-phase="decision"]');
  await page.getByRole('button',{name:'Pozostań w pozycji',exact:true}).click();
  await page.getByRole('button',{name:'Rozegraj',exact:true}).click();
  await page.getByRole('button',{name:'Jak grać',exact:true}).click();
  await page.getByRole('button',{name:'Pomiń',exact:true}).click();
  await page.waitForSelector('[data-iq-phase="feedback"]',{timeout:20000});
  await page.screenshot({path:path.join(work,'IQ-62-REAKCJA.png')});
  for(let step=0;step<3;step++) {
    const conclusion=page.getByRole('button',{name:'Zobacz wniosek',exact:true});
    if(await conclusion.count()){await conclusion.click();break;}
    await page.getByRole('button',{name:'Podejmij następną decyzję',exact:true}).click();
    await page.getByRole('button',{name:'Pozostań w pozycji',exact:true}).click();
    await page.getByRole('button',{name:'Rozegraj',exact:true}).click();
    await page.waitForSelector('[data-iq-phase="feedback"]',{timeout:20000});
  }
  await page.waitForSelector('.iqE-summary');
  await page.screenshot({path:path.join(work,'IQ-62-WNIOSEK.png')});
  ensure((await page.locator('.iqE-save').innerText())==='Zapisano','Attempt not saved');
  await page.getByRole('button',{name:'Sprawdź w nowym układzie',exact:true}).click();
  ensure((await page.locator('.iqE-context').innerText()).includes('Nowy układ'),'No transfer variant');
  await page.getByRole('button',{name:'Obserwuj · zaczynam',exact:true}).click();
  await page.waitForSelector('[data-iq-phase="decision"]');
  ensure((await page.getByRole('button',{name:'Wskazówka',exact:true}).count())===0,'Hints in independent test');
  const takeover = page.getByRole('button',{name:'Jedno zagranie za 8',exact:true});
  if(await takeover.count()) {
    await takeover.click(); await tapSpace();
    await page.getByRole('button',{name:'Rozegraj',exact:true}).click();
    await page.waitForFunction(()=>['decision','summary'].includes(document.querySelector('[data-iq-engine="8"]').dataset.iqPhase),{timeout:20000});
    ensure((await page.locator('[data-iq-phase="feedback"]').count())===0,'Intermediate grade in independent mode');
    const raw=await page.evaluate(()=>localStorage.getItem('ballwise:iq:journeys:v1:iq-browser-qa:draft')??localStorage.getItem('ballwise:iq:journeys:v1:iq-browser-qa'));
    ensure(raw.includes(':pass:'),'Free-space pass did not reach stored decisions');
  }
  await fs.writeFile(path.join(work,'wynik-iq-learning.json'),JSON.stringify({views,errors,flow:'intro → observation → own decision → actual reaction → feedback → conclusion → new independent variant'},null,2));
  ensure(errors.length===0,JSON.stringify(errors));
} catch(e) { console.error(e); console.error("UI errors",errors); await activePage?.screenshot({path:path.join(work,"FAILURE.png")}); console.error(await activePage?.locator("body").innerText()); await fs.writeFile(path.join(work,"failure.json"),JSON.stringify({error:String(e),errors})); throw e; } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
