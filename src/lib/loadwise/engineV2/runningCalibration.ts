import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { sessionPrescription, trainingSetupRevision } from "../planIdentity";
import { hasOutdatedPendingEngineWork } from "./planStatus";
import { runningCalibrationKey } from "./runningCalibrationKey";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import type { EngineOptions } from "./model";

const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const handled = (s: SessionDay, c: Record<string, SessionCompletion>) => {
  const log = s.dbId ? c[s.dbId] : undefined;
  return (
    s.executionProtected ||
    log?.completed ||
    ["started", "completed", "missed"].includes(log?.status ?? "")
  );
};

/** What a non-running slot prescribes. Used only to detect a change outside the running domain. */
const domainSignature = (s: SessionDay) =>
  JSON.stringify([
    s.engineV2?.roles,
    s.engineV2?.exercises.map((e) => [e.exerciseId, e.role, e.dose]),
    s.engineV2?.organization,
    s.engineV2?.strengthPairs,
    s.engineV2?.sprintVariant,
  ]);
const isStrength = (s: SessionDay) =>
  !!s.engineV2?.roles.some((r) => r === "strengthA" || r === "strengthB");
const strengthSignatures = (days: SessionDay[], from: string) =>
  days
    .filter((d) => d.date >= from)
    .flatMap((d) => slots(d).filter(isStrength).map(domainSignature))
    .sort();
/**
 * A running update may move gym sessions between days, but it must not quietly rewrite or drop them:
 * the gym prescriptions already in force (including accepted reductions) stay exactly as they are.
 * A real gym change belongs in the visible plan preview, not in an automatic write. Other
 * non-running sessions (sprint, mobility) may still be re-solved by the scheduler as before.
 */
const changesGymPrescriptions = (old: SessionDay[], next: SessionDay[], from: string) =>
  JSON.stringify(strengthSignatures(old, from)) !== JSON.stringify(strengthSignatures(next, from));

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
  /**
   * The same athlete-scoped gym evidence every other rebuild uses. Without it a rebuild would
   * silently undo a reduction the athlete accepted (e.g. return a banded jump after a loss of control).
   */
  gymProgression?: EngineOptions["gymProgression"];
  strengthLoadResponses?: EngineOptions["strengthLoadResponses"];
}): SessionDay[] | null {
  const { profile, completions, todayIso, plan } = input;
  const key = runningCalibrationKey(profile),
    setup = trainingSetupRevision(profile);
  if (!plan.length || hasOutdatedPendingEngineWork(plan, completions, todayIso)) return null;
  if (
    plan.some(
      (d) =>
        d.date >= todayIso &&
        !d.executionProtected &&
        !slots(d).some((s) => handled(s, completions)) &&
        d.trainingSetupRevision !== setup,
    )
  )
    return null;
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
    gymProgression: input.gymProgression,
    strengthLoadResponses: input.strengthLoadResponses,
  };
  const generated = generateTrainingPlan(profile, options).plan.slice(0, plan.length);
  if (validateTrainingPlan(generated, profile, options).length) return null;
  if (changesGymPrescriptions(plan, generated, todayIso)) return null;
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
