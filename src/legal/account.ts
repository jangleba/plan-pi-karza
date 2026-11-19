import { supabase } from "../lib/supabase";
import { clearAllLocal, clearScope, copyScope, exportScope, getScope, hasData, listKeys, type Scope } from "../lib/store";
import { CONTRACT_VERSION } from "./config";
import { loadConsent } from "./consent";

/** Eksport: dane lokalne bieżącej przestrzeni + (po zalogowaniu) wszystkie dane serwerowe użytkownika. */
export async function buildExport(): Promise<{ file: string; json: string; serverIncluded: boolean; serverError?: string }> {
  const scope = getScope();
  const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), scope: scope.kind, local: exportScope(scope), consent: { healthSync: loadConsent("health_sync") } };
  let serverIncluded = false, serverError: string | undefined;
  if (scope.kind === "user" && supabase) {
    try {
      const { data: remote, error } = await supabase.rpc("export_my_data");
      if (error) serverError = error.message; else { data.server = remote; serverIncluded = true; }
    } catch (e) { serverError = e instanceof Error ? e.message : "błąd połączenia"; }
  }
  return { file: `ballwise-dane-${new Date().toISOString().slice(0, 10)}.json`, json: JSON.stringify(data, null, 2), serverIncluded, serverError };
}

export interface DeleteReport { complete: boolean; steps: Array<{ name: string; ok: boolean; error?: string }>; error?: string }

/** Usunięcie konta: wywołanie funkcji serwerowej (klucz administracyjny jest tylko po stronie serwera). Dane lokalne konta czyścimy dopiero po sukcesie. */
export async function deleteAccountRemote(): Promise<DeleteReport> {
  const scope = getScope();
  if (!supabase || scope.kind !== "user") return { complete: false, steps: [], error: "Brak aktywnego konta." };
  try {
    const { data, error } = await supabase.functions.invoke("delete-account", { method: "POST", body: {} });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") { try { return (await ctx.json()) as DeleteReport; } catch { /* poniżej */ } }
      return { complete: false, steps: [], error: error.message };
    }
    const report = data as DeleteReport;
    if (report.complete) { clearScope(scope); try { await supabase.auth.signOut(); } catch { /* sesja i tak wygasła */ } }
    return report;
  } catch (e) {
    return { complete: false, steps: [], error: e instanceof Error ? e.message : "błąd połączenia" };
  }
}

export const guestHasData = (): boolean => hasData({ kind: "guest" });
export const guestKeys = (): string[] => listKeys({ kind: "guest" });

/** Jawny import danych gościa do bieżącego konta (nie nadpisuje istniejących kluczy). */
export function importGuestData(): { copied: string[]; skipped: string[] } {
  const to = getScope();
  return to.kind === "user" ? copyScope({ kind: "guest" }, to) : { copied: [], skipped: [] };
}
export const deleteGuestData = (): number => clearScope({ kind: "guest" });
export const deleteLocalData = (scope: Scope = getScope()): number => clearScope(scope);
export const deleteAllLocalData = (): number => clearAllLocal();

/* ---------- potwierdzenie opiekuna (użytkownik 16–17 lat) ---------- */
export type GuardianState = { state: "none" | "pending" | "confirmed" | "revoked" | "expired"; expiresAt?: string; confirmedAt?: string };

export async function guardianState(): Promise<GuardianState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("guardian_state", { p_contract_version: CONTRACT_VERSION });
  return error ? null : (data as GuardianState);
}

/** Zwraca jednorazowy token (pokazywany tylko teraz) i czas wygaśnięcia. Token przekazujesz opiekunowi samodzielnie. */
export async function requestGuardian(): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Brak połączenia z serwerem." };
  const { data, error } = await supabase.rpc("request_guardian_confirmation", { p_contract_version: CONTRACT_VERSION, p_ttl_hours: 72 });
  if (error) return { ok: false, error: error.message };
  const r = data as { token: string; expiresAt: string };
  return { ok: true, token: r.token, expiresAt: r.expiresAt };
}

export const guardianLink = (token: string): string => `${location.origin}/guardian?token=${encodeURIComponent(token)}`;
