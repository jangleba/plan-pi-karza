/* BallWise – service worker (ręcznie napisany, bez wtyczek budowania).
 *
 * Zasady:
 *  – Ekran aplikacji (HTML): najpierw sieć z limitem czasu, przy braku sieci ostatnia zapisana wersja. Dzięki temu nowa wersja
 *    aplikacji trafia do zawodnika od razu, a offline nadal otwiera się „Dziś”.
 *  – Pliki z odciskiem w nazwie (np. index-3f9a1c2b.js): z pamięci, bo nigdy się nie zmieniają.
 *  – Pozostałe pliki z tej samej domeny: z pamięci, w tle odświeżane.
 *  – Zapytania do API i Supabase NIE są tu buforowane: dane offline trzyma sama aplikacja (kolejka zapisów, ostatni plan).
 *  – Nowy service worker NIE przejmuje strony sam: czeka, aż zawodnik dotknie „Odśwież” (żeby nie podmieniać wersji w trakcie treningu).
 *
 * Zmiana logiki tego pliku = podnieś VERSION (przeglądarka porównuje bajty pliku i wtedy instaluje nową wersję).
 */
const VERSION = "2026-11-25.1";
const SHELL = `bw-shell-${VERSION}`;
const ASSETS = "bw-assets";
const RUNTIME = "bw-runtime";
const APP_SHELL_URL = "/";
const PRECACHE = [APP_SHELL_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/favicon.svg"];
const NAV_TIMEOUT_MS = 3500;
const MAX_ASSETS = 160;
const MAX_RUNTIME = 60;

const HASHED = /[-.][A-Za-z0-9_-]{8,}\.(?:js|mjs|css|woff2?|ttf|png|jpe?g|svg|webp|avif|wasm|glb|json)$/;
const NEVER_CACHE = /^\/(?:api\/|auth\/|rest\/|functions\/|sw\.js$)/;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // pojedynczo: brak jednej ikony nie może zablokować instalacji całego service workera
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (cacheable(res)) await cache.put(url, res);
      } catch { /* offline podczas instalacji – uzupełni się przy następnym wejściu */ }
    }));
  })());
  // brak skipWaiting(): nowa wersja czeka na zgodę zawodnika (komunikat SKIP_WAITING)
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS, RUNTIME]);
    for (const key of await caches.keys()) if (key.startsWith("bw-") && !keep.has(key)) await caches.delete(key);
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch { /* nieobsługiwane */ } }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  // strona załadowana, zanim service worker przejął kontrolę: dopisujemy jej pliki do pamięci (pierwsze wejście też działa offline)
  if (data.type === "WARM" && Array.isArray(data.urls)) event.waitUntil(warm(data.urls));
  if (data.type === "VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, czcionki, mapy – bez ingerencji
  if (NEVER_CACHE.test(url.pathname)) return;
  if (req.mode === "navigate") { event.respondWith(navigation(event)); return; }
  if (HASHED.test(url.pathname)) { event.respondWith(cacheFirst(req)); return; }
  event.respondWith(staleWhileRevalidate(req, event));
});

/** Tylko pełne, bezpośrednie odpowiedzi z tej domeny (Safari odrzuca przekierowane odpowiedzi podane przy nawigacji). */
function cacheable(res) {
  return !!res && res.ok && res.status === 200 && res.type === "basic" && !res.redirected;
}

async function navigation(event) {
  const req = event.request;
  const cache = await caches.open(SHELL);
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : undefined;
    const res = preload || await withTimeout(fetch(req), NAV_TIMEOUT_MS);
    if (cacheable(res)) {
      // aplikacja renderuje się po stronie przeglądarki: każdy adres dostaje tę samą powłokę, więc zapisujemy ją pod „/”
      await cache.put(APP_SHELL_URL, res.clone());
      return res;
    }
    if (res && res.status < 500) return res;
    throw new Error(`HTTP ${res && res.status}`);
  } catch {
    const cached = (await cache.match(APP_SHELL_URL)) || (await caches.match(APP_SHELL_URL));
    if (cached) return cached;
    return offlinePage();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) { await cache.put(req, res.clone()); void trim(ASSETS, MAX_ASSETS); }
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(RUNTIME);
  const hit = (await cache.match(req)) || (await caches.match(req));
  const update = fetch(req).then(async (res) => {
    if (cacheable(res)) { await cache.put(req, res.clone()); void trim(RUNTIME, MAX_RUNTIME); }
    return res;
  }).catch(() => undefined);
  if (hit) { event.waitUntil(update); return hit; }
  const res = await update;
  return res || new Response("", { status: 504, statusText: "offline" });
}

async function warm(urls) {
  const own = urls.map((u) => { try { return new URL(u, self.location.origin); } catch { return null; } })
    .filter((u) => u && u.origin === self.location.origin && !NEVER_CACHE.test(u.pathname));
  await Promise.all(own.map(async (u) => {
    const name = HASHED.test(u.pathname) ? ASSETS : RUNTIME;
    const cache = await caches.open(name);
    if (await cache.match(u.href)) return;
    try { const res = await fetch(u.href); if (cacheable(res)) await cache.put(u.href, res); } catch { /* offline */ }
  }));
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function offlinePage() {
  const html = `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BallWise – offline</title>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#f7f8fa;color:#1d1d1f;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px">
<div><h1 style="font-size:24px">Brak połączenia</h1><p style="color:#6e6e73">BallWise nie był jeszcze otwarty na tym urządzeniu z internetem.<br>Połącz się raz, a potem plan będzie dostępny także offline.</p>
<button onclick="location.reload()" style="margin-top:16px;padding:14px 22px;border-radius:16px;border:0;background:#2f6fb3;color:#fff;font-size:16px">Spróbuj ponownie</button></div></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* ---------- Powiadomienia ---------- */

/** Dozwolone cele kliknięcia: tylko adresy tej aplikacji (powiadomienie nie może przenieść na obcą stronę). */
function targetUrl(data) {
  const open = data && typeof data.open === "string" ? data.open : "today";
  const allowed = ["today", "message", "plan", "workout"];
  const u = new URL("/", self.location.origin);
  u.searchParams.set("open", allowed.includes(open) ? open : "today");
  if (data && typeof data.id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(data.id)) u.searchParams.set("id", data.id);
  return u.href;
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "BallWise";
  const options = {
    body: typeof data.body === "string" ? data.body.slice(0, 240) : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: typeof data.tag === "string" ? data.tag.slice(0, 40) : undefined,
    data: { url: targetUrl(data) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || targetUrl({});
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const own = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (own) {
      // otwarta aplikacja: przechodzi do właściwego miejsca bez przeładowania (aktywny trening zostaje)
      own.postMessage({ type: "OPEN", url });
      return own.focus();
    }
    return self.clients.openWindow(url);
  })());
});
