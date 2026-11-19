import { supabase } from "../lib/supabase";

/** Funkcje publiczne dla opiekuna (bez logowania; wymagają ważnego, jednorazowego tokenu z linku). */
export async function guardianInfo(token: string): Promise<{ valid: boolean; contractVersion?: string; expiresAt?: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("guardian_info", { p_token: token });
  return error ? null : (data as { valid: boolean; contractVersion?: string; expiresAt?: string });
}
export async function guardianConfirm(token: string, version: string): Promise<{ ok: true; revokeToken: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Brak połączenia z serwerem." };
  const { data, error } = await supabase.rpc("guardian_confirm", { p_token: token, p_contract_version: version, p_attested: true });
  return error ? { ok: false, error: error.message } : { ok: true, revokeToken: (data as { revokeToken: string }).revokeToken };
}
export async function guardianRevoke(revokeToken: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("guardian_revoke", { p_revoke_token: revokeToken });
  return !error && data === true;
}
