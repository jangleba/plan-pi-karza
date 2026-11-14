import { describe, expect, it } from "vitest";
import type { Profile, SessionCompletion, TrainingExercise } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { buildStrength, fitStrengthToBudget, buildRunning, eligibleExercise } from "./exercises";
import { cycleForWeek } from "./cycle";
import { validateEngineSession } from "./validation";
import { comparablePreviousSets, recommendStrengthProgression } from "./progression";
import { exercisePrescriptionKey, type ExerciseSessionLog } from "../setLogHistory";

const p: Profile = {
  name: "V25",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["barbell", "rack", "dumbbell", "machine", "nordic_setup"],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
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
};
const options = { startDate: "2026-11-02", weeks: 1, minutesPerSession: 75 };
const slots = (plan: ReturnType<typeof generateTrainingPlan>["plan"]) =>
  plan.flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])]).filter((s) => s.engineV2);
const e: TrainingExercise = { id: "x", name: "Test", sets: "2", reps: "6", rir: "3" };
const log = (id: string, date: string, patch = {}): ExerciseSessionLog => ({
  sessionKey: id,
  performedAt: date,
  verification: { expectedSets: 2, prescriptionKey: exercisePrescriptionKey(e), phase: "normal" },
  sets: [1, 2].map((setNumber) => ({ setNumber, weightKg: 5, reps: 6, rir: 0, ...patch })),
});

describe("V2.5 coherent sessions, cycle and feedback", () => {
  it("spreads A, B and sprint over separate dates with optional doubles enabled", () => {
    const r = generateTrainingPlan(p, options);
    const main = slots(r.plan).filter((s) =>
      s.engineV2!.roles.some((role) => role.startsWith("strength") || role === "speed"),
    );
    expect(main).toHaveLength(3);
    expect(new Set(main.map((s) => s.date)).size).toBe(3);
    expect(main.every((s) => s.engineV2!.roles.length === 1)).toBe(true);
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });
  it("independently rejects tampered hamstring-only strength and merged roles", () => {
    const r = generateTrainingPlan(p, options);
    const s = structuredClone(slots(r.plan).find((s) => s.engineV2!.roles.includes("strengthB"))!);
    s.engineV2!.exercises = s.engineV2!.exercises.filter((e) => e.role !== "unilateral_strength");
    expect(validateEngineSession(s, p).map((x) => x.code)).toContain("UNBALANCED_STRENGTH");
    s.engineV2!.roles.push("speed");
    expect(validateEngineSession(s, p).map((x) => x.code)).toContain("MIXED_STRENGTH_SPEED");
  });
  it("fits a compact prescription while preserving both leg functions, upper task and rests", () => {
    for (const variant of ["A", "B"] as const) {
      const full = buildStrength(p, variant, "development");
      const short = fitStrengthToBudget(full, 30);
      expect(short.variant).toBe("compact");
      expect(short.minutes).toBeLessThanOrEqual(30);
      expect(
        short.exercises.some((e) => ["knee_strength", "unilateral_strength"].includes(e.role)),
      ).toBe(true);
      expect(short.exercises.some((e) => ["hip_strength", "knee_flexion"].includes(e.role))).toBe(
        true,
      );
      expect(short.exercises.some((e) => e.role === "push" || e.role === "pull")).toBe(true);
      for (const e of short.exercises)
        expect(e.dose.restSeconds).toBe(
          full.exercises.find((a) => a.exerciseId === e.exerciseId)!.dose.restSeconds,
        );
    }
  });
  it("gives sprint an executable warm-up and counts main sprint metres separately", () => {
    const speed = buildRunning(p, "speed", "development")!;
    expect(speed.exercises[0].role).toBe("warmup");
    expect(speed.exercises.filter((e) => e.role === "warmup").length).toBeGreaterThanOrEqual(2);
    expect(speed.sprintMetres).toBe(120);
  });
  it("does not require a football pitch for sprint preparation on an available lane", () => {
    const profile = { ...p, hasPitch: false };
    const plan = generateTrainingPlan(profile, options).plan;
    const speed = slots(plan).find((s) => s.engineV2!.roles.includes("speed"))!;
    expect(speed).toBeDefined();
    expect(validateEngineSession(speed, profile)).toEqual([]);
  });
  it("keeps a gym warm-up in small space and never consumes its only main leg exercise", () => {
    const profile = {
      ...p,
      hasSprintSpace: false,
      hasPitch: false,
      hasGym: false,
      equipment: [],
      gymExperienceLevel: "none" as const,
    };
    const recipe = buildStrength(profile, "A", "development");
    expect(recipe.exercises[0].exerciseId).toBe("hip_mobility_flow");
    expect(recipe.exercises.some((e) => e.role === "knee_strength")).toBe(true);
    expect(recipe.exercises.some((e) => e.role === "hip_strength")).toBe(true);
  });
  it("does not infer special equipment or a safe pulling anchor from no equipment", () => {
    expect(eligibleExercise("full_nordic_hamstring", { ...p, equipment: [] })).toBe(false);
    expect(eligibleExercise("trap_bar_deadlift", { ...p, equipment: [] })).toBe(false);
    expect(eligibleExercise("bodyweight_row", { ...p, hasGym: false, equipment: [] })).toBe(false);
  });
  it("enables a cluster only on the primary qualified block and executes both rests", () => {
    const coached = { ...p, age: 16, trainingMethodPreferences: { strength: "M08" as const } };
    const result = generateTrainingPlan(coached, options);
    const a = slots(result.plan).find((s) => s.engineV2!.roles.includes("strengthA"))!;
    const cluster = a
      .structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises))
      .find((e) => e.engineDose?.cluster)!;
    expect(cluster.methodExecution).toMatchObject({
      mode: "cluster",
      repGroups: [2, 2],
      restSeconds: 20,
      roundRestSeconds: 180,
    });
    expect(validateTrainingPlan(result.plan, coached, options)).toEqual([]);
    expect(
      buildStrength({ ...coached, supervisionLevel: "none" }, "A", "development").exercises.some(
        (e) => e.dose.cluster,
      ),
    ).toBe(false);
    expect(buildStrength(coached, "A", "deload").exercises.some((e) => e.dose.cluster)).toBe(false);
  });
  it("retains a cycle anchor on recalculation and uses week four for review, not mandatory deload", () => {
    const first = generateTrainingPlan(p, { ...options, weeks: 4 });
    expect(slots(first.plan).some((s) => s.engineV2!.cycle?.state === "review")).toBe(true);
    expect(slots(first.plan).some((s) => s.engineV2!.phase === "deload")).toBe(false);
    const again = generateTrainingPlan(p, {
      ...options,
      startDate: "2026-11-16",
      previousPlan: first.plan,
    });
    for (const s of slots(again.plan))
      expect(s.engineV2!.cycle).toMatchObject({ anchorDate: "2026-11-02", weekIndex: 2 });
  });
  it("uses only real completed recent strength RPE for the first lighter week", () => {
    const plan = generateTrainingPlan(p, options).plan;
    const a = slots(plan).filter((s) => s.engineV2!.roles.some((r) => r.startsWith("strength")));
    const completions: Record<string, SessionCompletion> = Object.fromEntries(
      a.map((s, i) => [
        String(i),
        { completed: true, status: "completed", rpe: 9, notes: "", executionSnapshot: s },
      ]),
    );
    const opts = { ...options, startDate: "2026-11-09", completions };
    expect(cycleForWeek(p, opts, opts.startDate).cycle.state).toBe("deload");
    expect(cycleForWeek(p, opts, "2026-11-16").cycle.state).not.toBe("deload");
    for (const c of Object.values(completions)) c.completed = false;
    expect(cycleForWeek(p, opts, opts.startDate).cycle.state).not.toBe("deload");
  });
  it("does not count completion aliases as two hard exposures", () => {
    const session = slots(generateTrainingPlan(p, options).plan).find((s) =>
      s.engineV2!.roles.includes("strengthA"),
    )!;
    const completion: SessionCompletion = {
      completed: true,
      status: "completed",
      rpe: 9,
      notes: "",
      executionSnapshot: session,
    };
    const opts = {
      ...options,
      startDate: "2026-11-09",
      completions: { id: completion, alias: structuredClone(completion) },
    };
    expect(cycleForWeek(p, opts, opts.startDate).cycle.state).not.toBe("deload");
  });
  it("migrates a V2.4 cycle from the calendar start, including an initial rest day", () => {
    const old = generateTrainingPlan(p, options).plan;
    for (const d of old) {
      d.generatorVersion = "ballwise-v2.4";
      if (d.engineV2) delete d.engineV2.cycle;
    }
    old[0].engineV2 = undefined;
    const opts = { ...options, startDate: "2026-11-16", previousPlan: old };
    expect(cycleForWeek(p, opts, opts.startDate).cycle.anchorDate).toBe("2026-11-02");
  });
  it("does not present the same light load as a successful decrease", () => {
    const advice = recommendStrengthProgression(e, [
      log("1", "2026-11-01"),
      log("2", "2026-11-08"),
    ]);
    expect(advice?.kind).toBe("review");
    expect(advice?.weightKg).toBeUndefined();
  });
  it("resumes a verified normal baseline after deload without using it as a new load record", () => {
    const before = log("normal", "2026-11-01", { weightKg: 80, rir: 3 });
    const reduced = log("light", "2026-11-08", { weightKg: 60, rir: 4 });
    reduced.verification = {
      expectedSets: 2,
      prescriptionKey: "different-reduced-dose",
      phase: "reduced",
    };
    const history = [reduced, before];
    expect(recommendStrengthProgression(e, history, "2026-11-15")).toMatchObject({
      kind: "resume",
      weightKg: 80,
    });
    expect(comparablePreviousSets(e, history)).toEqual({});
    reduced.verification = undefined;
    expect(recommendStrengthProgression(e, history)).toBeNull();
    expect(
      recommendStrengthProgression({ ...e, progressionPhase: "reduced" }, [
        before,
        { ...before, sessionKey: "other" },
      ]),
    ).toBeNull();
  });
  it("blocks stale load advice after a long interruption", () => {
    const history = [
      log("1", "2026-10-01", { weightKg: 80, rir: 3 }),
      log("2", "2026-10-08", { weightKg: 80, rir: 3 }),
    ];
    expect(recommendStrengthProgression(e, history, "2026-11-15")).toBeNull();
  });
});
