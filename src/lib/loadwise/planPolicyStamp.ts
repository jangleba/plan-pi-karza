import type { SessionDay } from "./types";

/** An explicit final-policy acknowledgement of attainable soft goals. */
export const FINAL_PLAN_POLICY_VERSION = "constraints-first-v5-prepared-youth";

export function hasAcknowledgedReducedTargets(week: SessionDay[]): boolean {
  return (
    week.length > 0 &&
    week.every(
      (day) =>
        day.weekMeta?.finalPolicyVersion === FINAL_PLAN_POLICY_VERSION &&
        ["reduced", "health_limited"].includes(day.weekMeta.planningStatus ?? "") &&
        (day.weekMeta.planningNotes?.length ?? 0) > 0,
    )
  );
}
