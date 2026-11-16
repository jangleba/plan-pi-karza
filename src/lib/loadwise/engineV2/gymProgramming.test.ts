import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import { gymAthlete } from "./testFixtures";
import {
  GYM_DECLARED_EQUIPMENT,
  GYM_EXERCISE_OPTIONS,
  type GymExerciseSlot,
} from "../gymProgramming";
import { decodeStrengthExperience, encodeStrengthExperience } from "../strengthExperience";
import { getExerciseDefinition } from "../exerciseLibrary";
import { buildStrength, estimateSessionSeconds, fitStrengthToBudget } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { strengthLandingCount } from "./gymPower";
import { deriveEngineSessionLoad, validateEngineSession } from "./validation";

const prepared: Profile = {
  ...gymAthlete,
  age: 27,
  goal: "strength",
  equipment: [...GYM_DECLARED_EQUIPMENT],
  trainingMethodPreferences: { coachedOlympicLifts: true },
};
const choices = Object.entries(GYM_EXERCISE_OPTIONS).flatMap(([slot, options]) =>
  options.ids.map((id) => ({ slot: slot as GymExerciseSlot, id })),
);
const bSlots = new Set(["hinge", "unilateral", "powerB", "upperPower", "pullB", "landing"]);

describe("gym catalogue reaches actual A/B prescriptions", () => {
  it("allows only the prescribed preparatory M13 hold, without moving arbitrary holding work before strength", () => {
    const p = { ...prepared, trainingMethodPreferences: { strength: "M13" as const } };
    const opts = { startDate: "2026-11-16", weeks: 1 };
    const a = generateTrainingPlan(p, opts).plan.find((s) =>
      s.engineV2?.roles.includes("strengthA"),
    )!;
    expect(validateEngineSession(a, p)).toEqual([]);
    const changed = structuredClone(a);
    changed.engineV2!.exercises.find((e) => e.role === "quad_iso")!.dose.seconds = 90;
    expect(
      validateEngineSession(changed, p).some((i) => i.code === "ISOMETRIC_SUPPORT_ORDER"),
    ).toBe(true);
    expect(
      validateEngineSession(a, prepared).some((i) => i.code === "ISOMETRIC_SUPPORT_ORDER"),
    ).toBe(true);
    const short = generateTrainingPlan(p, { ...opts, minutesPerSession: 30 });
    expect(validateTrainingPlan(short.plan, p, { ...opts, minutesPerSession: 30 })).toEqual([]);
  });
  it.each(["M08", "M09", "M13", "M14"] as const)(
    "keeps the complete %s method valid at the final boundary",
    (method) => {
      const p = {
        ...prepared,
        trainingMethodPreferences: {
          strength: method,
          coachedIsometricPrimer: method === "M14",
        },
      };
      const opts = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };
      const result = generateTrainingPlan(p, opts);
      expect(validateTrainingPlan(result.plan, p, opts)).toEqual([]);
      expect(
        result.issues.filter(
          (i) => !["UNMET_WEEKLY_TARGET", "REDUCED_STRENGTH_TIME"].includes(i.code),
        ),
      ).toEqual([]);
    },
  );
  it.each(choices)("prescribes $slot → $id through the real builder", ({ slot, id }) => {
    const p = {
      ...prepared,
      trainingMethodPreferences: {
        ...prepared.trainingMethodPreferences,
        gymExercises: { [slot]: id },
      },
    };
    const raw = buildStrength(p, bSlots.has(slot) ? "B" : "A", "development");
    const row = raw.exercises.find((e) => e.exerciseId === id);
    expect(row, `${slot}: ${raw.exercises.map((e) => e.exerciseId).join(", ")}`).toBeDefined();
    expect(getExerciseDefinition(id)?.instructionsPl?.length).toBeGreaterThanOrEqual(3);
    expect(raw.minutes).toBe(Math.ceil(estimateSessionSeconds(raw.exercises) / 60));
  });

  it.each([16, 17, 27])(
    "gives a prepared %i-year-old a complete balanced week at 75 min",
    (age) => {
      // The balanced A/B layout, chosen in settings; the default gym sessions follow the notes.
      const p = {
        ...prepared,
        age,
        trainingMethodPreferences: {
          ...prepared.trainingMethodPreferences,
          gymTemplate: "balanced",
        },
      } as Profile;
      const opts = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };
      const result = generateTrainingPlan(p, opts);
      expect(validateTrainingPlan(result.plan, p, opts)).toEqual([]);
      const sessions = result.plan
        .flatMap((s) => [s, ...(s.secondSession ? [s.secondSession] : [])])
        .filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")));
      expect(sessions).toHaveLength(2);
      const [a, b] = sessions.map((s) => s.engineV2!);
      expect(a.exercises.some((e) => e.exerciseId === "heavy_back_squat")).toBe(true);
      expect(b.exercises.some((e) => e.exerciseId === "trap_bar_deadlift")).toBe(true);
      expect(b.exercises.some((e) => e.exerciseId === "bulgarian_split_squat")).toBe(true);
      for (const s of sessions) {
        const recipe = s.engineV2!;
        expect(recipe.advancedTemplate).toBeUndefined();
        expect(recipe.exercises.filter((e) => e.role !== "warmup").length).toBeGreaterThanOrEqual(
          8,
        );
        expect(s.durationMin).toBeGreaterThanOrEqual(55);
        expect(s.durationMin).toBeLessThanOrEqual(75);
        for (const role of ["push", "pull", "trunk", "adductor"] as const)
          expect(recipe.exercises.some((e) => e.role === role)).toBe(true);
      }
    },
  );

  it("keeps working sets when a slight time overrun only needs one optional accessory removed", () => {
    const full = buildStrength(prepared, "A", "development");
    const fitted = fitStrengthToBudget(full, full.minutes - 1);
    expect(fitted.minutes).toBeLessThan(full.minutes);
    for (const role of ["knee_strength", "knee_flexion", "push", "pull"] as const)
      expect(fitted.exercises.find((e) => e.role === role)?.dose).toEqual(
        full.exercises.find((e) => e.role === role)?.dose,
      );
  });

  it("keeps main exercise identities stable throughout the block (balanced A/B)", () => {
    const opts = { startDate: "2026-11-16", weeks: 4 };
    const p = {
      ...prepared,
      trainingMethodPreferences: { ...prepared.trainingMethodPreferences, gymTemplate: "balanced" },
    } as Profile;
    const result = generateTrainingPlan(p, opts);
    expect(validateTrainingPlan(result.plan, p, opts)).toEqual([]);
    for (const role of ["strengthA", "strengthB"] as const) {
      const ids = result.plan
        .filter((s) => s.engineV2?.roles.includes(role))
        .map(
          (s) =>
            s.engineV2!.exercises.find(
              (e) => e.role === (role === "strengthA" ? "knee_strength" : "hip_strength"),
            )!.exerciseId,
        );
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(1);
    }
  });

  it("saves and reloads gym equipment and choices, including the largest valid payload", () => {
    const gymExercises = Object.fromEntries(
      Object.entries(GYM_EXERCISE_OPTIONS).map(([slot, options]) => [slot, options.ids[0]]),
    );
    const record = {
      ...prepared,
      trainingMethodPreferences: {
        gymTemplate: "balanced" as const,
        gymExercises,
        coachedOlympicLifts: true,
        declaredEquipment: [...GYM_DECLARED_EQUIPMENT],
      },
    };
    const reloaded = decodeStrengthExperience(encodeStrengthExperience(record));
    expect(reloaded.trainingMethodPreferences).toEqual(record.trainingMethodPreferences);
    expect(reloaded.trainingMethodPreferences?.declaredEquipment).toContain("trap_bar");
    expect(reloaded.trainingMethodPreferences?.declaredEquipment).toContain("nordic_setup");
    expect(encodeStrengthExperience({ ...record, ...reloaded })).toBe(
      encodeStrengthExperience(record),
    );
  });

  it("does not turn missing station/technique declarations into specialist exercises", () => {
    const p = {
      ...prepared,
      equipment: ["barbell", "rack", "dumbbell", "bench"],
      supervisionLevel: "none" as const,
      trainingMethodPreferences: {
        gymExercises: {
          powerA: "hang_power_snatch",
          hinge: "trap_bar_deadlift",
          kneeFlexion: "full_nordic_hamstring",
        },
      },
    };
    const rows = [
      buildStrength(p, "A", "development"),
      buildStrength(p, "B", "development"),
    ].flatMap((r) => r.exercises);
    for (const id of ["hang_power_snatch", "trap_bar_deadlift", "full_nordic_hamstring"])
      expect(rows.some((e) => e.exerciseId === id)).toBe(false);
    expect(rows.some((e) => e.reason.includes("Wybrany wariant"))).toBe(true);
  });

  it("lets an experienced adult train ordinary loaded lifts independently", () => {
    const p = { ...prepared, supervisionLevel: "none" as const };
    const a = buildStrength(p, "A", "development"),
      b = buildStrength(p, "B", "development");
    expect(a.exercises.some((e) => e.exerciseId === "heavy_back_squat")).toBe(true);
    expect(b.exercises.some((e) => e.exerciseId === "trap_bar_deadlift")).toBe(true);
    expect(b.exercises.some((e) => e.exerciseId === "bulgarian_split_squat")).toBe(true);
    expect(a.exercises.some((e) => e.exerciseId === "hang_power_snatch")).toBe(false);
  });

  it("counts both landings of a depth/drop jump and a drop landing without rebound", () => {
    const r = buildStrength(
      {
        ...prepared,
        trainingMethodPreferences: {
          gymExercises: { powerA: "depth_jump" },
        },
      },
      "A",
      "development",
    );
    expect(strengthLandingCount(r.exercises)).toBe(18);
    const b = buildStrength(
      {
        ...prepared,
        trainingMethodPreferences: {
          gymExercises: { powerB: "drop_jump", landing: "single_leg_drop_landing" },
        },
      },
      "B",
      "development",
    );
    expect(strengthLandingCount(b.exercises)).toBe(18 + 12);
  });

  it("accounts for prescribed tempo in time, rendering and independent validation", () => {
    const p = {
      ...prepared,
      trainingMethodPreferences: { gymExercises: { squat: "tempo_back_squat" } },
    };
    const opts = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };
    const result = generateTrainingPlan(p, opts);
    expect(validateTrainingPlan(result.plan, p, opts)).toEqual([]);
    const a = result.plan.find((s) => s.engineV2?.roles.includes("strengthA"))!;
    expect(deriveEngineSessionLoad(a.engineV2!, p).minutes).toBe(a.durationMin);
    const row = a
      .structuredSections!.flatMap((sec) => sec.blocks.flatMap((b) => b.exercises))
      .find((e) => e.exerciseId === "tempo_back_squat")!;
    expect(row.cue).toContain("3 s opuszczanie");
    expect(row.engineDose?.tempo).toEqual({
      eccentricSeconds: 3,
      pauseSeconds: 1,
      concentricSeconds: 1,
    });
    const corrupt = structuredClone(a);
    corrupt.engineV2!.exercises.find(
      (e) => e.exerciseId === "tempo_back_squat",
    )!.dose.tempo!.pauseSeconds = -1;
    expect(validateEngineSession(corrupt, p).some((i) => i.code === "INVALID_TEMPO_DOSE")).toBe(
      true,
    );
  });
});
