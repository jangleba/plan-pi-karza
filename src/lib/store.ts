/**
 * Przestrzenie danych lokalnych: osobna dla trybu gościa i dla każdego konta (identyfikator użytkownika).
 * Cały kod aplikacji korzysta z `scoped` zamiast z `localStorage` (pilnuje tego test `no-raw-storage.test.ts`).
 *
 *  – klucz fizyczny: `bw:guest:<klucz>` albo `bw:u:<userId>:<klucz>`; stan poprzedniego konta nie jest dostępny po zmianie sesji,
 *  – dane z wcześniejszych wersji (klucze bez przestrzeni) trafiają WYŁĄCZNIE do przestrzeni gościa – nigdy do bieżącego konta,
 *  – przeniesienie danych gościa do konta jest jawną czynnością (`copyScope`), nigdy automatyczną,
 *  – klucze sesji Supabase (`sb-…`) pozostają poza tym mechanizmem.
 */
export type Scope = { kind: "guest" } | { kind: "user"; id: string };

const PREFIX = "bw:";
const META_MIGRATED = `${PREFIX}meta:migrated-v1`;
let current: Scope = { kind: "guest" };

export const scopeId = (s: Scope): string => (s.kind === "guest" ? "guest" : `u:${s.id}`);
export const sameScope = (a: Scope, b: Scope): boolean => scopeId(a) === scopeId(b);
export const getScope = (): Scope => current;
export function setScope(s: Scope): void { current = s; }

function raw(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
const phys = (key: string, s: Scope = current) => `${PREFIX}${scopeId(s)}:${key}`;

/** Interfejs zgodny z localStorage, ale ograniczony do bieżącej przestrzeni. */
export const scoped = {
  getItem(key: string): string | null { try { return raw()?.getItem(phys(key)) ?? null; } catch { return null; } },
  setItem(key: string, value: string): void { try { raw()?.setItem(phys(key), value); } catch { /* brak pamięci */ } },
  removeItem(key: string): void { try { raw()?.removeItem(phys(key)); } catch { /* brak pamięci */ } },
};

/** Czy przeglądarka w ogóle zapisuje dane (Safari w trybie prywatnym lub z blokadą ciasteczek potrafi tego odmówić). */
export function storageAvailable(): boolean {
  try {
    const st = raw();
    if (!st) return false;
    const k = `${PREFIX}meta:probe`;
    st.setItem(k, "1");
    const ok = st.getItem(k) === "1";
    st.removeItem(k);
    return ok;
  } catch { return false; }
}

/** Klucze logiczne (bez przedrostka) zapisane w danej przestrzeni. */
export function listKeys(s: Scope): string[] {
  const st = raw();
  if (!st) return [];
  const p = `${PREFIX}${scopeId(s)}:`;
  const out: string[] = [];
  for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(p)) out.push(k.slice(p.length)); }
  return out.sort();
}

/** Odczyt jednej wartości z DOWOLNEJ przestrzeni (np. profil gościa do podpowiedzi „przenieść dane?”); tylko do odczytu. */
export function peekScoped(s: Scope, key: string): string | null {
  try { return raw()?.getItem(phys(key, s)) ?? null; } catch { return null; }
}

export const hasData = (s: Scope): boolean => listKeys(s).length > 0;

export function exportScope(s: Scope): Record<string, unknown> {
  const st = raw();
  const out: Record<string, unknown> = {};
  for (const k of listKeys(s)) {
    const v = st?.getItem(phys(k, s)) ?? null;
    if (v === null) continue;
    try { out[k] = JSON.parse(v); } catch { out[k] = v; }
  }
  return out;
}

export function clearScope(s: Scope): number {
  const st = raw();
  const keys = listKeys(s);
  for (const k of keys) { try { st?.removeItem(phys(k, s)); } catch { /* brak pamięci */ } }
  return keys.length;
}

/** Usuwa wszystkie przestrzenie aplikacji na tym urządzeniu (nie rusza kluczy sesji Supabase). */
export function clearAllLocal(): number {
  const st = raw();
  if (!st) return 0;
  const doomed: string[] = [];
  for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(PREFIX)) doomed.push(k); }
  for (const k of doomed) { try { st.removeItem(k); } catch { /* brak pamięci */ } }
  return doomed.length;
}

/** Klucze, których NIE przenosimy między przestrzeniami (np. zapisane uzgodnienia są per konto). */
const NOT_COPYABLE = /^(consent|agreement|guardian)/;

/**
 * Jawny import danych jednej przestrzeni do drugiej (np. gość → konto). Domyślnie nie nadpisuje istniejących kluczy.
 * Nigdy nie jest wywoływany automatycznie.
 */
export function copyScope(from: Scope, to: Scope, opts: { overwrite?: boolean; keys?: string[] } = {}): { copied: string[]; skipped: string[] } {
  const st = raw();
  const copied: string[] = [], skipped: string[] = [];
  if (!st || sameScope(from, to)) return { copied, skipped };
  for (const k of opts.keys ?? listKeys(from)) {
    if (NOT_COPYABLE.test(k)) { skipped.push(k); continue; }
    const v = st.getItem(phys(k, from));
    if (v === null) continue;
    if (!opts.overwrite && st.getItem(phys(k, to)) !== null) { skipped.push(k); continue; }
    try { st.setItem(phys(k, to), v); copied.push(k); } catch { skipped.push(k); }
  }
  return { copied, skipped };
}

/** Klucze używane przez wcześniejsze wersje aplikacji (bez przestrzeni). */
const LEGACY_EXACT = new Set([
  "profile", "history", "weightLog", "masDistance", "feelings", "runs", "meals", "fuelGoal", "fuelRecents", "shopChecked", "fuelFavs",
  "iqAttempts", "stimOpts",
]);
const LEGACY_PREFIX = ["checkIn:", "water:", "fuelStart:", "bag:", "warmup:", "bench:"];
const isLegacyKey = (k: string) => LEGACY_EXACT.has(k) || LEGACY_PREFIX.some((p) => k.startsWith(p));

/**
 * Jednorazowa migracja starych, wspólnych kluczy: trafiają do przestrzeni GOŚCIA (nie do bieżącego konta, bo nie wiadomo,
 * czyje są). Istniejące wartości gościa nie są nadpisywane; stare klucze są usuwane po przeniesieniu.
 */
export function migrateLegacy(): { moved: string[]; dropped: string[]; alreadyDone: boolean } {
  const st = raw();
  if (!st) return { moved: [], dropped: [], alreadyDone: true };
  if (st.getItem(META_MIGRATED)) return { moved: [], dropped: [], alreadyDone: true };
  const legacy: string[] = [];
  for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && isLegacyKey(k)) legacy.push(k); }
  const moved: string[] = [], dropped: string[] = [];
  const guest: Scope = { kind: "guest" };
  for (const k of legacy) {
    const v = st.getItem(k);
    try {
      if (v !== null && st.getItem(phys(k, guest)) === null) { st.setItem(phys(k, guest), v); moved.push(k); } else dropped.push(k);
      st.removeItem(k);
    } catch { /* brak pamięci – zostawiamy klucz */ }
  }
  try { st.setItem(META_MIGRATED, new Date().toISOString()); } catch { /* brak pamięci */ }
  return { moved, dropped, alreadyDone: false };
}

/**
 * Moduły usunięte z aplikacji: ich dane lokalne (m.in. zapisane oferty, wizytówka z imieniem i telefonem) są trwale kasowane
 * z wszystkich przestrzeni (gość i konta) oraz ze starych, nieprzestrzennych kluczy. Wykonywane raz (znacznik w pamięci).
 */
const REMOVED_KEY = /^(?:bw:(?:guest|u:[^:]+):)?radar[A-Za-z]*$/;
const META_PURGED = `${PREFIX}meta:purged-radar-v1`;
export function purgeRemovedFeatures(): { removed: string[]; alreadyDone: boolean } {
  const st = raw();
  if (!st) return { removed: [], alreadyDone: true };
  if (st.getItem(META_PURGED)) return { removed: [], alreadyDone: true };
  const keys: string[] = [];
  for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && REMOVED_KEY.test(k)) keys.push(k); }
  const removed: string[] = [];
  for (const k of keys) { try { st.removeItem(k); removed.push(k); } catch { /* brak pamięci – zostaje do następnego uruchomienia */ } }
  if (removed.length === keys.length) { try { st.setItem(META_PURGED, new Date().toISOString()); } catch { /* brak pamięci */ } }
  return { removed, alreadyDone: false };
}
