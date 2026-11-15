import type { Profile, SessionCompletion, SessionDay } from "../types";
import { runningCalibrationKey } from "./runningCalibrationKey";
import { planEvidenceIssue, type PlanGymEvidence } from "../planEvidence";

/** Status is derived from the saved prescription, not an optimistic success flag. */
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
  const lead =
    "Nowe tempo lub poziom biegania nie zostały jeszcze zastosowane do przyszłych sesji.";
  if (!input.online) return `${lead} Aktualizacja czeka na połączenie z internetem.`;
  const issue = planEvidenceIssue(input.gym, input.unresolvedWrites);
  if (issue) return `${lead} ${issue}`;
  return `${lead} Sprawdź propozycję zmian i wybierz „Zastosuj” albo „Zostaw plan”; nic nie zmienia się automatycznie.`;
}
