export type EntitlementStatus = "trialing" | "active" | "grace" | "expired" | "no_subscription";
export interface Entitlement {
  userId: string;
  status: EntitlementStatus;
  expiresAt: string | null;
  verifiedAt: string;
}
export function hasAccess(value: Entitlement | null, userId: string, now = Date.now()): boolean {
  if (!value || value.userId !== userId || !["trialing", "active", "grace"].includes(value.status))
    return false;
  const verified = Date.parse(value.verifiedAt),
    until = value.expiresAt ? Date.parse(value.expiresAt) : NaN;
  // No lifetime access is sold; never extend a monthly product from a local clock.
  return (
    Number.isFinite(verified) &&
    verified <= now + 60_000 &&
    now - verified <= 24 * 60 * 60 * 1000 &&
    Number.isFinite(until) &&
    until > now
  );
}
export function parseEntitlement(value: unknown, owner: string): Entitlement {
  if (!value || typeof value !== "object") throw new Error("Nie udało się sprawdzić subskrypcji.");
  const row = value as Record<string, unknown>;
  if (
    row.userId !== owner ||
    !["trialing", "active", "grace", "expired", "no_subscription"].includes(String(row.status)) ||
    typeof row.verifiedAt !== "string" ||
    !Number.isFinite(Date.parse(row.verifiedAt)) ||
    (row.expiresAt !== null &&
      (typeof row.expiresAt !== "string" || !Number.isFinite(Date.parse(row.expiresAt))))
  )
    throw new Error("Nieprawidłowe potwierdzenie subskrypcji.");
  return row as unknown as Entitlement;
}
export function sevenDayTrial(
  intro: { price: number; period: string; cycles: number } | null | undefined,
): boolean {
  return (
    !!intro && intro.price === 0 && intro.cycles === 1 && ["P1W", "P7D"].includes(intro.period)
  );
}
