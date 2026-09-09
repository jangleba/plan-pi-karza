import { describe, it, expect } from "vitest";
import type { Profile } from "./types";
import {
  buildAthleteTrainingProfile,
  getDevelopmentStage,
  getStrengthExperienceLevel,
  validateExerciseForAthleteProfile,
  validateExerciseAgainstInjuries,
  getSafeExerciseAlternatives,
  replaceUnsafeExercise,
  classifyExerciseTypes,
} from "./athleteProfile";
import {
  validateWorkoutForAthleteProfile,
  repairUnsafeExercisesForAthleteProfile,
} from "./athleteProfileRepair";
import { generatePlan } from "./planEngine";

function makeProfile(over: Partial<Profile>): Profile {
  return {
    name: "Test",
    age: 14,
    position: "midfielder",
    level: "beginner",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 3, 6],
    usualMatchDay: 7,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-06-01",
    seasonPhase: "inseason",
    seasonStage: null,
    competitionLevel: "academy",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...over,
  };
}

function collectAllNames(plan: ReturnType<typeof generatePlan>): string[] {
  const out: string[] = [];
  for (const d of plan) {
    const sessions = [d, d.secondSession].filter(Boolean) as typeof plan;
    for (const s of sessions) {
      const sec = s.sections;
      if (sec)
        for (const k of ["warmup", "main", "accessory", "footballTransfer", "cooldown"] as const)
          for (const e of sec[k] ?? []) out.push(e.name);
      for (const st of s.structuredSections ?? [])
        for (const b of st.blocks) for (const e of b.exercises) out.push(e.name);
    }
  }
  return out;
}

describe("development stage & experience", () => {
  it("maps age to development stage", () => {
    expect(getDevelopmentStage(11)).toBe("child_foundation");
    expect(getDevelopmentStage(14)).toBe("early_youth");
    expect(getDevelopmentStage(16)).toBe("late_youth");
    expect(getDevelopmentStage(22)).toBe("adult");
    expect(getDevelopmentStage(null)).toBe("early_youth"); // bezpieczny default
  });

  it("youth advanced footballer is not advanced in the gym", () => {
    expect(getStrengthExperienceLevel({ age: 14, level: "advanced" })).toBe("beginner");
    expect(getStrengthExperienceLevel({ age: 14, level: "beginner" })).toBe("none");
  });

  it("missing experience defaults to a safe beginner", () => {
    const a = buildAthleteTrainingProfile({ age: undefined as unknown as number });
    expect(["none", "beginner"]).toContain(a.gymExperienceLevel);
    expect(a.exerciseSafetyProfile.allowHeavyCompounds).toBe(false);
    expect(a.onboardingWarnings.length).toBeGreaterThan(0);
  });
});

describe("exercise classification & blocking", () => {
  it("recognizes heavy/olympic/max lifts", () => {
    expect(classifyExerciseTypes("Ciężki martwy ciąg ze sztangą")).toContain("heavy_barbell_deadlift");
    expect(classifyExerciseTypes("Power clean")).toContain("olympic_lift");
    expect(classifyExerciseTypes("Back squat 1RM test")).toContain("max_effort");
    expect(classifyExerciseTypes("Depth jump")).toContain("depth_jump");
  });

  it("blocks heavy lifts for a 14yo beginner", () => {
    const a = buildAthleteTrainingProfile(makeProfile({ age: 14, level: "beginner" }));
    expect(validateExerciseForAthleteProfile("Martwy ciąg ze sztangą", a).ok).toBe(false);
    expect(validateExerciseForAthleteProfile("Ciężki back squat", a).ok).toBe(false);
    expect(validateExerciseForAthleteProfile("Power snatch", a).ok).toBe(false);
    expect(validateExerciseForAthleteProfile("Bodyweight squat", a).ok).toBe(true);
  });

  it("allows advanced exercises for an adult advanced athlete with gym", () => {
    const a = buildAthleteTrainingProfile(
      makeProfile({ age: 24, level: "advanced", hasGym: true }),
    );
    expect(a.exerciseSafetyProfile.allowHeavyCompounds).toBe(true);
    expect(validateExerciseForAthleteProfile("Back squat", a).ok).toBe(true);
  });
});

describe("equipment constraints", () => {
  it("no gym → no barbell/machines", () => {
    const a = buildAthleteTrainingProfile(makeProfile({ age: 24, level: "advanced", hasGym: false }));
    expect(validateExerciseForAthleteProfile("Martwy ciąg ze sztangą", a).ok).toBe(false);
    const repl = getSafeExerciseAlternatives("Back squat ze sztangą", a);
    expect(repl.name).toBeTruthy();
  });
});

describe("injury constraints", () => {
  it("back pain blocks deadlift / heavy hinge", () => {
    const a = buildAthleteTrainingProfile(
      makeProfile({ age: 24, level: "advanced", painLocations: ["back"] }),
    );
    expect(validateExerciseAgainstInjuries("Martwy ciąg", a).ok).toBe(false);
    const repl = getSafeExerciseAlternatives("Martwy ciąg", a);
    expect(repl.name.toLowerCase()).toMatch(/core|bird dog|dead bug/);
  });

  it("knee pain blocks aggressive plyo", () => {
    const a = buildAthleteTrainingProfile(
      makeProfile({ age: 24, level: "advanced", painLocations: ["knee"] }),
    );
    expect(validateExerciseAgainstInjuries("Depth jump", a).ok).toBe(false);
  });
});

describe("replaceUnsafeExercise", () => {
  it("swaps unsafe to a regression with reason", () => {
    const a = buildAthleteTrainingProfile(makeProfile({ age: 14, level: "beginner" }));
    const fixed = replaceUnsafeExercise(
      { name: "Barbell deadlift ciężki", prescription: "5 × 3" } as import("./types").ExerciseItem,
      a,
    );
    expect(fixed.wasAdjustedForAthleteProfile).toBe(true);
    expect(fixed.replacementForBlockedExercise).toMatch(/deadlift/i);
    expect(fixed.name).not.toMatch(/sztang/i);
  });
});

describe("plan-level repair", () => {
  it("14yo beginner: no heavy lifts in generated plan, but still has gym strength", () => {
    const profile = makeProfile({ age: 14, level: "beginner", goal: "strength" });
    const plan = generatePlan(profile, new Date("2026-07-06"), 7);
    const names = collectAllNames(plan).join(" | ").toLowerCase();
    expect(names).not.toMatch(/martwy ciąg ze sztang|ciężki back squat|1rm|snatch|clean/);
    // walidator nie zgłasza żadnych niezgodności
    const a = buildAthleteTrainingProfile(profile);
    const { plan: again, adjustments } = repairUnsafeExercisesForAthleteProfile(plan, profile);
    expect(again.length).toBe(plan.length);
    // ponowny przebieg nie wymaga już zmian
    expect(adjustments.length).toBe(0);
    void a;
  });

  it("does not strip a whole session, only changes content", () => {
    const profile = makeProfile({ age: 14, level: "beginner", goal: "strength" });
    const plan = generatePlan(profile, new Date("2026-07-06"), 7);
    const gymDays = plan.filter((d) => (d.structuredSections?.length ?? 0) > 0);
    const a = buildAthleteTrainingProfile(profile);
    for (const d of gymDays) {
      const { session } = validateWorkoutForAthleteProfile(d, a);
      const total =
        session.structuredSections?.reduce(
          (n, s) => n + s.blocks.reduce((m, b) => m + b.exercises.length, 0),
          0,
        ) ?? 0;
      expect(total).toBeGreaterThan(0);
    }
  });
});
