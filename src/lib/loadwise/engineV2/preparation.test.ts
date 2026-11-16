import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import { buildStrength } from "./exercises";
import { getExerciseDefinition } from "../exerciseLibrary";
import { trainingTier } from "./model";
import { generateTrainingPlan } from "./planner";
import { recommendStrengthLoad } from "./progression";
import {
  exercisePrescriptionKey,
  verifyExerciseHistory,
  type ExerciseSessionLog,
} from "../setLogHistory";
import type { SessionCompletion } from "../types";
import {
  accelerationDistance,
  hasVerifiedAdvancedStrength,
  preparationProfile,
} from "./preparation";

const athlete: Profile = {
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
};

describe("preparation grounded in existing onboarding", () => {
  it.each([
    ["beginner", "foundation"],
    ["intermediate", "development"],
    ["advanced", "performance"],
    ["elite", "performance"],
  ] as const)("uses %s as a provisional %s volume category", (level, tier) => {
    const p = { ...athlete, level };
    const before = structuredClone(p);
    expect(preparationProfile(p)).toEqual({ tier, source: "onboarding", provisional: true });
    expect(trainingTier(p)).toBe(tier);
    expect(p).toEqual(before);
    expect(p.gymExperienceLevel).toBeUndefined();
    expect(p.strengthTrainingMonths).toBeUndefined();
    expect(p.movementCompetence).toBeUndefined();
    expect(p.supervisionLevel).toBeUndefined();
  });
  it.each<Partial<Profile>>([
    { gymExperienceLevel: "none" },
    { gymExperienceLevel: "beginner", strengthTrainingMonths: 36, movementCompetence: "high" },
    { strengthTrainingMonths: 0 },
    { movementCompetence: "low" },
  ])("lets a declared limitation override the generic level: %j", (patch) => {
    const p = { ...athlete, level: "elite" as const, ...patch };
    expect(preparationProfile(p)).toEqual({
      tier: "foundation",
      source: "explicit_strength",
      provisional: false,
    });
    expect(hasVerifiedAdvancedStrength(p)).toBe(false);
  });
  it.each<Partial<Profile>>([
    { gymExperienceLevel: "advanced" },
    { strengthTrainingMonths: NaN },
    { supervisionLevel: "none" },
  ])(
    "16+: an incomplete answer does not lower the athlete below the football level: %j",
    (patch) => {
      const p = { ...athlete, level: "elite" as const, ...patch };
      expect(preparationProfile(p)).toEqual({
        tier: "performance",
        source: "explicit_strength",
        provisional: true,
      });
      // Advanced methods still need the full declaration.
      expect(hasVerifiedAdvancedStrength(p)).toBe(false);
      // Under 16 (existing accounts only) the cautious rule stays.
      expect(preparationProfile({ ...p, age: 15 }).tier).toBe("foundation");
    },
  );
  it("retains real intermediate and advanced strength classifications", () => {
    const intermediate: Profile = {
      ...athlete,
      level: "beginner",
      gymExperienceLevel: "intermediate",
      strengthTrainingMonths: 6,
      movementCompetence: "medium",
    };
    expect(preparationProfile(intermediate).tier).toBe("development");
    const advanced: Profile = {
      ...intermediate,
      gymExperienceLevel: "advanced",
      strengthTrainingMonths: 24,
      movementCompetence: "high",
      // A complete declaration (including supervision) is required for verified advanced strength.
      supervisionLevel: "some",
    };
    expect(preparationProfile(advanced).tier).toBe("performance");
    expect(hasVerifiedAdvancedStrength(advanced)).toBe(true);
    expect(hasVerifiedAdvancedStrength({ ...advanced, age: 17 })).toBe(false);
    expect(hasVerifiedAdvancedStrength({ ...advanced, strengthTrainingMonths: 721 })).toBe(false);
  });
  it("never gives a trivial bodyweight squat as the main lift; reports the missing loaded variant", () => {
    const s = buildStrength(athlete, "A", "development");
    expect(s.tier).toBe("performance");
    expect(s.exercises.find((e) => e.role === "knee_strength")).toBeUndefined();
    expect(s.missing).toContain("knee_strength");
    // The warm-up still uses the bodyweight squat; it is not work.
    expect(
      s.exercises.some((e) => e.role === "warmup" && e.exerciseId === "bodyweight_squat"),
    ).toBe(true);
    const loaded = buildStrength(
      { ...athlete, hasGym: true, equipment: ["dumbbell"] },
      "A",
      "development",
    );
    const main = loaded.exercises.find((e) => e.role === "knee_strength")!;
    expect(main.exerciseId).toBe("goblet_squat");
    expect(loaded.missing).not.toContain("knee_strength");
    const deload = buildStrength(
      { ...athlete, hasGym: true, equipment: ["dumbbell"] },
      "A",
      "deload",
    );
    expect(deload.exercises.find((e) => e.role === "knee_strength")?.dose.sets).toBeLessThan(
      main.dose.sets,
    );
  });
  it("uses existing general preparation for simple power without granting advanced methods", () => {
    const p: Profile = {
      ...athlete,
      goal: "power",
      hasGym: true,
      equipment: ["barbell", "rack", "trap_bar", "dumbbell", "med_ball"],
      trainingMethodPreferences: { strength: "M09" },
    };
    const s = buildStrength(p, "A", "development");
    expect(s.exercises.some((e) => e.role === "power")).toBe(true);
    expect(s.organization).not.toBe("contrast");
    for (const e of s.exercises.filter((e) => e.role === "power"))
      expect(getExerciseDefinition(e.exerciseId)?.loadingType).toBe("bodyweight");
    expect(
      buildStrength(
        {
          ...p,
          trainingMethodPreferences: {
            strength: "M14",
            coachedIsometricPrimer: true,
            declaredEquipment: ["fixed_pins"],
          },
        },
        "A",
        "development",
      ).exercises.some((e) => e.role === "iso_primer"),
    ).toBe(false);
    const youth = buildStrength({ ...athlete, age: 13 }, "A", "development");
    expect(youth.exercises.some((e) => e.role === "landing")).toBe(true);
  });
  it("keeps provisional loaded work at a controlled basic dose", () => {
    const s = buildStrength({ ...athlete, hasGym: true, equipment: ["dumbbell"] }, "A", "peak");
    const main = s.exercises.find((e) => e.role === "knee_strength")!;
    expect(["external", "axial"]).toContain(getExerciseDefinition(main.exerciseId)?.loadingType);
    expect(main.dose).toMatchObject({ sets: 3, reps: 6, rir: 3, restSeconds: 120 });
  });
  it("lets two real completed heavy exposures support advice on the third week without changing the plan", () => {
    const p: Profile = {
      ...athlete,
      hasGym: true,
      equipment: ["barbell", "rack", "dumbbell"],
      gymExperienceLevel: "advanced",
      strengthTrainingMonths: 36,
      movementCompetence: "high",
      supervisionLevel: "full",
    };
    const plan = generateTrainingPlan(p, { startDate: "2026-11-02" }).plan;
    const sessions = plan
      .flatMap((day) => [day, day.secondSession])
      .filter((session) => session?.engineV2?.roles.includes("strengthA"));
    const main = sessions.map((session) =>
      session!
        .structuredSections!.flatMap((section) =>
          section.blocks.flatMap((block) => block.exercises),
        )
        .find((e) => e.exerciseId === "heavy_back_squat")!,
    );
    expect(main).toHaveLength(4);
    const key = exercisePrescriptionKey(main[0]);
    expect(main.slice(0, 3).map(exercisePrescriptionKey)).toEqual([key, key, key]);
    expect(main[0].engineDose).toMatchObject({ sets: 3, reps: 4, rir: 2, restSeconds: 180 });
    expect(main[3].engineDose).toMatchObject({ sets: 3, reps: 4, rir: 2 });
    const completions: Record<string, SessionCompletion> = {};
    const recorded: ExerciseSessionLog[] = sessions
      .slice(0, 2)
      .map((session, index) => {
        const sessionKey = `completed-${index}`;
        completions[sessionKey] = {
          completed: true,
          status: "completed",
          rpe: 6,
          notes: "",
          executionSnapshot: { ...session!, dbId: sessionKey },
        };
        return {
          sessionKey,
          performedAt: session!.date,
          sets: [1, 2, 3].map((setNumber) => ({ setNumber, weightKg: 80, reps: 4, rir: 2 })),
        };
      })
      .reverse();
    const verified = verifyExerciseHistory(recorded, "heavy_back_squat", completions);
    const before = structuredClone(main[2]);
    expect(recommendStrengthLoad(main[0], [])).toBeNull();
    expect(recommendStrengthLoad(main[1], verified.slice(1))).toBeNull();
    expect(recommendStrengthLoad(main[2], verified)?.weightKg).toBe(82);
    expect(main[2]).toEqual(before);
  });
  it("uses the real sprint-space answer while respecting a more specific measured lane", () => {
    expect(accelerationDistance(athlete)).toBe(20);
    expect(accelerationDistance({ ...athlete, age: 15 })).toBe(10);
    expect(accelerationDistance({ ...athlete, level: "beginner" })).toBe(10);
    expect(accelerationDistance({ ...athlete, hasSprintSpace: false })).toBe(10);
    expect(
      accelerationDistance({ ...athlete, trainingMethodPreferences: { spaceLengthM: 39 } }),
    ).toBe(10);
    expect(
      accelerationDistance({ ...athlete, trainingMethodPreferences: { spaceLengthM: 40 } }),
    ).toBe(20);
  });
});
