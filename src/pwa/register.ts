import { useEffect, useState, useSyncExternalStore } from "react";
import { installContext, type InstallContext } from "./platform";

/**
 * Rejestracja service workera, aktualizacje, okno instalacji (Android) i trwałość pamięci.
 * Działa tylko w zbudowanej aplikacji (w trybie deweloperskim service worker przeszkadzałby w podglądzie Lovable/Vite).
 */
type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

const state = {
  waiting: null as ServiceWorker | null,
  installPrompt: null as BeforeInstallPromptEvent | null,
  installed: false,
};

let started = false;

/** Wywołać raz po starcie aplikacji w przeglądarce. */
export function startPwa(onOpen?: (url: string) => void): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // okno instalacji pojawia się wcześnie, często zanim React zdąży się zamontować – łapiemy je od razu
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.installPrompt = e as BeforeInstallPromptEvent; emit(); });
  window.addEventListener("appinstalled", () => { state.installPrompt = null; state.installed = true; emit(); });

  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  const sw = navigator.serviceWorker;

  // kliknięte powiadomienie, gdy aplikacja jest już otwarta: przejście bez przeładowania
  sw.addEventListener("message", (e: MessageEvent) => {
    const d = e.data as { type?: string; url?: string } | null;
    if (d?.type === "OPEN" && typeof d.url === "string") onOpen?.(d.url);
  });

  // po zgodzie zawodnika („Odśwież”) nowa wersja przejmuje stronę; jedno przeładowanie
  let reloaded = false;
  sw.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });

  const register = async () => {
    try {
      const reg = await sw.register("/sw.js", { scope: "/" });
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener("statechange", () => { if (w.state === "installed" && sw.controller) { state.waiting = w; emit(); } });
      };
      if (reg.waiting && sw.controller) { state.waiting = reg.waiting; emit(); }
      track(reg.installing);
      reg.addEventListener("updatefound", () => track(reg.installing));
      warm(reg);
      // sprawdzanie nowej wersji przy powrocie do aplikacji (najczęściej co godzinę)
      let last = Date.now();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - last > 60 * 60_000) { last = Date.now(); void reg.update().catch(() => undefined); }
      });
    } catch (e) {
      console.warn("[BallWise] service worker niedostępny", e);
    }
  };
  if (document.readyState === "complete") void register(); else window.addEventListener("load", () => void register(), { once: true });
}

/** Pliki pobrane przy pierwszym wejściu, zanim service worker przejął stronę: dopisujemy je do pamięci offline. */
function warm(reg: ServiceWorkerRegistration): void {
  void navigator.serviceWorker.ready.then(() => {
    const urls = new Set<string>([location.origin + "/"]);
    for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      if (e.name.startsWith(location.origin) && /\.(m?js|css|woff2?|png|svg|webp)(\?|$)/.test(e.name)) urls.add(e.name);
    }
    document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src],link[rel=stylesheet],link[rel=modulepreload]").forEach((el) => {
      const u = "src" in el && el.src ? el.src : (el as HTMLLinkElement).href;
      if (u?.startsWith(location.origin)) urls.add(u);
    });
    (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "WARM", urls: [...urls] });
  });
}

/** Zawodnik zgodził się na aktualizację (nie podmieniamy wersji w trakcie treningu bez jego wiedzy). */
export function applyUpdate(): void {
  state.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribe, () => state.waiting !== null, () => false);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

export function currentInstallContext(): InstallContext {
  return installContext({ userAgent: navigator.userAgent, standalone: isStandalone() || state.installed, canPrompt: state.installPrompt !== null, maxTouchPoints: navigator.maxTouchPoints });
}

export function useInstallContext(): InstallContext {
  return useSyncExternalStore(subscribe, currentInstallContext, () => "desktop");
}

/** Okno instalacji przeglądarki (Chromium/Android). Zwraca true, gdy zawodnik je zaakceptował. */
export async function promptInstall(): Promise<boolean> {
  const p = state.installPrompt;
  if (!p) return false;
  state.installPrompt = null; emit(); // zdarzenia nie można użyć drugi raz
  await p.prompt();
  const { outcome } = await p.userChoice;
  return outcome === "accepted";
}

/**
 * Prośba o trwałą pamięć: przeglądarka rzadziej usuwa wtedy dane offline (plan, zapisy czekające na wysłanie).
 * Bez okna zgody w Chrome i Safari; wynik zależy od przeglądarki.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

/** Stan połączenia (z poprawką po powrocie do aplikacji). */
export function useOnline(): boolean {
  const [on, setOn] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}
