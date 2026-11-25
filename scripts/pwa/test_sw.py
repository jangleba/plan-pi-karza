# Uruchomienie: python3 scripts/pwa/test_sw.py  (wymaga: pip install playwright, Chrome; zmienna CHROME = ścieżka do przeglądarki)
# Testy service workera, manifestu i offline w prawdziwym Chrome (Playwright, CDP).
import json, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
PORT = 8765; BASE = f"http://localhost:{PORT}"
import os; srv = subprocess.Popen([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.py"), str(PORT)]); time.sleep(0.8)
results = []
def check(ok, name, detail=""):
    results.append((ok, name)); print(("✔ " if ok else "✖ ") + name + (f"  [{detail}]" if detail and not ok else ""))
REG = """async () => { const r = await navigator.serviceWorker.register('/sw.js', {scope:'/'}); await navigator.serviceWorker.ready; return !!r.active; }"""
try:
  with sync_playwright() as p:
    import tempfile
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome")); b = ctx  # profil trwały (nie incognito), jak u zawodnika
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    cdp = ctx.new_cdp_session(page)
    page.goto(BASE + "/?source=pwa"); page.wait_for_function("window.APP_OK === true")
    # 1. manifest i kryteria instalacji Chrome
    cdp.send("Page.enable")
    man = cdp.send("Page.getAppManifest")
    errs = cdp.send("Page.getManifestIcons") if False else None
    parsed = json.loads(urllib.request.urlopen(BASE + "/manifest.webmanifest").read())
    check(man.get("url", "").endswith("/manifest.webmanifest") and not man.get("errors"), "manifest wczytany przez Chrome bez błędów", str(man.get("errors")))
    check(parsed["display"] == "standalone" and parsed["start_url"] == "/?source=pwa" and any(i["sizes"] == "512x512" for i in parsed["icons"]) and any(i.get("purpose") == "maskable" for i in parsed["icons"]), "manifest: standalone, start_url → Dziś, ikony 192/512 i maskable")
    # 2. rejestracja i instalacja
    active = page.evaluate(REG)
    check(active, "service worker zainstalowany i aktywny")
    page.reload(); page.wait_for_function("window.APP_OK === true")
    check(page.evaluate("!!navigator.serviceWorker.controller"), "po ponownym wejściu strona jest kontrolowana przez service workera")
    inst = cdp.send("Page.getInstallabilityErrors")
    check(not inst["installabilityErrors"], "Chrome: brak błędów instalowalności (PWA do zainstalowania)", str(inst["installabilityErrors"]))
    # 3. pierwsze wejście: pliki pobrane przed przejęciem kontroli trafiają do pamięci (WARM)
    page.evaluate("""() => navigator.serviceWorker.controller.postMessage({type:'WARM', urls: performance.getEntriesByType('resource').map(e=>e.name).concat([location.origin + '/'])})""")
    time.sleep(0.8)
    keys = page.evaluate("""async () => { const out = {}; for (const n of await caches.keys()) out[n] = (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname); return out; }""")
    allp = sum(keys.values(), [])
    check("/" in allp and "/icons/icon-192.png" in allp and "/manifest.webmanifest" in allp, "powłoka, manifest i ikony w pamięci offline", str(keys))
    check("/assets/index-a1b2c3d4.js" in allp and "/assets/app-3f9a1c2b.css" in allp, "skrypt i style z pierwszego wejścia zapisane (WARM)", str(keys))
    # 4. API nie jest buforowane
    page.evaluate("fetch('/api/foods?q=x').then(r=>r.text())"); time.sleep(0.3)
    keys2 = page.evaluate("""async () => { const out = []; for (const n of await caches.keys()) out.push(...(await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname)); return out; }""")
    check(not any(k.startswith("/api/") for k in keys2), "odpowiedzi API nie trafiają do pamięci service workera")
    # 5. brak internetu: ponowne wejście z ikony i na inny adres
    ctx.set_offline(True)
    page.goto(BASE + "/?source=pwa"); page.wait_for_function("window.APP_OK === true", timeout=8000)
    check(page.inner_text("#app") == "app-loaded", "offline: aplikacja otwiera się z ikony (powłoka + skrypty z pamięci)")
    page.goto(BASE + "/plan"); page.wait_for_function("window.APP_OK === true", timeout=8000)
    check(True, "offline: inny adres aplikacji też się otwiera (ta sama powłoka)")
    ctx.set_offline(False)
    # 6. aktualizacja: nowa wersja czeka, nie przejmuje strony sama
    urllib.request.urlopen(urllib.request.Request(BASE + "/__swversion", data=b"2026-12-01.2", method="POST"))
    page.goto(BASE + "/"); page.wait_for_function("window.APP_OK === true")
    st = page.evaluate("""async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update();
       for (let i=0;i<50 && !r.waiting;i++) await new Promise(s=>setTimeout(s,100));
       const ch = new MessageChannel(); const v = await new Promise(res => { ch.port1.onmessage = e => res(e.data.version); navigator.serviceWorker.controller.postMessage({type:'VERSION'}, [ch.port2]); });
       return { waiting: !!r.waiting, controllerVersion: v }; }""")
    check(st["waiting"] and st["controllerVersion"] == "2026-11-25.1", "nowa wersja czeka; stara obsługuje stronę do decyzji zawodnika", str(st))
    sw2 = page.evaluate("""async () => { const r = await navigator.serviceWorker.getRegistration();
       const changed = new Promise(res => navigator.serviceWorker.addEventListener('controllerchange', res, {once:true}));
       r.waiting.postMessage({type:'SKIP_WAITING'}); await changed;
       const ch = new MessageChannel(); const v = await new Promise(res => { ch.port1.onmessage = e => res(e.data.version); navigator.serviceWorker.controller.postMessage({type:'VERSION'}, [ch.port2]); });
       let c = []; for (let i=0;i<30;i++) { c = await caches.keys(); if (!c.includes('bw-shell-2026-11-25.1')) break; await new Promise(s=>setTimeout(s,100)); } return { v, caches: c }; }""")
    check(sw2["v"] == "2026-12-01.2" and "bw-shell-2026-11-25.1" not in sw2["caches"] and "bw-shell-2026-12-01.2" in sw2["caches"], "po „Odśwież”: nowa wersja przejmuje stronę, stara pamięć powłoki usunięta, pliki z odciskiem zostają", str(sw2))
    # 7. powiadomienie push → treść i bezpieczny adres kliknięcia
    ctx.grant_permissions(["notifications"], origin=BASE)
    reg_id = None
    swcdp = ctx.new_cdp_session(page); swcdp.send("ServiceWorker.enable")
    regs = []
    swcdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: regs.extend(e["registrations"]))
    swcdp.send("ServiceWorker.disable"); swcdp.send("ServiceWorker.enable"); time.sleep(0.5)
    reg_id = next((r["registrationId"] for r in regs if r["scopeURL"].startswith(BASE)), None)
    for data, expect_open in [({"title": "Wiadomość od trenera", "body": "Dobra robota", "open": "message", "id": "m-1"}, "open=message&id=m-1"), ({"title": "x", "open": "javascript:alert(1)"}, "open=today")]:
        page.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(); (await r.getNotifications()).forEach(n => n.close()); }")
        swcdp.send("ServiceWorker.deliverPushMessage", {"origin": BASE, "registrationId": reg_id, "data": json.dumps(data)})
        n = None
        for _ in range(30):
            n = page.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(); const ns = await r.getNotifications(); return ns.map(x => ({title: x.title, body: x.body, url: x.data && x.data.url})); }")
            if n: break
            time.sleep(0.1)
        check(bool(n) and expect_open in (n[0]["url"] or "") and n[0]["url"].startswith(BASE), f"push → powiadomienie z adresem tej aplikacji ({expect_open})", str(n))
    b.close()
finally:
    srv.terminate()
fails = [n for ok, n in results if not ok]
print(f"\n{len(results) - len(fails)}/{len(results)} zaliczonych")
sys.exit(1 if fails else 0)
