import type { Profile, SessionCompletion, SessionDay } from "../types";
import { runningCalibrationKey } from "./runningCalibrationKey";
import { planEvidenceIssue, type PlanGymEvidence } from "../planEvidence";

/** Explain blocked checks; the actual proposal card owns any available change and its actions. */
export function runningCalibrationMessage(input: {
  profile: Profile | null;
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  todayIso: string;
  gym: PlanGymEvidence;
  unresolvedWrites: boolean;
  online: boolean;
}): string | null {
  if (!input.profile) return null;
  const key = runningCalibrationKey(input.profile);
  const pending = input.plan
    .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
    .some((s) => {
      const log = s.dbId ? input.completions[s.dbId] : undefined;
      return (
        s.date >= input.todayIso &&
        s.engineV2?.roles.includes("endurance") &&
        s.runningRecipe?.method !== "field_mas_test" &&
        s.engineV2.runningCalibrationKey !== key &&
        !s.executionProtected &&
        !log?.completed &&
        !["started", "completed", "missed"].includes(log?.status ?? "")
      );
    });
  if (!pending) return null;
  const lead = "Nie można teraz sprawdzić wpływu nowych danych biegania na przyszłe sesje.";
  if (!input.online) return `${lead} Sprawdzenie czeka na połączenie z internetem.`;
  const issue = planEvidenceIssue(input.gym, input.unresolvedWrites);
  if (issue) return `${lead} ${issue}`;
  // A different measurement key alone need not change an effort-based recipe.
  // Ready, dismissed and no-change proposals are handled by FeedbackAdjustmentCard.
  return null;
}
