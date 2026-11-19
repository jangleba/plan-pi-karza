import { supabase } from "../lib/supabase";
import { getScope, scoped } from "../lib/store";
import { CONSENT_VERSION, CONTRACT_VERSION, SAFETY_VERSION } from "./config";

/**
 * Oświadczenia użytkownika – ROZDZIELONE:
 *  – akceptacja warunków umowy (`terms`),
 *  – potwierdzenie zapoznania się z zasadami bezpieczeństwa (`safety`),
 *  – zgoda na konkretne przetwarzanie: synchronizację danych o samopoczuciu, masie i wynikach z chmurą (`health_sync`, odwoływalna).
 * Brak ogólnej zgody „na RODO”; informacja o prywatności jest informacją, nie zgodą. Nie ma zgód marketingowych ani analitycznych,
 * bo takie przetwarzanie nie istnieje.
 * Lokalne lustro służy do sterowania synchronizacją; źródłem prawdy dla egzekwowania jest serwer (RLS).
 */
export type Purpose = "health_sync";
export interface ConsentState { granted: boolean; at: string | null; version: string | null; pendingWithdraw: boolean }
const OFF: ConsentState = { granted: false, at: null, version: null, pendingWithdraw: false };

export function loadConsent(p: Purpose): ConsentState {
  try { return { ...OFF, ...(JSON.parse(scoped.getItem(`consent:${p}`) ?? "null") as Partial<ConsentState> | null) }; } catch { return OFF; }
}
const saveConsent = (p: Purpose, s: ConsentState) => scoped.setItem(`consent:${p}`, JSON.stringify(s));

export type AgreementKind = "terms" | "safety";
export const AGREEMENT_VERSION: Record<AgreementKind, string> = { terms: CONTRACT_VERSION, safety: SAFETY_VERSION };

export function loadAgreement(kind: AgreementKind): { version: string; at: string } | null {
  try { return JSON.parse(scoped.getItem(`agreement:${kind}`) ?? "null") as { version: string; at: string } | null; } catch { return null; }
}
/** Czy użytkownik zaakceptował bieżącą wersję danego dokumentu. */
export const hasCurrentAgreement = (kind: AgreementKind): boolean => loadAgreement(kind)?.version === AGREEMENT_VERSION[kind];

export type OpResult = { ok: true } | { ok: false; error: string };

async function rpc(fn: string, args: Record<string, unknown>): Promise<OpResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z serwerem." };
  if (getScope().kind !== "user") return { ok: false, error: "Wymaga zalogowania." };
  try {
    const { error } = await supabase.rpc(fn, args);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Błąd połączenia." };
  }
}

/** Zapisuje dowód akceptacji (użytkownik, wersja, czas, zakres, metoda) i dopiero potem lokalne lustro. */
export async function acceptAgreement(kind: AgreementKind): Promise<OpResult> {
  const r = await rpc("record_agreement", { p_kind: kind, p_version: AGREEMENT_VERSION[kind] });
  if (r.ok) scoped.setItem(`agreement:${kind}`, JSON.stringify({ version: AGREEMENT_VERSION[kind], at: new Date().toISOString() }));
  return r;
}

/**
 * Włączenie/wycofanie zgody na synchronizację danych zdrowotnych. Wycofanie ma skutek natychmiast po stronie aplikacji (przestaje wysyłać
 * i pobierać), a po stronie serwera usuwa te dane; jeśli serwer nie odpowie, stan „wycofanie oczekuje” jest widoczny i wznawiany.
 */
export async function setHealthSync(granted: boolean): Promise<OpResult> {
  const prev = loadConsent("health_sync");
  if (granted) {
    const r = await rpc("record_consent", { p_purpose: "health_sync", p_action: "grant", p_version: CONSENT_VERSION });
    if (r.ok) saveConsent("health_sync", { granted: true, at: new Date().toISOString(), version: CONSENT_VERSION, pendingWithdraw: false });
    return r;
  }
  saveConsent("health_sync", { ...prev, granted: false, pendingWithdraw: true }); // lokalnie od razu
  const r = await rpc("record_consent", { p_purpose: "health_sync", p_action: "withdraw", p_version: CONSENT_VERSION });
  saveConsent("health_sync", { granted: false, at: new Date().toISOString(), version: CONSENT_VERSION, pendingWithdraw: !r.ok });
  return r;
}

/** Wznawia niedokończone wycofanie (np. po utracie sieci). */
export async function resumePendingWithdraw(): Promise<void> {
  if (loadConsent("health_sync").pendingWithdraw) await setHealthSync(false);
}
