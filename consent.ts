import { supabase } from "@/integrations/supabase/client";
import { clearConsentStatusCache } from "./legalStatus";

export type CanonicalConsentType =
  "terms" | "privacy" | "health_data" | "marketing" | "fuel_precision" | "guardian_authorization";

export interface ConsentDecision {
  type: CanonicalConsentType;
  accepted: boolean;
}

export async function recordConsentDecision(
  decision: ConsentDecision,
  expectedProfileUpdatedAt?: string | null,
): Promise<string | undefined> {
  const { data, error } =
    expectedProfileUpdatedAt !== undefined
      ? await supabase.rpc("record_consent_state", {
          p_consent_type: decision.type,
          p_accepted: decision.accepted,
          p_expected_profile_updated_at: expectedProfileUpdatedAt ?? undefined,
        })
      : await supabase.rpc("record_consent", {
          p_consent_type: decision.type,
          p_accepted: decision.accepted,
        });
  if (error) throw new Error(`Nie udało się zapisać decyzji „${decision.type}”: ${error.message}`);
  clearConsentStatusCache();
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("ballwise:consent-changed", { detail: decision }));
  return data && typeof data === "object" && "updated_at" in data
    ? String(data.updated_at)
    : undefined;
}

export async function recordConsentDecisions(
  decisions: ConsentDecision[],
  expectedProfileUpdatedAt?: string | null,
): Promise<string | null | undefined> {
  // Sequential order is intentional: guardian authorisation can establish the
  // trusted actor type for the following legal decisions during onboarding.
  let revision = expectedProfileUpdatedAt;
  for (const decision of decisions)
    revision = (await recordConsentDecision(decision, revision)) ?? revision;
  return revision;
}
