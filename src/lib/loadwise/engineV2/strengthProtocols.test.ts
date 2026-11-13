import { describe, expect, it } from "vitest";
import { buildStrength, estimateSeconds, estimateSessionSeconds } from "./exercises";
import { coachedPrimerEligible, COACHED_ISOMETRIC_PRIMER } from "./strengthProtocols";
import {
  getExerciseDefinition,
  selectEquipmentAwareReplacement,
  validateCanonicalReplacementChains,
} from "../exerciseLibrary";
import { buildAthleteTrainingProfile } from "../athleteProfile";
import { functionalReplacementCompatible } from "./taxonomy";
import type { Profile } from "../types";

const athlete: Profile = {
  name: "Test",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["barbell", "rack", "dumbbell", "fixed_pins", "nordic_setup", "band", "med_ball"],
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
const primerProfile: Profile = {
  ...athlete,
  trainingMethodPreferences: { strength: "M14", coachedIsometricPrimer: true },
};

describe("reviewed strength and isometric protocols", () => {
  it("rejects functionally wrong equipment substitutions while retaining genuine Nordic regressions", () => {
    expect(functionalReplacementCompatible("seated_leg_curl", "romanian_deadlift_db")).toBe(false);
    expect(
      functionalReplacementCompatible("full_nordic_hamstring", "long_lever_hamstring_iso"),
    ).toBe(false);
    expect(
      functionalReplacementCompatible("full_nordic_hamstring", "eccentric_nordic_hamstring"),
    ).toBe(true);
    expect(functionalReplacementCompatible("single_leg_hop_and_stick", "bilateral_pogo")).toBe(
      false,
    );
    expect(
      functionalReplacementCompatible("heel_dig_hamstring_iso_30", "heel_dig_hamstring_iso_90"),
    ).toBe(false);
    expect(
      functionalReplacementCompatible("overcoming_pin_squat_primer", "overcoming_pin_squat"),
    ).toBe(false);
    const curl = getExerciseDefinition("seated_leg_curl")!;
    expect(functionalReplacementCompatible("romanian_deadlift_db", "bodyweight_squat")).toBe(false);
    expect(functionalReplacementCompatible("romanian_deadlift_db", "glute_bridge")).toBe(false);
    expect(
      functionalReplacementCompatible("barbell_romanian_deadlift", "romanian_deadlift_db"),
    ).toBe(true);
    expect(curl.replacementIds).not.toContain("romanian_deadlift_db");
    const profile = buildAthleteTrainingProfile({
      ...athlete,
      hasGym: false,
      equipment: ["dumbbell"],
    });
    const replacement = selectEquipmentAwareReplacement("seated_leg_curl", profile);
    expect(replacement.exercise?.id).not.toBe("romanian_deadlift_db");
    expect(validateCanonicalReplacementChains().ok).toBe(true);
  });
  it("retains the main dynamic lift and provides a distinct optional quadriceps hold", () => {
    const a = buildStrength(
      { ...athlete, trainingMethodPreferences: { strength: "M13" } },
      "A",
      "development",
    );
    expect(a.exercises.find((e) => e.role === "knee_strength")?.exerciseId).toBe(
      "heavy_back_squat",
    );
    const quad = a.exercises.find((e) => e.role === "quad_iso")!;
    expect(quad.exerciseId).toBe("split_squat_iso_hold");
    expect(quad.dose).toMatchObject({ sets: 2, seconds: 15, perSide: true, intent: "hold" });
    const definition = getExerciseDefinition(quad.exerciseId)!;
    expect(definition.movementPattern).toBe("isometric");
    expect(definition.instructionsPl?.join(" ")).toContain("nie sprężynuj");
    const deload = buildStrength(
      { ...athlete, trainingMethodPreferences: { strength: "M13" } },
      "A",
      "deload",
    );
    expect(deload.exercises.find((e) => e.role === "quad_iso")!.dose).toMatchObject({
      sets: 1,
      seconds: 12,
    });
  });
  it("uses a separate coached primer ID and honours the complete mandatory recovery", () => {
    const a = buildStrength(primerProfile, "A", "development");
    const iso = a.exercises.find((e) => e.role === "iso_primer")!;
    expect(iso.exerciseId).toBe("overcoming_pin_squat_primer");
    expect(iso.dose).toMatchObject({
      sets: 3,
      seconds: 3,
      restSeconds: 60,
      postRestSeconds: 300,
      jointAngleDegrees: 90,
    });
    expect(estimateSeconds(iso)).toBe(9 + 120 + 300 + 45);
    expect(a.exercises.indexOf(iso)).toBeLessThan(a.exercises.findIndex((e) => e.role === "power"));
    expect(a.exercises.indexOf(iso)).toBeLessThan(
      a.exercises.findIndex((e) => e.role === "knee_strength"),
    );
    expect(a.exercises.some((e) => e.exerciseId === "overcoming_pin_squat")).toBe(false);
    expect(COACHED_ISOMETRIC_PRIMER.boundary).toContain("Heavy-lift enhancement was not tested");
  });
  it("never infers coach confirmation from choosing M14 or from merely having a gym", () => {
    const withoutConfirmation = {
      ...athlete,
      trainingMethodPreferences: { strength: "M14" as const },
    };
    expect(coachedPrimerEligible(withoutConfirmation, "development")).toBe(false);
    expect(
      buildStrength(withoutConfirmation, "A", "development").exercises.some(
        (e) => e.role === "iso_primer",
      ),
    ).toBe(false);
    expect(coachedPrimerEligible({ ...primerProfile, equipment: [] }, "development")).toBe(false);
    expect(
      coachedPrimerEligible(
        {
          ...primerProfile,
          equipment: [],
          trainingMethodPreferences: {
            strength: "M14",
            coachedIsometricPrimer: true,
            declaredEquipment: ["fixed_pins"],
          },
        },
        "development",
      ),
    ).toBe(true);
    const explicitPins: Profile = {
      ...primerProfile,
      equipment: [],
      trainingMethodPreferences: {
        strength: "M14",
        coachedIsometricPrimer: true,
        declaredEquipment: ["fixed_pins"],
      },
    };
    expect(
      buildStrength(explicitPins, "A", "development").exercises.some(
        (e) => e.role === "iso_primer",
      ),
    ).toBe(true);
  });
  it.each<Partial<Profile>>([
    { age: 17 },
    { strengthTrainingMonths: 23 },
    { strengthTrainingMonths: 721 },
    { gymExperienceLevel: "intermediate" },
    { movementCompetence: "medium" },
    { supervisionLevel: "some" },
    { hasGym: false },
    { painInjury: true },
    { seasonPhase: "return_injury" },
    { seasonPhase: "transition" },
    { unavailableEquipmentIds: ["fixed_pins"] },
  ])("blocks the specialist primer when a prerequisite is missing: %j", (patch) => {
    expect(coachedPrimerEligible({ ...primerProfile, ...patch }, "development")).toBe(false);
    expect(
      buildStrength({ ...primerProfile, ...patch }, "A", "development").exercises.some(
        (e) => e.role === "iso_primer",
      ),
    ).toBe(false);
  });
  it("does not insert maximum primer work into a deload", () => {
    expect(
      buildStrength(primerProfile, "A", "deload").exercises.some((e) => e.role === "iso_primer"),
    ).toBe(false);
  });
  it("allows simple power in a technically prepared beginner rather than deriving it from league", () => {
    const p = {
      ...athlete,
      gymExperienceLevel: "beginner" as const,
      strengthTrainingMonths: 3,
      movementCompetence: "medium" as const,
    };
    expect(buildStrength(p, "A", "adaptation").exercises.some((e) => e.role === "power")).toBe(
      true,
    );
    expect(
      buildStrength({ ...p, movementCompetence: "low" }, "A", "adaptation").exercises.some(
        (e) => e.role === "landing",
      ),
    ).toBe(true);
  });
  it("keeps knee flexion assistance explicit and supports a distinct rotational power option", () => {
    const p = { ...athlete, goal: "power" as const };
    expect(
      buildStrength(p, "B", "development").exercises.find((e) => e.role === "power")?.exerciseId,
    ).toBe("medicine_ball_rotational_scoop_toss");
    const knee = buildStrength(athlete, "A", "development").exercises.find(
      (e) => e.role === "knee_flexion",
    )!;
    expect(knee.dose.assistance).toBe("none");
  });
  it("builds one coherent contrast pair only after the preparation gates", () => {
    const p = {
      ...athlete,
      goal: "power" as const,
      trainingMethodPreferences: { strength: "M09" as const },
    };
    for (const variant of ["A", "B"] as const) {
      const s = buildStrength(p, variant, "development");
      expect(s.organization).toBe("contrast");
      const primary = s.exercises.find(
        (e) => e.role === (variant === "A" ? "knee_strength" : "hip_strength"),
      )!;
      const power = s.exercises.find((e) => e.role === "power")!;
      expect(primary.dose.sets).toBe(power.dose.sets);
      expect(primary.dose.restSeconds).toBe(180);
      expect(power.dose.restSeconds).toBe(180);
      expect(s.exercises.indexOf(primary)).toBeLessThan(s.exercises.indexOf(power));
      expect(s.minutes).toBe(Math.ceil(estimateSessionSeconds(s.exercises) / 60) + 8);
      expect(getExerciseDefinition(power.exerciseId)?.movementPattern).toBe("jump");
    }
    expect(buildStrength(p, "A", "adaptation").organization).not.toBe("contrast");
    expect(buildStrength(p, "A", "deload").organization).not.toBe("contrast");
    expect(buildStrength({ ...p, age: 17 }, "A", "development").organization).not.toBe("contrast");
    expect(
      buildStrength(
        { ...p, gymExperienceLevel: "beginner", strengthTrainingMonths: 2 },
        "A",
        "development",
      ).organization,
    ).not.toBe("contrast");
  });
  it("counts the between-exercise rest of a final contrast round exactly once", () => {
    const pair = [
      {
        exerciseId: "heavy_back_squat",
        role: "knee_strength" as const,
        dose: { sets: 3, reps: 4, restSeconds: 180, intent: "controlled" as const },
        reason: "test",
      },
      {
        exerciseId: "countermovement_jump",
        role: "power" as const,
        dose: { sets: 3, reps: 3, restSeconds: 180, intent: "explosive" as const },
        reason: "test",
      },
    ];
    expect(estimateSessionSeconds(pair)).toBe(75 + 900 + 90);
    expect(
      estimateSessionSeconds([
        ...pair,
        {
          exerciseId: "full_nordic_hamstring",
          role: "knee_flexion" as const,
          dose: { sets: 1, reps: 1, restSeconds: 120, intent: "controlled" as const },
          reason: "test",
        },
      ]),
    ).toBe(79 + 1080 + 135);
  });
});
