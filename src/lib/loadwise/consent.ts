import { cancellableRequest } from "./profileSave";
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
  options: { notify?: boolean; signal?: AbortSignal } = {},
): Promise<string | undefined> {
  const request =
    expectedProfileUpdatedAt !== undefined
      ? supabase.rpc("record_consent_state", {
          p_consent_type: decision.type,
          p_accepted: decision.accepted,
          p_expected_profile_updated_at: expectedProfileUpdatedAt ?? undefined,
        })
      : supabase.rpc("record_consent", {
          p_consent_type: decision.type,
          p_accepted: decision.accepted,
        });
  const { data, error } = await (options.signal
    ? cancellableRequest<Awaited<typeof request>>(request, options.signal)
    : request);
  if (error) throw new Error(`Nie udało się zapisać decyzji „${decision.type}”: ${error.message}`);
  clearConsentStatusCache();
  if (options.notify !== false && typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("ballwise:consent-changed", { detail: decision }));
  return data && typeof data === "object" && "updated_at" in data
    ? String(data.updated_at)
    : undefined;
}

export async function recordConsentDecisions(
  decisions: ConsentDecision[],
  expectedProfileUpdatedAt?: string | null,
  options: {
    notify?: boolean;
    signal?: AbortSignal;
    fromIndex?: number;
    onAcknowledged?: (count: number, revision: string | null | undefined) => void;
  } = {},
): Promise<string | null | undefined> {
  // Sequential order is intentional: guardian authorisation can establish the
  // trusted actor type for the following legal decisions during onboarding.
  let revision = expectedProfileUpdatedAt;
  let acknowledged = 0;
  try {
    for (let index = options.fromIndex ?? 0; index < decisions.length; index++) {
      revision =
        (await recordConsentDecision(decisions[index], revision, { ...options, notify: false })) ??
        revision;
      acknowledged++;
      options.onAcknowledged?.(index + 1, revision);
    }
  } finally {
    if (acknowledged && options.notify !== false && typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("ballwise:consent-changed"));
  }
  return revision;
}
