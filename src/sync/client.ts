import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "../lib/supabase";
import { getScope, scoped } from "../lib/store";
import { loadConsent } from "../legal/consent";
import type { CompletionRecord } from "../workout/run";
import { dismissNotice, enqueue, parseOutbox, retryNow, statusOf, type OutboxItem, type OutboxState, type SyncStatus } from "./outbox";
import { flush, type SendResult } from "./flush";

/**
 * Warstwa przeglądarki dla kolejki zapisów: pamięć (przestrzeń konta), wysyłka przez Supabase, wyzwalacze
 * (start, powrót sieci, powrót do aplikacji, co minutę) i stan do wyświetlenia.
 * Background Sync nie jest wymagany (działa tylko w Chromium); synchronizacja odbywa się, gdy aplikacja jest otwarta.
 */
const KEY = "outbox";
const subs = new Set<() => void>();
let cache: { raw: string | null; state: OutboxState } = { raw: null, state: parseOutbox(null) };

function read(): OutboxState {
  const raw = scoped.getItem(KEY);
  if (raw !== cache.raw) cache = { raw, state: parseOutbox(raw) };
  return cache.state;
}
function write(s: OutboxState): void {
  const raw = JSON.stringify(s);
  scoped.setItem(KEY, raw);
  cache = { raw, state: s };
  subs.forEach((f) => f());
}
const store = { read, write };

export type Mode = "account" | "guest" | "no_consent" | "unconfigured";
export function syncMode(): Mode {
  if (!supabase) return "unconfigured";
  if (getScope().kind !== "user") return "guest";
  return loadConsent("health_sync").granted ? "account" : "no_consent";
}

/** Zapis wykonania: najpierw na urządzenie, potem (gdy można) na konto. */
export function queueCompletion(c: CompletionRecord): void {
  if (syncMode() === "unconfigured" || syncMode() === "guest") return; // gość: historia zostaje na urządzeniu (jak dotąd)
  write(enqueue(read(), { id: c.id, kind: "session_log", payload: c }, Date.now()));
  void syncNow();
}

async function send(item: OutboxItem): Promise<SendResult> {
  if (!supabase) return { ok: false, retryable: false, error: "brak konfiguracji" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, retryable: true, offline: true, error: "brak sieci" };
  try {
    const { data, error } = await supabase.rpc("record_session_log", { p: item.payload });
    if (error) {
      const msg = error.message ?? "błąd serwera";
      const transient = /fetch|network|timeout|50\d|429/i.test(msg) || error.code === "" || error.code === undefined;
      if ((error as { hint?: string }).hint === "no_consent") return { ok: false, retryable: false, error: "synchronizacja wyłączona" };
      return { ok: false, retryable: transient, error: msg };
    }
    const outcome = (data as { outcome?: string } | null)?.outcome;
    if (outcome === "inserted" || outcome === "duplicate" || outcome === "updated" || outcome === "kept_server" || outcome === "replaced") return { ok: true, outcome };
    return { ok: false, retryable: true, error: "nieznana odpowiedź serwera" };
  } catch (e) {
    return { ok: false, retryable: true, offline: true, error: e instanceof Error ? e.message : "brak sieci" };
  }
}

let running: Promise<void> | null = null;
/** Jedna runda naraz; między kartami pilnuje tego Web Locks API (tam, gdzie jest), a serwer i tak jest idempotentny. */
export function syncNow(): Promise<void> {
  if (syncMode() !== "account") return Promise.resolve();
  if (running) return running;
  const go = async () => { await flush(store, send, () => Date.now()); };
  const locks = (typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: { request: (n: string, o: { ifAvailable: boolean }, cb: (l: unknown) => Promise<void>) => Promise<void> } }).locks : undefined);
  running = (locks ? locks.request("bw-sync", { ifAvailable: true }, async (l) => { if (l) await go(); }) : go())
    .catch(() => undefined)
    .finally(() => { running = null; subs.forEach((f) => f()); });
  return running;
}

/** Wyzwalacze synchronizacji – zamontować raz w aplikacji (po zalogowaniu). */
export function useSyncTriggers(): void {
  useEffect(() => {
    const kick = () => { write(retryNow(read(), Date.now())); void syncNow(); };
    const onVis = () => { if (document.visibilityState === "visible") void syncNow(); };
    const onStorage = (e: StorageEvent) => { if (e.key?.endsWith(`:${KEY}`)) subs.forEach((f) => f()); }; // zmiana w innej karcie
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    const id = setInterval(() => { if (document.visibilityState === "visible") void syncNow(); }, 60_000);
    void syncNow();
    return () => { window.removeEventListener("online", kick); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("storage", onStorage); clearInterval(id); };
  }, []);
}

export interface SyncView { mode: Mode; status: SyncStatus; notices: OutboxState["notices"] }
let snap: { key: string; view: SyncView } | null = null;
function view(): SyncView {
  const s = read();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const mode = syncMode();
  const key = `${cache.raw}|${online}|${mode}`;
  if (snap?.key !== key) snap = { key, view: { mode, status: statusOf(s, online), notices: s.notices } };
  return snap.view;
}
export function useSyncView(): SyncView {
  useEffect(() => {
    const f = () => subs.forEach((x) => x());
    window.addEventListener("online", f); window.addEventListener("offline", f);
    return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); };
  }, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, view, view);
}

export const dismiss = (id: string): void => write(dismissNotice(read(), id));
export const retry = (): void => { write(retryNow(read(), Date.now())); void syncNow(); };
