/**
 * Zapis postępu: lokalny (zawsze, w przestrzeni bieżącego gościa/konta) i opcjonalnie na koncie (po zalogowaniu).
 *
 *  – „Zapisano” pokazujemy dopiero po potwierdzeniu: zapis lokalny jest odczytywany z powrotem, a zapis na koncie ma
 *    potwierdzenie serwera (zwrócone wiersze). Błąd nie jest ukrywany: postęp zostaje lokalnie jako „oczekujący” i można ponowić.
 *  – Dostęp na serwerze pilnuje RLS (wiersze tylko właściciela); klient dodatkowo wysyła dane wyłącznie wtedy, gdy sesja Supabase
 *    należy do tej samej przestrzeni danych (patrz `uid` w lib/sync).
 */
import { getScope, scopeId, scoped } from "../lib/store";
import { supabase } from "../lib/supabase";
import { uid } from "../lib/sync";
import { clearDirty, emptyDoc, mergeRemote, parseDoc, pendingRows, type EnglishDoc } from "./progress";

const KEY = "english";
const TABLE = "english_progress";
const BATCH = 100;

export function loadDoc(): EnglishDoc {
  try {
    const raw = scoped.getItem(KEY);
    return raw ? parseDoc(JSON.parse(raw)) : emptyDoc();
  } catch {
    return emptyDoc();
  }
}

/** Zapis lokalny z weryfikacją odczytem (przeglądarka potrafi po cichu odrzucić zapis: brak miejsca, tryb prywatny). */
export function saveDoc(doc: EnglishDoc): boolean {
  try {
    const json = JSON.stringify(doc);
    scoped.setItem(KEY, json);
    return scoped.getItem(KEY) === json;
  } catch {
    return false;
  }
}

export type CloudState = "off" | "idle" | "syncing" | "ok" | "error";
export interface SyncStatus {
  /** Czy ostatni zapis lokalny został potwierdzony. */
  local: "ok" | "failed";
  cloud: CloudState;
  message?: string;
  /** Liczba zmian czekających na potwierdzenie przez konto. */
  pending: number;
}

let status: SyncStatus = { local: "ok", cloud: "idle", pending: 0 };
const listeners = new Set<(s: SyncStatus) => void>();
const setStatus = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; for (const l of listeners) l(status); };
export const getStatus = (): SyncStatus => status;
export function subscribe(fn: (s: SyncStatus) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** Do testów i przy zmianie konta. */
export function resetStatus(): void { status = { local: "ok", cloud: "idle", pending: 0 }; if (timer) { clearTimeout(timer); timer = null; } inflight = null; }

export type CloudResult = { state: "off" } | { state: "ok"; pushed: number } | { state: "error"; message: string };

let inflight: { scope: string; p: Promise<CloudResult> } | null = null;

/** Synchronizacja z kontem: pobranie i łączenie (wygrywa nowszy znacznik czasu), potem wysłanie oczekujących zmian z potwierdzeniem serwera. */
export function syncCloud(): Promise<CloudResult> {
  const sc = scopeId(getScope());
  if (inflight && inflight.scope === sc) return inflight.p;
  const p = doSync(sc).finally(() => { if (inflight?.p === p) inflight = null; });
  inflight = { scope: sc, p };
  return p;
}

async function doSync(sc: string): Promise<CloudResult> {
  const user = await uid();
  if (!supabase || !user) { setStatus({ cloud: "off", message: undefined }); return { state: "off" }; }
  setStatus({ cloud: "syncing" });
  const fail = (message: string): CloudResult => { setStatus({ cloud: "error", message, pending: loadDoc().dirty.length }); return { state: "error", message }; };
  try {
    const pulled = await supabase.from(TABLE).select("item,data").eq("user_id", user);
    if (pulled.error) return fail(pulled.error.message);
    if (scopeId(getScope()) !== sc) return { state: "off" }; // w międzyczasie zmieniło się konto – niczego nie zapisujemy
    const remote = (pulled.data ?? []) as Array<{ item: string; data: unknown }>;

    const sent: Record<string, number> = {};
    const rows = pendingRows(mergeRemote(loadDoc(), remote).doc);
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const res = await supabase.from(TABLE).upsert(chunk.map((r) => ({ user_id: user, item: r.item, data: r.data })), { onConflict: "user_id,item" }).select("item");
      if (res.error) { persistMerged(remote, {}); return fail(res.error.message); }
      if ((res.data?.length ?? 0) !== chunk.length) { persistMerged(remote, sent); return fail("Serwer nie potwierdził zapisu wszystkich zmian."); }
      for (const r of chunk) sent[r.item] = r.data.ts as number;
    }
    if (scopeId(getScope()) !== sc) return { state: "off" };
    const finalDoc = persistMerged(remote, sent);
    setStatus({ cloud: "ok", message: undefined, pending: finalDoc.dirty.length });
    return { state: "ok", pushed: rows.length };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Błąd połączenia.");
  }
}

/** Po awarii sieci dane pobrane z konta nadal trafiają do postępu lokalnego (świeży odczyt: użytkownik mógł w międzyczasie odpowiadać). */
function persistMerged(remote: Array<{ item: string; data: unknown }>, sent: Record<string, number>): EnglishDoc {
  const merged = clearDirty(mergeRemote(loadDoc(), remote).doc, sent);
  const ok = saveDoc(merged);
  setStatus({ local: ok ? "ok" : "failed" });
  return merged;
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Zapis na koncie z opóźnieniem po serii odpowiedzi (nie wysyłamy po każdym kliknięciu). */
export function scheduleSync(ms = 1500): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncCloud(); }, ms);
}

export interface SaveOutcome { local: boolean; cloud: CloudResult["state"] | "skipped" }

/**
 * Zapis po kroku: lokalnie od razu (z weryfikacją), konto – z opóźnieniem. Zwraca, czy zapis lokalny został POTWIERDZONY.
 */
export function commit(doc: EnglishDoc): boolean {
  const ok = saveDoc(doc);
  setStatus({ local: ok ? "ok" : "failed", pending: doc.dirty.length });
  if (ok && doc.dirty.length) scheduleSync();
  return ok;
}

/** Zapis na koniec lekcji: czekamy na potwierdzenie (lokalne i, dla konta, serwera), zanim pokażemy sukces. */
export async function commitAndConfirm(doc: EnglishDoc): Promise<SaveOutcome> {
  const local = saveDoc(doc);
  setStatus({ local: local ? "ok" : "failed", pending: doc.dirty.length });
  if (!local) return { local: false, cloud: "skipped" };
  if (timer) { clearTimeout(timer); timer = null; }
  const cloud = await syncCloud();
  return { local: true, cloud: cloud.state };
}
