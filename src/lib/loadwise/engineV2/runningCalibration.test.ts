import { sessionPrescription } from "../planIdentity";
import { expect, it, vi } from "vitest";
import { activateTrainingPlan } from "./activation";
import { proposalToEngineResult } from "./feedbackAdjustment";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { calibratePendingRunningPlan, proposeRunningCalibration } from "./runningCalibration";
import { runningCalibrationKey } from "./runningCalibrationKey";
import { cycleForWeek } from "./cycle";
import type { Profile, SessionDay, SessionCompletion } from "../types";
const base = {
  name: "Rotation athlete",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [2, 4, 6],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "machine",
    "band",
    "bench",
    "med_ball",
    "nordic_setup",
  ],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
  trainingMethodPreferences: { spaceLengthM: 60 },
} as unknown as Profile;

const options = { startDate: "2026-11-02", weeks: 2, minutesPerSession: 45 };
function beforeTest() {
  const profile = {
    ...base,
    goal: "endurance",
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  } as Profile;
  const plan = generateTrainingPlan(profile, options).plan;
  for (const d of plan)
    for (const [i, s] of [d, ...(d.secondSession ? [d.secondSession] : [])].entries()) {
      s.dbId = `${d.date}-${i}`;
      s.dayDbId = `day-${d.date}`;
      s.planDbId = "active-plan";
    }
  return { profile, plan };
}
const afterTest = (p: Profile) => ({
  ...p,
  fieldMasKmh: 15.6,
  fieldMasTestedAt: "2026-11-02",
  fieldMasSourceSessionId: "verified-test",
  runningProgressionLevel: 0,
});
const runs = (p: SessionDay[]) =>
  p
    .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
    .filter((s) => s.engineV2?.roles.includes("endurance"));
it("automatically selects measured-pace units after MAS, through the calendar and time gates", () => {
  const { profile, plan } = beforeTest();
  const next = afterTest(profile);
  expect(runs(plan).every((s) => s.runningRecipe?.paceSource === "effort")).toBe(true);
  const calibrated = calibratePendingRunningPlan({
    profile: next,
    plan,
    completions: {},
    todayIso: options.startDate,
  })!;
  expect(calibrated).toBeTruthy();
  const measured = runs(calibrated).filter((s) => s.runningRecipe?.paceSource === "field_mas");
  expect(measured.length).toBeGreaterThan(0);
  expect(measured.every((s) => s.runningRecipe!.blocks[0].intensity.pace)).toBe(true);
  expect(validateTrainingPlan(calibrated, next, options)).toEqual([]);
  expect(
    calibratePendingRunningPlan({
      profile: next,
      plan: calibrated,
      completions: {},
      todayIso: options.startDate,
    }),
  ).toBeNull();
  expect(
    runs(calibrated).every(
      (s) => s.engineV2?.runningCalibrationKey === runningCalibrationKey(next),
    ),
  ).toBe(true);
});
it("never changes started work or its other slot and never converts every calm run into HIIT", () => {
  const { profile, plan } = beforeTest();
  const target = runs(plan)[0];
  const completions: Record<string, SessionCompletion> = {
    [target.dbId!]: {
      completed: false,
      status: "started",
      rpe: null,
      notes: "",
      executionSnapshot: structuredClone(target),
    },
  };
  const out = calibratePendingRunningPlan({
    profile: afterTest(profile),
    plan,
    completions,
    todayIso: options.startDate,
  })!;
  expect(out).toBeTruthy();
  expect(runs(out).find((s) => s.dbId === target.dbId)!.runningRecipe).toEqual(
    target.runningRecipe,
  );
  expect(runs(out).some((s) => s.runningRecipe?.method === "easy_continuous")).toBe(true);
});
it("does not bypass equipment/profile changes or manual session modifications", () => {
  const { profile, plan } = beforeTest();
  expect(
    calibratePendingRunningPlan({
      profile: { ...afterTest(profile), unavailableEquipmentIds: ["barbell"] },
      plan,
      completions: {},
      todayIso: options.startDate,
    }),
  ).toBeNull();
  const dates = new Set(runs(plan).map((s) => s.date));
  expect(
    calibratePendingRunningPlan({
      profile: afterTest(profile),
      plan,
      completions: {},
      todayIso: options.startDate,
      modifiedDates: dates,
    }),
  ).toBeNull();
});
it("returns to effort-based runs if calibration is removed and never prescribes intervals to a beginner", () => {
  const { profile, plan } = beforeTest();
  const ready = afterTest(profile);
  const calibrated = calibratePendingRunningPlan({
    profile: ready,
    plan,
    completions: {},
    todayIso: options.startDate,
  })!;
  const reverted = calibratePendingRunningPlan({
    profile,
    plan: calibrated,
    completions: {},
    todayIso: options.startDate,
  })!;
  expect(runs(reverted).every((s) => s.runningRecipe?.paceSource === "effort")).toBe(true);
  const young = {
    ...profile,
    age: 16,
    level: "beginner" as const,
    gymExperienceLevel: "beginner" as const,
    strengthTrainingMonths: 0,
    movementCompetence: "low" as const,
  };
  const youngPlan = generateTrainingPlan(young, options).plan;
  for (const [i, d] of youngPlan.entries()) d.dbId = `young-${i}`;
  const revised = calibratePendingRunningPlan({
    profile: afterTest(young),
    plan: youngPlan,
    completions: {},
    todayIso: options.startDate,
  })!;
  expect(runs(revised).every((s) => s.runningRecipe?.paceSource === "effort")).toBe(true);
});

it("uses recent execution feedback at recalibration time without resetting the plan anchor", () => {
  const { profile, plan } = beforeTest();
  const strength = plan
    .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
    .find((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")))!;
  const completions = Object.fromEntries(
    ["2026-11-09", "2026-11-11"].map((date) => [
      date,
      {
        completed: true,
        status: "completed",
        rpe: 9,
        notes: "",
        executionSnapshot: {
          ...structuredClone(strength),
          dbId: date,
          date,
          engineV2: { ...strength.engineV2!, phase: "development" },
        },
      },
    ]),
  ) as Record<string, SessionCompletion>;
  const current = cycleForWeek(
    profile,
    { ...options, asOfDate: "2026-11-12", previousPlan: plan, completions },
    "2026-11-09",
  );
  expect(current.phase).toBe("deload");
  expect(current.cycle.anchorDate).toBe("2026-11-02");
  expect(
    cycleForWeek(
      profile,
      { ...options, asOfDate: "2026-11-12", previousPlan: plan, completions },
      "2026-11-16",
    ).phase,
  ).toBe("development");
});

it.each(["protected", "started", "completed"] as const)(
  "calibrates new pending work while preserving a %s execution from v2.8",
  (status) => {
    const { profile, plan } = beforeTest();
    const first = plan.find((d) => d.engineV2)!;
    first.generatorVersion = "ballwise-v2.8";
    first.executionProtected = status === "protected";
    const completions: Record<string, SessionCompletion> =
      status === "protected"
        ? {}
        : {
            [first.dbId!]: {
              completed: status === "completed",
              status,
              rpe: null,
              notes: "",
              executionSnapshot: structuredClone(first),
            },
          };
    const before = sessionPrescription(first);
    const calibrated = calibratePendingRunningPlan({
      profile: afterTest(profile),
      plan,
      completions,
      todayIso: options.startDate,
    });
    expect(calibrated).not.toBeNull();
    const preserved = calibrated!.find((d) => d.date === first.date)!;
    expect(sessionPrescription(preserved)).toBe(before);
    expect(preserved.generatorVersion).toBe("ballwise-v2.8");
    expect(preserved.dbId).toBe(first.dbId);
  },
);

it("after MAS the new paces are a reviewable proposal listing every changed session", () => {
  const { profile, plan } = beforeTest();
  const ready = afterTest(profile);
  const started = plan.find((d) => d.date === "2026-11-03")!;
  const completions = {
    [started.dbId!]: { completed: false, status: "started", rpe: null, notes: "" },
  } as Record<string, SessionCompletion>;
  const proposal = proposeRunningCalibration({
    profile: ready,
    plan,
    completions,
    todayIso: options.startDate,
    planId: "active-plan",
  })!;
  expect(proposal).not.toBeNull();
  expect(proposal.sourceKind).toBe("running");
  expect(proposal.changes.length).toBeGreaterThan(0);
  // The card lists every future session that differs; nothing else changes.
  const changedDates = new Set(proposal.changes.map((c) => c.before.date));
  const own = (days: SessionDay[], date: string) =>
    JSON.stringify(
      days
        .filter((d) => d.date === date)
        .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
        .filter((s) => s.engineV2)
        .map((s) => [
          s.engineV2!.exercises.map((e) => [e.exerciseId, e.dose]),
          s.runningRecipe,
          s.durationMin,
        ]),
    );
  for (const d of proposal.candidatePlan.filter((x) => x.date >= options.startDate))
    if (!changedDates.has(d.date))
      expect(own(proposal.candidatePlan, d.date)).toBe(own(plan, d.date));
  // A started session is pinned.
  expect(
    JSON.stringify(proposal.candidatePlan.find((d) => d.date === "2026-11-03")!.engineV2),
  ).toBe(JSON.stringify(started.engineV2));
  expect(validateTrainingPlan(proposal.candidatePlan, ready, options)).toEqual([]);
  // A pending write elsewhere cannot authorise the change.
  expect(
    proposeRunningCalibration({
      profile: ready,
      plan,
      completions,
      todayIso: options.startDate,
      planId: "active-plan",
      hasUnconfirmedWrites: true,
    }),
  ).toBeNull();
  // Without a new calibration there is nothing to propose.
  expect(
    proposeRunningCalibration({
      profile,
      plan,
      completions: {},
      todayIso: options.startDate,
      planId: "active-plan",
    }),
  ).toBeNull();
});

it("'Zastosuj' writes the MAS proposal once, through the version-checked activation", async () => {
  const { profile, plan } = beforeTest();
  const ready = afterTest(profile);
  const proposal = proposeRunningCalibration({
    profile: ready,
    plan,
    completions: {},
    todayIso: options.startDate,
    planId: "active-plan",
  })!;
  const persist = vi.fn(async (_o: string, _p: Profile, next: SessionDay[]) => next);
  const snapshot = {
    ownerId: "owner",
    profile: ready,
    observedPlanId: "active-plan",
    plan,
    completions: {},
    readiness: {},
  };
  const saved = await activateTrainingPlan(proposalToEngineResult(proposal, ready), {
    current: () => snapshot,
    load: async () => ({ id: "active-plan", plan }),
    persist,
  });
  expect(persist).toHaveBeenCalledOnce();
  expect(saved.length).toBe(proposal.candidatePlan.length);
  // A plan replaced on another device is never overwritten by an old proposal.
  await expect(
    activateTrainingPlan(proposalToEngineResult(proposal, ready), {
      current: () => snapshot,
      load: async () => ({ id: "other-plan", plan }),
      persist,
    }),
  ).rejects.toThrow(/innym urządzeniu/);
  expect(persist).toHaveBeenCalledOnce();
});
