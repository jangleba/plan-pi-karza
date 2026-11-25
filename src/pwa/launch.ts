import { useSyncExternalStore } from "react";
import { launchTarget, stripLaunchParams, type LaunchTarget } from "./platform";

/**
 * Cel uruchomienia: ikona (→ „Dziś”), skrót, kliknięte powiadomienie (→ wiadomość, plan, trening w toku).
 * Odczytany raz z adresu, potem usunięty z adresu (odświeżenie nie otwiera go drugi raz).
 */
let pending: { target: LaunchTarget; id: string | null } | null = null;
let read = false;
const subs = new Set<() => void>();

function readInitial(): void {
  if (read || typeof window === "undefined") return;
  read = true;
  const target = launchTarget(location.search);
  if (!target) return;
  pending = { target, id: new URLSearchParams(location.search).get("id") };
  try { history.replaceState(history.state, "", stripLaunchParams(location.href)); } catch { /* bez historii */ }
}

/** Cel z adresu w chwili startu (wywołać przed pierwszym renderem zakładek). */
export function initialLaunch(): LaunchTarget {
  readInitial();
  return pending?.target ?? null;
}

/** Przejście z powiadomienia, gdy aplikacja jest już otwarta (komunikat z service workera). */
export function openFromUrl(url: string): void {
  try {
    const u = new URL(url, location.origin);
    if (u.origin !== location.origin) return;
    const target = launchTarget(u.search);
    if (!target) return;
    pending = { target, id: u.searchParams.get("id") };
    subs.forEach((f) => f());
  } catch { /* nieprawidłowy adres */ }
}

/** Zużycie celu: komponent, który go obsłużył, czyści go, żeby nie otwierać drugi raz. */
export function takeLaunch(): { target: LaunchTarget; id: string | null } | null {
  const p = pending;
  pending = null;
  return p;
}

let version = 0;
subs.add(() => { version++; });
export function useLaunchVersion(): number {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version, () => 0);
}
