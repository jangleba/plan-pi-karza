/**
 * Kolejka zapisów do wysłania (offline-first). Zapis trafia NAJPIERW do pamięci urządzenia, potem – gdy jest sieć –
 * na serwer. Każdy element ma stały identyfikator (klucz idempotencji): ponowna wysyłka po zerwanym połączeniu,
 * dwa dotknięcia „Zakończ” albo dwie otwarte karty nie tworzą duplikatów (serwer rozpoznaje identyfikator).
 *
 * Czyste funkcje na niezmiennym stanie + prosty adapter pamięci; bez zależności od przeglądarki (testowalne).
 */
export type ItemKind = "session_log";

export interface OutboxItem<P = unknown> {
  id: string;
  kind: ItemKind;
  payload: P;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
}

export interface Notice { id: string; at: number; text: string }

export interface OutboxState {
  v: 1;
  items: OutboxItem[];
  /** Ostatnie udane połączenie z serwerem (do komunikatu „zsynchronizowano o …”). */
  lastSyncAt: number | null;
  /** Ostatni błąd (tylko do wyświetlenia). */
  lastError: string | null;
  /** Komunikaty dla zawodnika, np. rozstrzygnięty konflikt; ograniczona liczba. */
  notices: Notice[];
}

export const EMPTY: OutboxState = { v: 1, items: [], lastSyncAt: null, lastError: null, notices: [] };
export const MAX_ITEMS = 500;
const BACKOFF_BASE = 5_000;
const BACKOFF_MAX = 15 * 60_000;

/** Dodaje albo aktualizuje element o tym samym identyfikatorze (nowsza treść zastępuje starszą, licznik prób od zera). */
export function enqueue<P>(s: OutboxState, item: { id: string; kind: ItemKind; payload: P }, now: number): OutboxState {
  const existing = s.items.find((i) => i.id === item.id);
  const next: OutboxItem = existing
    ? { ...existing, payload: item.payload, updatedAt: now, attempts: 0, nextAttemptAt: now, lastError: null }
    : { id: item.id, kind: item.kind, payload: item.payload, createdAt: now, updatedAt: now, attempts: 0, nextAttemptAt: now, lastError: null };
  const rest = s.items.filter((i) => i.id !== item.id);
  // przepełnienie: najstarsze wpisy wypadają dopiero przy 500 oczekujących (miesiące bez sieci); to i tak lepsze niż błąd zapisu
  const items = [...rest, next].slice(-MAX_ITEMS);
  return { ...s, items };
}

export const due = (s: OutboxState, now: number): OutboxItem[] => s.items.filter((i) => i.nextAttemptAt <= now).sort((a, b) => a.createdAt - b.createdAt);

/** Usuwa element po potwierdzeniu przez serwer – ale tylko tę wersję, którą wysłano (nowsza zmiana zostaje w kolejce). */
export function markSent(s: OutboxState, id: string, sentVersion: number, now: number): OutboxState {
  return { ...s, items: s.items.filter((i) => !(i.id === id && i.updatedAt <= sentVersion)), lastSyncAt: now, lastError: null };
}

export function backoff(attempts: number): number {
  return Math.min(BACKOFF_MAX, BACKOFF_BASE * 2 ** Math.max(0, attempts - 1));
}

/** Błąd: `retryable` = sieć/serwer chwilowo; inaczej (np. odrzucone przez serwer) element zostaje, ale bez częstych prób. */
export function markFailed(s: OutboxState, id: string, error: string, retryable: boolean, now: number): OutboxState {
  return {
    ...s,
    lastError: error,
    items: s.items.map((i) => {
      if (i.id !== id) return i;
      const attempts = i.attempts + 1;
      return { ...i, attempts, lastError: error, nextAttemptAt: now + (retryable ? backoff(attempts) : BACKOFF_MAX * 4) };
    }),
  };
}

/** Po odzyskaniu sieci: próbujemy od razu (nie czekamy na odliczanie). */
export const retryNow = (s: OutboxState, now: number): OutboxState => ({ ...s, items: s.items.map((i) => ({ ...i, nextAttemptAt: Math.min(i.nextAttemptAt, now) })) });

export function addNotice(s: OutboxState, n: Notice): OutboxState {
  if (s.notices.some((x) => x.id === n.id)) return s;
  return { ...s, notices: [...s.notices, n].slice(-5) };
}
export const dismissNotice = (s: OutboxState, id: string): OutboxState => ({ ...s, notices: s.notices.filter((n) => n.id !== id) });

export type SyncStatus =
  | { kind: "synced"; at: number | null }
  | { kind: "pending"; count: number; offline: boolean }
  | { kind: "error"; count: number; message: string };

export function statusOf(s: OutboxState, online: boolean): SyncStatus {
  const count = s.items.length;
  if (count === 0) return { kind: "synced", at: s.lastSyncAt };
  const failing = s.items.some((i) => i.attempts >= 3 && i.lastError);
  if (failing && online) return { kind: "error", count, message: s.lastError ?? "błąd" };
  return { kind: "pending", count, offline: !online };
}

export function parseOutbox(raw: string | null): OutboxState {
  if (!raw) return EMPTY;
  try {
    const o = JSON.parse(raw) as Partial<OutboxState>;
    if (o.v !== 1 || !Array.isArray(o.items)) return EMPTY;
    const items = o.items.filter((i): i is OutboxItem => !!i && typeof i.id === "string" && i.kind === "session_log" && typeof i.createdAt === "number")
      .map((i) => ({ ...i, attempts: Number(i.attempts) || 0, nextAttemptAt: Number(i.nextAttemptAt) || 0, updatedAt: Number(i.updatedAt) || i.createdAt, lastError: i.lastError ?? null }));
    return { v: 1, items, lastSyncAt: typeof o.lastSyncAt === "number" ? o.lastSyncAt : null, lastError: o.lastError ?? null, notices: Array.isArray(o.notices) ? o.notices.slice(-5) : [] };
  } catch { return EMPTY; }
}
