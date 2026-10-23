import { validatePersistedPlan } from "./persistedPlanValidation";
import { PLAN_ENGINE_VERSION } from "./planVersion";
import type { Profile, SessionDay } from "./types";

/** One admission check for manual changes and confirmed-week regeneration. */
export function assertSafePlanChange(
  before: SessionDay[],
  after: SessionDay[],
  profile: Profile,
): void {
  // Missing minima can be an explicit, legitimate consequence of unavailability.
  // A user action must still never introduce a new scheduling/contract violation.
  const issues = (plan: SessionDay[]) =>
    validatePersistedPlan(plan, profile, PLAN_ENGINE_VERSION).issues.filter(
      (issue) =>
        !["missing-weekly-minimum", "stale-generator", "missing-plan"].includes(issue.code),
    );
  const existing = new Set(issues(before).map((issue) => `${issue.code}:${issue.date ?? ""}`));
  const introduced = issues(after).find(
    (issue) => !existing.has(`${issue.code}:${issue.date ?? ""}`),
  );
  if (introduced) throw new Error(introduced.message);
}
