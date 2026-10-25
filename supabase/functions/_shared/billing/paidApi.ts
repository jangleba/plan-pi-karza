export type PaidApiDecision = "ok" | "subscription" | "unavailable";

// Server-side check for paid network services. History export, account deletion
// and pending training writes remain available after a subscription expires.
export function paidApiDecision(
  enforced: boolean,
  row: unknown,
  failed = false,
  now = Date.now(),
): PaidApiDecision {
  if (!enforced) return "ok";
  if (failed) return "unavailable";
  if (!row || typeof row !== "object") return "subscription";
  const value = row as Record<string, unknown>;
  const expires = typeof value.expires_at === "string" ? Date.parse(value.expires_at) : NaN;
  const verified = typeof value.verified_at === "string" ? Date.parse(value.verified_at) : NaN;
  return ["trialing", "active", "grace"].includes(String(value.status)) &&
    expires > now &&
    verified <= now + 60_000 &&
    now - verified <= 24 * 3600_000
    ? "ok"
    : "subscription";
}
