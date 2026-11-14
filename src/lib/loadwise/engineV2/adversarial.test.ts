import { describe, expect, it } from "vitest";
import { generateTrainingPlan } from "./planner";
import { deriveEngineSessionLoad, validateEngineSession } from "./validation";
import { exercisePrescriptionKey } from "../setLogHistory";
import type { Profile, SessionDay } from "../types";

const profile: Profile = {
  name: "Independent review",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "trap_bar",
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
};
function session(role: "strengthA" | "strengthB" | "speed" | "endurance"): SessionDay {
  const plan = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 1 }).plan;
  const value = plan
    .flatMap((d) => [d, d.secondSession])
    .find((d) => d?.engineV2?.roles.includes(role));
  expect(value, `missing test fixture for ${role}`).toBeTruthy();
  return structuredClone(value!);
}
const codes = (s: SessionDay) => validateEngineSession(s, profile).map((i) => i.code);

describe("independent final-session validation", () => {
  it("compares equal numeric doses after JSONB-style key reordering", () => {
    const a = { sets: 3, reps: 4, restSeconds: 180, rir: 2, intent: "controlled" as const };
    const b = { intent: "controlled" as const, rir: 2, restSeconds: 180, reps: 4, sets: 3 };
    expect(exercisePrescriptionKey({ sets: "3", reps: "4", rir: "2", engineDose: a })).toBe(
      exercisePrescriptionKey({ sets: "3", reps: "4", rir: "2", engineDose: b }),
    );
  });
  it("accepts actual generated prescriptions rather than merely synthetic metadata", () => {
    for (const d of generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 1 }).plan) {
      for (const s of [d, d.secondSession])
        if (s?.engineV2) expect(validateEngineSession(s, profile)).toEqual([]);
    }
  });
  it("preserves a real selected contrast through final rendering and independent time validation", () => {
    const p = {
      ...profile,
      goal: "power" as const,
      trainingMethodPreferences: { strength: "M09" as const },
    };
    const plan = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 2 }).plan;
    const contrasts = plan
      .flatMap((d) => [d, d.secondSession])
      .filter((s) => s?.engineV2?.organization === "contrast");
    expect(contrasts.length).toBeGreaterThan(0);
    for (const s of contrasts) expect(validateEngineSession(s!, p)).toEqual([]);
  });
  it("does not accept a specialist contrast from a provisional onboarding level", () => {
    const p = {
      ...profile,
      goal: "power" as const,
      trainingMethodPreferences: { strength: "M09" as const },
    };
    const result = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 2 });
    const actual = result.plan
      .flatMap((d) => [d, d.secondSession])
      .find((s) => s?.engineV2?.organization === "contrast")!;
    expect(actual).toBeDefined();
    const withoutStrengthHistory = {
      ...p,
      gymExperienceLevel: undefined,
      strengthTrainingMonths: undefined,
      movementCompetence: undefined,
      supervisionLevel: undefined,
    };
    expect(validateEngineSession(actual, withoutStrengthHistory).map((i) => i.code)).toContain(
      "CONTRAST_ELIGIBILITY",
    );
  });
  it.each([
    { secondaryLimiter: "return" as const },
    { currentPitchFeelings: ["returning_after_break" as const] },
  ])(
    "rejects advanced protocols when the existing onboarding selects a reduced route: %j",
    (changed) => {
      const contrastProfile = {
        ...profile,
        goal: "power" as const,
        trainingMethodPreferences: { strength: "M09" as const },
      };
      const contrast = generateTrainingPlan(contrastProfile, { startDate: "2026-11-02", weeks: 2 })
        .plan.flatMap((d) => [d, d.secondSession])
        .find((s) => s?.engineV2?.organization === "contrast")!;
      expect(
        validateEngineSession(contrast, { ...contrastProfile, ...changed }).map((i) => i.code),
      ).toContain("CONTRAST_ELIGIBILITY");
      const primerProfile = {
        ...profile,
        equipment: [...profile.equipment, "fixed_pins"],
        trainingMethodPreferences: { strength: "M14" as const, coachedIsometricPrimer: true },
      };
      const primer = generateTrainingPlan(primerProfile, { startDate: "2026-11-02", weeks: 1 })
        .plan.flatMap((d) => [d, d.secondSession])
        .find((s) => s?.engineV2?.exercises.some((e) => e.role === "iso_primer"))!;
      expect(
        validateEngineSession(primer, { ...primerProfile, ...changed }).map((i) => i.code),
      ).toContain("ISOMETRIC_PROTOCOL_MISMATCH");
    },
  );
  it("rejects a wall drill when only possession of a football was declared", () => {
    const p = {
      ...profile,
      goal: "general" as const,
      equipment: [...profile.equipment, "Piłka nożna", "rebounder"],
    };
    const skills = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 })
      .plan.flatMap((d) => [d, d.secondSession])
      .find((s) => s?.engineV2?.roles.includes("skills"))!;
    expect(skills).toBeDefined();
    expect(
      validateEngineSession(skills, {
        ...p,
        equipment: p.equipment.filter((e) => e !== "rebounder"),
      }).map((i) => i.code),
    ).toContain("MISSING_SESSION_REQUIREMENT");
  });
  it("cannot shorten a confirmed ISO primer's mandatory recovery or reuse it after confirmation is removed", () => {
    const p = {
      ...profile,
      equipment: [...profile.equipment, "fixed_pins"],
      trainingMethodPreferences: { strength: "M14" as const, coachedIsometricPrimer: true },
    };
    const plan = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 }).plan;
    const actual = plan
      .flatMap((d) => [d, d.secondSession])
      .find((s) => s?.engineV2?.exercises.some((e) => e.role === "iso_primer"));
    expect(actual).toBeTruthy();
    expect(validateEngineSession(actual!, p)).toEqual([]);
    const changed = structuredClone(actual!);
    changed.engineV2!.exercises.find((e) => e.role === "iso_primer")!.dose.postRestSeconds = 0;
    expect(validateEngineSession(changed, p).map((i) => i.code)).toContain(
      "ISOMETRIC_PROTOCOL_MISMATCH",
    );
    expect(
      validateEngineSession(actual!, {
        ...p,
        trainingMethodPreferences: {
          ...p.trainingMethodPreferences,
          coachedIsometricPrimer: false,
        },
      }).map((i) => i.code),
    ).toContain("ISOMETRIC_PROTOCOL_MISMATCH");
  });
  it("does not trust a cached sprint total when sets and repeated distances exceed the cap", () => {
    const s = session("speed"),
      e = s.engineV2!.exercises.find((e) => e.role === "speed")!;
    e.dose.distanceM = 100;
    e.dose.reps = 3;
    e.dose.sets = 6;
    s.engineV2!.sprintMetres = 0;
    expect(codes(s)).toContain("STALE_SPRINT_METRES");
    expect(codes(s)).toContain("SPRINT_LIMIT");
  });
  it("counts left and right distances and run-ins", () => {
    const s = session("speed"),
      e = s.engineV2!.exercises.find((e) => e.role === "speed")!;
    e.dose = { ...e.dose, sets: 2, reps: 2, distanceM: 10, runInM: 20, perSide: true };
    expect(deriveEngineSessionLoad(s.engineV2!, profile).sprintMetres).toBe(300); // 240 main + 40 build-ups + 20 braking approaches
  });
  it("does not trust a low cached time when the numeric work is long", () => {
    const s = session("strengthA");
    s.engineV2!.exercises[0].dose.sets = 1000;
    s.engineV2!.minutes = 1;
    s.durationMin = 1;
    expect(codes(s)).toContain("STALE_DURATION");
    expect(codes(s)).toContain("TIME_LIMIT");
  });
  it("does not trust a low-load flag on sprint work", () => {
    const s = session("speed");
    s.engineV2!.highLower = false;
    expect(codes(s)).toContain("STALE_LOAD_CLASSIFICATION");
  });
  it("does not count an RDL as knee flexion or Pallof as adductor work", () => {
    const s = session("strengthA");
    s.engineV2!.exercises.find((e) => e.role === "knee_flexion")!.exerciseId =
      "romanian_deadlift_db";
    expect(codes(s)).toContain("FUNCTION_MISMATCH");
    const a = session("strengthA");
    a.engineV2!.exercises.find((e) => e.role === "adductor")!.exerciseId = "pallof_press";
    expect(codes(a)).toContain("FUNCTION_MISMATCH");
  });
  it.each(["sets", "reps", "seconds", "restSeconds", "runInM"] as const)(
    "rejects non-finite %s without crashing",
    (key) => {
      const s = session("speed");
      s.engineV2!.exercises[0].dose[key] = Number.NaN;
      expect(codes(s)).toContain("INVALID_DOSE");
    },
  );
  it("replaces the ordinary last-set rest with a mandatory post-block rest once", () => {
    const s = session("strengthB"),
      before = deriveEngineSessionLoad(s.engineV2!, profile).minutes;
    const iso = s.engineV2!.exercises.find((e) => e.role === "hamstring_iso")!;
    (iso.dose as typeof iso.dose & { postRestSeconds: number }).postRestSeconds = 300;
    expect(deriveEngineSessionLoad(s.engineV2!, profile).minutes).toBe(before + 4);
  });
  it("counts all five rests in a three-round final contrast pair, and the sixth before a following block", () => {
    const s = session("strengthA"),
      primary = s.engineV2!.exercises.find((e) => e.role === "knee_strength")!,
      power = s.engineV2!.exercises.find((e) => e.role === "power")!;
    primary.dose = { sets: 3, reps: 4, restSeconds: 180, intent: "controlled" };
    power.dose = { sets: 3, reps: 3, restSeconds: 180, intent: "explosive" };
    s.engineV2!.organization = "contrast";
    s.engineV2!.exercises = [primary, power];
    // 75 s work + five 180 s rests + two 45 s transitions, then eight-minute preparation.
    expect(deriveEngineSessionLoad(s.engineV2!, profile).minutes).toBe(26);
    s.engineV2!.exercises.push({
      exerciseId: "full_nordic_hamstring",
      role: "knee_flexion",
      reason: "test",
      dose: { sets: 1, reps: 1, restSeconds: 60, intent: "controlled" },
    });
    expect(deriveEngineSessionLoad(s.engineV2!, profile).minutes).toBe(30);
  });
  it("rejects duplicate or unknown target roles", () => {
    const s = session("speed");
    s.engineV2!.roles.push("speed");
    expect(codes(s)).toContain("INVALID_SESSION_ROLES");
    const u = session("speed");
    u.engineV2!.roles = ["unknown" as never];
    expect(codes(u)).toContain("INVALID_SESSION_ROLES");
  });
  it("detects a counter recipe changed separately from the planned run", () => {
    const s = session("endurance");
    s.runningRecipe = structuredClone(s.runningRecipe!);
    s.runningRecipe!.blocks[0].work.seconds += 60;
    expect(codes(s)).toContain("RUN_CLOCK_MISMATCH");
  });
  it("derives a real interval session's full warm-up, work, recovery and cooldown instead of cached minutes", () => {
    const p = {
      ...profile,
      goal: "endurance" as const,
      fieldMasKmh: 16,
      fieldMasTestedAt: "2026-11-01",
      fieldMasSourceSessionId: "5f261acf-d1d6-4f50-9513-2fb027932041",
    };
    const generated = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 }).plan;
    const actual = generated
      .flatMap((d) => [d, d.secondSession])
      .find((s) => s?.engineV2?.roles.includes("endurance") && s.engineV2.highLower);
    expect(actual).toBeTruthy();
    expect(validateEngineSession(actual!, p)).toEqual([]);
    const run = actual!.engineV2!.runningRecipe!,
      block = run.blocks[0];
    const total =
      run.warmup.seconds +
      block.sets * block.repsPerSet * block.work.seconds +
      block.sets * (block.repsPerSet - 1) * block.recovery.seconds +
      run.cooldown.seconds;
    expect(deriveEngineSessionLoad(actual!.engineV2!, p).minutes).toBe(total / 60);
    const cached = structuredClone(actual!);
    cached.engineV2!.minutes = 1;
    cached.durationMin = 1;
    expect(validateEngineSession(cached, p).map((i) => i.code)).toContain("STALE_DURATION");
    const noRest = structuredClone(actual!);
    noRest.engineV2!.runningRecipe!.blocks[0].recovery.seconds = 0;
    noRest.runningRecipe = structuredClone(noRest.engineV2!.runningRecipe!);
    expect(validateEngineSession(noRest, p).map((i) => i.code)).toContain(
      "MISSING_INTERVAL_RECOVERY",
    );
    expect(validateEngineSession(noRest, p).map((i) => i.code)).toContain("RUN_DOSE_MISMATCH");
    const low = structuredClone(actual!);
    low.engineV2!.highLower = false;
    low.engineV2!.runningRecipe!.loadLevel = "low";
    low.runningRecipe = structuredClone(low.engineV2!.runningRecipe!);
    expect(validateEngineSession(low, p).map((i) => i.code)).toContain("STALE_LOAD_CLASSIFICATION");
  });
  it("rejects a non-finite running phase before arithmetic or counter execution", () => {
    const s = session("endurance");
    s.engineV2!.runningRecipe!.warmup.seconds = Number.NaN;
    expect(codes(s)).toContain("INVALID_RUN_RECIPE");
  });
});
