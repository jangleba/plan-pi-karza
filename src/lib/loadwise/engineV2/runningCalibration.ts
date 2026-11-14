import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { sessionPrescription, trainingSetupRevision } from "../planIdentity";
import { ENGINE_VERSION } from "./model";
import { runningCalibrationKey } from "./runningCalibrationKey";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";

const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const handled = (s: SessionDay, c: Record<string, SessionCompletion>) => {
  const log = s.dbId ? c[s.dbId] : undefined;
  return (
    s.executionProtected ||
    log?.completed ||
    ["started", "completed", "missed"].includes(log?.status ?? "")
  );
};

/**
 * A confirmed test/level re-solves pending weeks through the normal goal-aware scheduler.
 * Merely changing pace on a previously easy day could insert hard work between heavy leg days.
 * Past days, manual dates and days under execution retain their exact prescriptions.
 */
export function calibratePendingRunningPlan(input: {
  profile: Profile;
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  todayIso: string;
  readiness?: Record<string, Readiness>;
  modifiedDates?: ReadonlySet<string>;
}): SessionDay[] | null {
  const { profile, completions, todayIso, plan } = input;
  const key = runningCalibrationKey(profile),
    setup = trainingSetupRevision(profile);
  if (!plan.length || plan.some((d) => d.generatorVersion !== ENGINE_VERSION)) return null;
  if (plan.some((d) => d.date >= todayIso && d.trainingSetupRevision !== setup)) return null;
  if (
    !plan
      .flatMap(slots)
      .some(
        (s) =>
          s.date >= todayIso &&
          s.engineV2?.roles.includes("endurance") &&
          s.runningRecipe?.method !== "field_mas_test" &&
          s.engineV2.runningCalibrationKey !== key &&
          !handled(s, completions) &&
          !input.modifiedDates?.has(s.date),
      )
  )
    return null;
  const lockedDays = plan
    .filter(
      (d) =>
        d.date < todayIso ||
        input.modifiedDates?.has(d.date) ||
        slots(d).some((s) => handled(s, completions)),
    )
    .map((d) => ({ ...d, executionProtected: true }));
  const options = {
    startDate: plan[0].date,
    asOfDate: todayIso,
    weeks: Math.ceil(plan.length / 7),
    minutesPerSession: plan[0].engineTimeBudgetMin ?? 75,
    previousPlan: plan,
    completions,
    lockedDays,
    readiness: input.readiness,
  };
  const generated = generateTrainingPlan(profile, options).plan.slice(0, plan.length);
  if (validateTrainingPlan(generated, profile, options).length) return null;
  for (const d of generated) {
    const old = plan.find((day) => day.date === d.date);
    if (!old) continue;
    d.dayDbId = old.dayDbId;
    d.planDbId = old.planDbId;
    d.cycleId = old.cycleId;
    for (const s of slots(d)) {
      s.dayDbId = old.dayDbId;
      s.planDbId = old.planDbId;
      s.cycleId = old.cycleId;
      if (!d.executionProtected)
        s.dbId = slots(old).find((o) => sessionPrescription(o) === sessionPrescription(s))?.dbId;
    }
  }
  return generated;
}
