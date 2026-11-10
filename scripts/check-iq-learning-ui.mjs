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
  path.join(process.env.RUNNER_TEMP || os.tmpdir(), "ballwise-iq-learning-63");
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
  // Fixed older lesson (index 54 = iqx-wing-0-0) so the multi-decision flow is deterministic.
  await page.goto(url+'?scenario=54');
  await page.waitForSelector('.iqE-start');
  ensure(await page.locator('[data-iq-renderer="loading"] .bwiq-figure, [data-iq-renderer="loading"] svg').count()===0,'Flat figures shown while the 3D view loads');
  await page.waitForSelector('[data-iq-renderer="ready"]');
  // Free space well ahead of the ball: a quarter of the pitch below the far goal line.
  const tapSpace = async () => {
    const at = await page.locator('canvas[data-iq-pitch-corners]').evaluate(el=>{
      const box=el.getBoundingClientRect(), c=JSON.parse(el.dataset.iqPitchCorners);
      const top=Math.min(...c.map(p=>p.y)), bottom=Math.max(...c.map(p=>p.y));
      return {x:box.left+c.reduce((v,p)=>v+p.x,0)/4+25,y:box.top+top+(bottom-top)*0.22};
    });
    await page.mouse.click(at.x,at.y);
  };
  const start = page.getByRole('button',{name:'Start',exact:true});
  // Start screen is one line and the Start button: rules and mode live in the help sheet.
  const startText = await page.locator('.iqE-start').innerText();
  ensure(/^Jesteś nr \d+(\. Piłkę ma (partner|rywal) \d+\.| i masz piłkę\.|\. Piłka jest wolna\.)/.test(startText),'Start line does not name TY and the ball carrier');
  ensure(await page.locator('.iqE-start button').count()===1,'Start screen should have only the Start button');
  await start.waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('.iqE-loading'));
  for (const [width,height] of [[390,700],[390,560],[375,667],[844,390]]) {
    await page.setViewportSize({width,height});
    await page.screenshot({path:path.join(work,`IQ-64-${width}x${height}.png`)});
    const result=await page.evaluate(()=>{const p=document.querySelector('.iqE-pitch').getBoundingClientRect();return {width:innerWidth,height:innerHeight,pitch:{width:p.width,height:p.height},overflow:document.documentElement.scrollWidth>innerWidth,bodyHeight:document.documentElement.scrollHeight,nav:getComputedStyle(document.querySelector('.bw-tab-bar')).display};});
    ensure(!result.overflow,'Horizontal overflow'); ensure(result.bodyHeight <= height + 1,'Real tab shell left blank scrolling space'); ensure(result.pitch.height>=150,'Pitch too short'); ensure(result.nav==='none','Navigation should release pitch space');views.push(result);
  }
  await page.setViewportSize({width:390,height:700});
  // Before a decision nothing may suggest an answer: no ready options, no option arrows or letters.
  const noHints = async () => {
    ensure((await page.locator('.iqE-options button').count())===0,'Ready-made options shown before the decision');
    ensure((await page.locator('[data-iq-option-end], [data-iq-option]').count())===0,'Option arrows shown before the decision');
    ensure((await page.getByRole('button',{name:'Pokaż opcje'}).count())===0,'"Pokaż opcje" must not exist');
    ensure((await page.locator('.iqE-controls').innerText()).startsWith('Dotknij'),'Gestures are not explained');
  };
  const canvasPoint = async (fn) => page.locator('canvas[data-iq-pitch-corners]').evaluate((el, src) => {
    const box = el.getBoundingClientRect(), c = JSON.parse(el.dataset.iqPitchCorners), players = JSON.parse(el.dataset.iqProjectedPlayers);
    const at = new Function('c','players',src)(c, players);
    return at && { x: box.left + at.x, y: box.top + at.y };
  }, fn);
  // Screen point of a player (the same projection the pitch uses to pick players).
  const tapPlayer = async (ids) => {
    const at = await canvasPoint(`for (const id of ${JSON.stringify(ids)}) if (players[id]) return players[id];`);
    await page.mouse.click(at.x, at.y);
  };
  // A shot: tap at the rival keeper, i.e. the goal mouth (rival keeper is not selectable with the ball).
  const tapGoal = () => tapPlayer(['keeper']);
  // Off the ball: tap the middle of the pitch view.
  const tapMiddle = async () => {
    const box = await page.locator('canvas[data-iq-pitch-corners]').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  };
  let predictions = 0, pressed = 0;
  const playDecision = async (shoot = false) => {
    await page.waitForSelector('[data-iq-phase="decision"]',{timeout:20000});
    // Prediction loop: once per action, before the first decision with our ball.
    if (await page.locator('.iqE-predict').count()) {
      ensure(/rywal nr \d+/.test(await page.locator('.iqE-predict').innerText()),'Prediction must name the rival');
      if (!predictions) await page.screenshot({path:path.join(work,'IQ-64-PROGNOZA.png')});
      predictions++;
      await page.locator('.iqE-predict .iqE-options button').first().click();
      await page.waitForSelector('.iqE-prediction');
    }
    await noHints();
    const now = await page.locator('.iqE-now').innerText();
    const own = now.startsWith('Masz piłkę'), rival = now.startsWith('Piłkę ma rywal');
    if (own && shoot) await tapGoal();
    else if (own) await tapPlayer(['support','third','wide','forward','anchor']);
    else if (rival) await page.locator('button[aria-label*="z piłką"]').first().click();
    else await tapMiddle();
    const planned = await page.locator('.iqE-plan').innerText();
    if (rival) { ensure(planned.includes('Doskok do'),`Tap on the rival with the ball should plan a press, got: ${planned}`); pressed++; }
    ensure(planned.startsWith('Twój wybór:'),`Tap did not plan a move: ${planned}`);
    if (own && shoot) ensure(planned.includes('Strzał'),`Goal tap should plan a shot, got: ${planned}`);
    await page.getByRole('button',{name:'Zagraj',exact:true}).click();
    return planned;
  };
  await start.click();
  await playDecision();
  await page.waitForSelector('[data-iq-phase="feedback"]',{timeout:20000});
  await page.screenshot({path:path.join(work,'IQ-64-REAKCJA.png')});
  ensure(predictions===1,'The first decision with our ball needs a prediction');
  ensure(/^Prognoza (trafiona|nietrafiona)/.test(await page.locator('.iqE-forecast').innerText()),'Feedback must compare the prediction with the animation');
  for(let step=0;step<3;step++) {
    ensure((await page.getByRole('button',{name:'Zobacz wynik',exact:true}).count())===0,'Action ended at the old three-decision limit');
    ensure((await page.locator('.iqE-next').innerText()).startsWith('Teraz:'),'Feedback does not say what comes next');
    await page.getByRole('button',{name:'Dalej',exact:true}).click();
    await playDecision();
    await page.waitForSelector('[data-iq-phase="feedback"]',{timeout:20000});
  }
  // After a decision: another solution can be replayed on demand.
  await page.getByRole('button',{name:'Zobacz inne rozwiązanie',exact:true}).click();
  await page.waitForSelector('[data-iq-phase="feedback"]',{timeout:20000});
  await page.waitForSelector('.iqE-alternative');
  await page.screenshot({path:path.join(work,'IQ-64-INNE.png')});
  ensure((await page.locator('[data-iq-result]').innerText()).startsWith('Skutek:'),'Feedback must show the consequence apart from the grade');
  // After a good decision: solve the same moment another way (not saved, back to the action).
  let retried = 0;
  for (let step=0; step<6 && !retried; step++) {
    const find = page.getByRole('button',{name:'Znajdź inne rozwiązanie',exact:true});
    if (await find.count()) {
      const before = await page.locator('.iqE-feedback').first().innerText();
      await find.click();
      await page.waitForSelector('.iqE-retry');
      ensure(predictions===1,'No prediction question inside the retry');
      await playDecision();
      await page.waitForSelector('[data-iq-retry]',{timeout:20000});
      await page.screenshot({path:path.join(work,'IQ-64-DRUGIE.png')});
      await page.getByRole('button',{name:'Wróć do akcji',exact:true}).click();
      await page.waitForSelector('[data-iq-phase="feedback"]');
      ensure((await page.locator('.iqE-feedback').first().innerText())===before,'Leaving the retry must restore the action');
      retried++;
      break;
    }
    const next = page.getByRole('button',{name:'Dalej',exact:true});
    if (!(await next.count())) break;
    await next.click();
    await playDecision();
    await page.waitForSelector('[data-iq-phase="feedback"]',{timeout:20000});
  }
  ensure(retried===1,'No good decision offered "Znajdź inne rozwiązanie"');
  await page.goto(url+'?fixture=finish');
  await page.waitForSelector('[data-iq-phase="decision"]');
  await page.waitForSelector('[data-iq-renderer="ready"]');
  ensure((await page.getByRole('button',{name:/^Zagraj jedno zagranie za/}).count())===0,'Only TY is controlled: no partner takeover');
  await page.screenshot({path:path.join(work,'IQ-64-OPCJE.png')});
  for (let i=0;i<12 && !(await page.locator('.iqE-summary').count());i++) {
    if (await page.locator('[data-iq-phase="feedback"]').count()) {
      const next = page.getByRole('button',{name:'Zobacz wynik',exact:true});
      if (await next.count()) { await next.click(); break; }
      await page.getByRole('button',{name:'Dalej',exact:true}).click();
    }
    await playDecision(true);
    await page.waitForSelector('[data-iq-phase="feedback"]',{timeout:20000});
  }
  if (!(await page.locator('.iqE-summary').count())) await page.getByRole('button',{name:'Zobacz wynik',exact:true}).click();
  await page.waitForSelector('.iqE-summary');
  ensure((await page.locator('.iqE-save').innerText())==='Zapisano','Finished attempt not saved');
  ensure((await page.locator('.iqE-task p').innerText()).length>10,'No field task after the action');
  ensure(await page.evaluate(()=>!!localStorage.getItem('ballwise:iq:field-task:v1:iq-browser-qa')),'Field task not stored for Start');
  ensure((await page.locator('.iqE-fact').innerText()).includes('nie wynik drużyny'),'Summary must grade TY, not the team result');
  const keyText = await page.locator('.iqE-key').innerText();
  for (const label of ['Co zrobiłeś','Co się stało','Dlaczego to ważne']) ensure(keyText.includes(label),`Key moment lacks "${label}"`);
  ensure(!/głow|ramię|bioder|spójrz|wzrok/i.test(keyText),'Key moment uses body-detail cues');
  ensure(await page.locator('.iqE-key .iqE-grade').count()===1,'Key moment needs TY grade');
  ensure((await page.locator('.iqE-upnext').innerText()).startsWith('Następna:'),'Summary must name the next situation and why');
  ensure(await page.evaluate(()=>!!localStorage.getItem('ballwise:iq:mastery:v1:iq-browser-qa')),'Progress per aim not stored');
  await page.screenshot({path:path.join(work,'IQ-64-WYNIK.png')});
  await page.locator('.iqE-more summary').click();
  ensure((await page.locator('.iqE-more a').getAttribute('href')).startsWith('https://'),'Key moment lacks the principle source');
  await page.screenshot({path:path.join(work,'IQ-64-WIECEJ.png')});
  await page.getByRole('button',{name:'Pokaż moment',exact:true}).click();
  await page.waitForSelector('[data-iq-phase="playing"]');
  await page.waitForSelector('.iqE-summary',{timeout:20000});
  await page.locator('.iqE-review summary').click();
  ensure(await page.locator('.iqE-review li').count()>0,'No decision review after the action');
  ensure(await page.locator('.iqE-review .iqE-grade').count()===await page.locator('.iqE-review li').count(),'Every decision needs a grade');
  const headingBefore = await page.locator('.iqE-summary h2').innerText();
  const scoreBefore = await page.locator('.iqE-context > span').first().innerText();
  await page.locator('.iqE-review li button').first().click();
  await page.waitForSelector('.iqE-better');
  ensure(await page.locator('.iqE-summary h2').innerText()===headingBefore,'Opening a decision changed the result heading');
  ensure(await page.locator('.iqE-context > span').first().innerText()===scoreBefore,'Opening a decision changed the score');
  await page.screenshot({path:path.join(work,'IQ-64-OCENA.png')});
  await page.getByRole('button',{name:'Cała akcja',exact:true}).click();
  await page.waitForSelector('.iqE-replay-key');
  await page.getByRole('slider',{name:'Czas powtórki',exact:true}).fill('5');
  await page.screenshot({path:path.join(work,'IQ-64-ANALIZA.png')});
  const max = await page.getByRole('slider',{name:'Czas powtórki',exact:true}).getAttribute('max');
  await page.getByRole('slider',{name:'Czas powtórki',exact:true}).fill(String(Number((+max - 0.05).toFixed(2))));
  await page.getByRole('button',{name:'Wznów akcję',exact:true}).click();
  await page.waitForSelector('.iqE-summary',{timeout:20000});
  await page.getByRole('button',{name:'Sprawdź w nowym układzie',exact:true}).click();
  ensure((await page.locator('.iqE-context').innerText()).includes('Nowy układ'),'No transfer variant');
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await page.waitForSelector('[data-iq-phase="decision"]');
  if (await page.locator('.iqE-predict').count()) await page.locator('.iqE-predict .iqE-options button').first().click();
  await noHints();
  ensure(await page.locator('canvas[data-iq-broadcast="true"]').count()===1,'The TV side view is the only view');
  ensure(await page.getByRole('button',{name:/^Widok /}).count()===0,'No view toggle');
  if(await page.getByText('Masz piłkę.',{exact:false}).count()) {
    await tapSpace();
    const planned = await page.locator('.iqE-plan').innerText();
    ensure(planned.includes('Podanie'),`Free tap far from the ball should plan a pass, got: ${planned}`);
    await page.getByRole('button',{name:'Zagraj',exact:true}).click();
    await page.waitForFunction(()=>['decision','summary'].includes(document.querySelector('[data-iq-engine="9"]').dataset.iqPhase),{timeout:20000});
    ensure((await page.locator('[data-iq-phase="feedback"]').count())===0,'Intermediate grade in independent mode');
    const raw=await page.evaluate(()=>localStorage.getItem('ballwise:iq:journeys:v1:iq-browser-qa:draft')??localStorage.getItem('ballwise:iq:journeys:v1:iq-browser-qa'));
    ensure(raw.includes(':pass:'),'Free-space pass did not reach stored decisions');
  }
  await page.getByRole('button',{name:'Wybierz sytuację',exact:true}).click();
  await page.getByRole('button',{name:'Wszystkie pozycje',exact:true}).click();
  await page.getByRole('button',{name:/Kontra 3 na 2 po odbiorze/}).click();
  await page.getByRole('heading',{name:'Kontra 3 na 2 po odbiorze',exact:true}).waitFor();
  await page.waitForSelector('.iqE-start');
  await page.screenshot({path:path.join(work,'IQ-64-KONTRA.png')});
  // Defending gestures: a tap on the rival with the ball plans a press.
  await page.getByRole('button',{name:'Wybierz sytuację',exact:true}).click();
  await page.getByRole('button',{name:/Reakcja zaraz po stracie/}).click();
  await page.getByRole('heading',{name:'Reakcja zaraz po stracie',exact:true}).waitFor();
  await page.waitForSelector('[data-iq-renderer="ready"]');
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await playDecision();
  ensure(pressed>0,'No defending decision was checked');
  await page.screenshot({path:path.join(work,'IQ-64-DOSKOK.png')});
  await page.getByRole('button',{name:'Wybierz sytuację',exact:true}).click();
  await page.getByRole('button',{name:/Kontra 3 na 2 po odbiorze/}).click();
  await page.waitForSelector('.iqE-start');
  await page.getByRole('button',{name:'Jak grać',exact:true}).click();
  ensure(await page.locator('.iqE-sources a').count()>0,'Help sheet has no sources');
  await fs.writeFile(path.join(work,'wynik-iq-learning.json'),JSON.stringify({views,errors,pressed,retried,flow:'truthful start → no hints before decisions → tap decisions beyond 3 → other solution replay → find another solution → shot by goal tap → saved result → replay and seeking → independent variant → situation picker → sources'},null,2));
  ensure(errors.length===0,JSON.stringify(errors));
  // With the 3D models blocked the lesson must not start on an empty pitch.
  const blocked = await browser.newPage({viewport:{width:390,height:700}, deviceScaleFactor:1});
  await blocked.route(/\.(fbx|glb)(\?.*)?$/, () => {});
  await blocked.goto(url+'?position=goalkeeper');
  await blocked.waitForSelector('.iqE-start');
  await blocked.waitForTimeout(1500);
  ensure(await blocked.locator('[data-iq-renderer="loading"]').count()===1,'Blocked FBX should keep the pitch loading');
  ensure(await blocked.getByRole('button',{name:'Start',exact:true}).isDisabled(),'Start must wait for the 3D pitch');
  await blocked.close();
} catch(e) { console.error(e); console.error("UI errors",errors); await activePage?.screenshot({path:path.join(work,"FAILURE.png")}); console.error(await activePage?.locator("body").innerText()); await fs.writeFile(path.join(work,"failure.json"),JSON.stringify({error:String(e),errors})); throw e; } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
