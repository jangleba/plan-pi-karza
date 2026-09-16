import { supabase } from "@/integrations/supabase/client";

export type CanonicalConsentType =
  | "terms"
  | "privacy"
  | "health_data"
  | "marketing"
  | "fuel_precision"
  | "guardian_authorization";

export interface ConsentDecision {
  type: CanonicalConsentType;
  accepted: boolean;
}

export async function recordConsentDecision(decision: ConsentDecision): Promise<void> {
  const { error } = await supabase.rpc("record_consent", {
    p_consent_type: decision.type,
    p_accepted: decision.accepted,
  });
  if (error) throw new Error(`Nie udało się zapisać decyzji „${decision.type}”: ${error.message}`);
}

export async function recordConsentDecisions(decisions: ConsentDecision[]): Promise<void> {
  // Sequential order is intentional: guardian authorisation can establish the
  // trusted actor type for the following legal decisions during onboarding.
  for (const decision of decisions) await recordConsentDecision(decision);
}
