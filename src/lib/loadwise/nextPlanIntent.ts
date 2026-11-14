/**
 * The athlete's confirmed choices for the next plan preview. Kept on this device only; it tells
 * the Plan screen to prepare a preview (from today, continuing the saved cycle) with the chosen
 * time budget. Nothing is saved to the plan until the explicit save there.
 */
export interface NextPlanIntent {
  /** Plan observed when the choices were confirmed; a different saved plan voids them. */
  planId: string | null;
  minutes: number | null;
  createdAt: string;
}

export function parseNextPlanIntent(value: unknown): NextPlanIntent | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as Record<string, unknown>;
  if (v.planId !== null && typeof v.planId !== "string") return;
  if (
    v.minutes !== null &&
    !(
      typeof v.minutes === "number" &&
      Number.isInteger(v.minutes) &&
      v.minutes >= 10 &&
      v.minutes <= 120
    )
  )
    return;
  if (typeof v.createdAt !== "string") return;
  return {
    planId: v.planId as string | null,
    minutes: v.minutes as number | null,
    createdAt: v.createdAt,
  };
}
