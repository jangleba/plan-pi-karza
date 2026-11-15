import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { sessionPrescription, trainingSetupRevision } from "../planIdentity";
import { hasOutdatedPendingEngineWork } from "./planStatus";
import { runningCalibrationKey } from "./runningCalibrationKey";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import type { EngineOptions } from "./model";
import type { AdjustmentChange, AdjustmentProposal } from "./feedbackAdjustment";

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

const fingerprintOf = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
};
const ownSlots = (d: SessionDay) => slots(d).filter((s) => s.engineV2);
const prescriptionOf = (s: SessionDay) =>
  JSON.stringify([
    s.engineV2?.roles,
    s.engineV2?.exercises.map((e) => [e.exerciseId, e.dose]),
    s.runningRecipe ?? s.engineV2?.runningRecipe ?? null,
    s.durationMin,
  ]);
const describe = (s: SessionDay | undefined) => {
  if (!s) return "brak sesji";
  const run = s.runningRecipe ?? s.engineV2?.runningRecipe;
  const pace = run
    ? run.paceSource === "field_mas"
      ? ", tempo z testu MAS"
      : ", tempo z odczucia"
    : "";
  return `${s.title} ${s.durationMin} min${pace}`;
};

/**
 * New paces or level after a confirmed MAS are a proposal, never an automatic write: the athlete
 * sees every changed future session (before → after) and applies it through the same
 * version-checked activation as any other plan change. Started and completed work is untouched.
 */
export function proposeRunningCalibration(
  input: Parameters<typeof calibratePendingRunningPlan>[0] & {
    planId: string | null;
    hasUnconfirmedWrites?: boolean;
  },
): AdjustmentProposal | null {
  if (input.hasUnconfirmedWrites) return null;
  const next = calibratePendingRunningPlan(input);
  if (!next) return null;
  const changes: AdjustmentChange[] = [];
  const dates = [...new Set([...input.plan, ...next].map((d) => d.date))]
    .filter((date) => date >= input.todayIso)
    .sort();
  for (const date of dates) {
    const before = input.plan.filter((d) => d.date === date).flatMap(ownSlots);
    const after = next.filter((d) => d.date === date).flatMap(ownSlots);
    const same =
      JSON.stringify(before.map(prescriptionOf)) === JSON.stringify(after.map(prescriptionOf));
    if (same) continue;
    const count = Math.max(before.length, after.length);
    for (let i = 0; i < count; i++) {
      const a = before[i],
        b = after[i];
      if (a && b && prescriptionOf(a) === prescriptionOf(b)) continue;
      changes.push({
        kind: "running_calibration",
        sessionId: a?.dbId ?? `${date}:${i}`,
        title: a?.title ?? b?.title ?? "Trening",
        before: { date, minutes: a?.durationMin ?? 0 },
        after: b ? { date, minutes: b.durationMin } : null,
        line: `${date}: ${describe(a)} → ${describe(b)}`,
      });
    }
  }
  if (!changes.length) return null;
  const id = `run-cal-1:${input.planId ?? "none"}:${runningCalibrationKey(input.profile)}`;
  const minutesPerSession =
    next[0]?.engineTimeBudgetMin ?? input.plan[0]?.engineTimeBudgetMin ?? 75;
  return {
    id,
    policyVersion: "run-calibration-1",
    sourceSessionId: input.profile.fieldMasSourceSessionId ?? "running-calibration",
    sourceDate: input.profile.fieldMasTestedAt ?? input.todayIso,
    sourceKind: "running",
    feedback: { rpe: null, tags: [], matchMinutesPlayed: null, feedbackVersion: null },
    planId: input.planId,
    reason:
      "Nowe tempo lub poziom biegania po potwierdzonym wyniku. Sprawdź zmiany przyszłych sesji przed zastosowaniem:",
    changes,
    affectedSessionIds: changes.map((c) => c.sessionId),
    candidatePlan: next,
    minutesPerSession,
    fingerprint: fingerprintOf(
      JSON.stringify([
        id,
        input.todayIso,
        changes,
        next.map((d) => [d.date, ownSlots(d).map(prescriptionOf)]),
      ]),
    ),
  };
}
