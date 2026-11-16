import { describe, expect, it } from "vitest";
import { buildStrength, fitStrengthToBudget } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { validateEngineSession } from "./validation";
import { GYM_STRENGTH_EXERCISES } from "../gymStrengthExercises";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "../exerciseLibrary";
import { buildAthleteTrainingProfile } from "../athleteProfile";
import { metricKindForExercise } from "../exerciseMetrics";
import { taskKind, workSeconds } from "../sessionRunner/presentation";
import { strengthLandingCount } from "./gymPower";
import { OWN_EQUIPMENT_OPTIONS } from "../equipmentOptions";
import { normalizeMethodPreferences } from "../methods/preferences";
import type { Profile, TrainingExercise } from "../types";

// Declared qualification for specialist work (see the unqualified case below).
const player: Profile = {
  name: "Gym athlete",
  age: 20,
  position: "midfielder",
  level: "advanced",
  goal: "power",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["overhead_band_station", "low_band_station", "gym_jump_lane"],
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
  hasPitch: false,
  hasSprintSpace: false,
  // Specialist jump/band work requires a declared qualification (exercise library bar).
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 24,
  movementCompetence: "high",
  supervisionLevel: "full",
  // This suite exercises the established goal-based gymPowerCandidates routing.
  trainingMethodPreferences: { gymTemplate: "balanced" },
};
const power = (
  p = player,
  variant: "A" | "B" = "A",
  phase: "development" | "peak" | "deload" | "adaptation" = "development",
) => buildStrength(p, variant, phase).exercises.find((row) => row.role === "power");

describe("gym power inside existing A/B sessions", () => {
  it("uses different band directions according to the existing goal for a declared, supervised athlete", () => {
    expect(power()?.exerciseId).toBe("gym_cmj_resisted");
    expect(power({ ...player, goal: "speed" })?.exerciseId).toBe("gym_cmj_assisted");
    expect(power(player, "A", "peak")?.exerciseId).toBe("gym_cmj_assisted");
    const a = buildAthleteTrainingProfile(player);
    expect(a.supervisionLevel).toBe("full");
    for (const id of ["gym_cmj_assisted", "gym_cmj_resisted", "gym_fast_band_curl"])
      expect(isExerciseAllowedForProfile(id, a), id).toEqual({ ok: true, reasons: [] });
  });
  it("16+ advanced by default never assumes a coach: specialist band work needs the declaration", () => {
    const undeclared = {
      ...player,
      gymExperienceLevel: undefined,
      strengthTrainingMonths: undefined,
      movementCompetence: undefined,
      supervisionLevel: undefined,
    } as Profile;
    expect(power(undeclared)?.exerciseId).toBe("gym_cmj");
    const a = buildAthleteTrainingProfile(undeclared);
    // Advanced 16+ without answers: regular gym training and basic movement control are assumed…
    expect(a.gymExperienceLevel).toBe("intermediate");
    expect(a.movementCompetenceLevel).toBe("medium");
    // …but never a coach or high technique.
    expect(a.supervisionLevel).toBe("none");
    for (const id of ["gym_cmj_assisted", "gym_cmj_resisted", "gym_fast_band_curl"])
      expect(isExerciseAllowedForProfile(id, a).ok, id).toBe(false);
    // An explicit "trenuję sam" also keeps the specialist variants away.
    expect(power({ ...player, supervisionLevel: "none" })?.exerciseId).toBe("gym_cmj");
  });
  it("does not infer band anchors or a jumping lane from generic gym access", () => {
    const plain = { ...player, equipment: [] };
    expect(power(plain)?.exerciseId).toBe("gym_cmj");
    expect(power(plain, "B")?.exerciseId).toBe("gym_cmj");
    const a = buildAthleteTrainingProfile(plain);
    for (const id of [
      "gym_cmj_assisted",
      "gym_cmj_resisted",
      "gym_broad_jump",
      "gym_fast_band_curl",
    ])
      expect(isExerciseAllowedForProfile(id, a).ok, id).toBe(false);
  });
  it("makes equipment declarations reachable in the existing inventory and persists all known entries", () => {
    expect(OWN_EQUIPMENT_OPTIONS).toEqual(
      expect.arrayContaining([
        "Wolna strefa skoków na siłowni 6 × 3 m",
        "Gumy ze stałym mocowaniem górnym",
        "Gumy z dolnymi mocowaniami, pasem i mankietami",
      ]),
    );
    expect(
      normalizeMethodPreferences({
        declaredEquipment: [
          "fixed_pins",
          "sled",
          "partner",
          "hill",
          "chains",
          "flywheel",
          "velocity_device",
          "gym_jump_lane",
          "overhead_band_station",
          "low_band_station",
          "unknown",
        ],
      }).declaredEquipment,
    ).toEqual([
      "fixed_pins",
      "sled",
      "partner",
      "hill",
      "chains",
      "flywheel",
      "velocity_device",
      "gym_jump_lane",
      "overhead_band_station",
      "low_band_station",
    ]);
  });
  it("uses indoor broad jumps and lateral variants only with a declared clear lane", () => {
    expect(power(player, "B")?.exerciseId).toBe("gym_broad_jump");
    expect(power({ ...player, goal: "agility" }, "B")?.exerciseId).toBe("gym_lateral_bound");
    expect(
      power({ ...player, age: 15, level: "intermediate", goal: "agility" }, "B")?.exerciseId,
    ).toBe("gym_lateral_jump");
    for (const exercise of GYM_STRENGTH_EXERCISES) {
      const definition = getExerciseDefinition(exercise.id)!;
      expect(definition.spaceRequirement).toBe("indoor_gym");
      expect(definition.requiredSupervisionLevel).toBe("none");
      expect(definition.instructionsPl!.length).toBeGreaterThanOrEqual(3);
    }
  });
  it.each([13, 14, 15])("keeps the advanced band and oscillation variants out of age %s", (age) => {
    const p = { ...player, age };
    for (const v of ["A", "B"] as const) {
      const rows = buildStrength(p, v, "development").exercises;
      expect(
        rows.some((row) =>
          [
            "gym_cmj_assisted",
            "gym_cmj_resisted",
            "gym_fast_band_curl",
            "gym_bridge_pulses",
            "gym_lateral_bound",
          ].includes(row.exerciseId),
        ),
      ).toBe(false);
    }
  });
  it("keeps rapid band curls adult-only and uses a short bridge variant for prepared 16–17-year-olds", () => {
    const teen = buildStrength({ ...player, age: 17 }, "B", "development");
    expect(teen.exercises.find((e) => e.role === "hamstring_dynamic_support")?.exerciseId).toBe(
      "gym_bridge_pulses",
    );
    const adult = buildStrength(player, "B", "development");
    expect(adult.exercises.find((e) => e.role === "hamstring_dynamic_support")).toMatchObject({
      exerciseId: "gym_fast_band_curl",
      dose: { sets: 2, seconds: 4, restSeconds: 300, intent: "controlled" },
    });
    expect(
      adult.exercises.filter((e) =>
        ["hamstring_iso", "hamstring_dynamic_support"].includes(e.role),
      ),
    ).toHaveLength(1);
  });
  it.each(["adaptation", "deload"] as const)(
    "reduces the prescription instead of inserting specialist methods into %s",
    (phase) => {
      for (const variant of ["A", "B"] as const) {
        const r = buildStrength(player, variant, phase);
        expect(
          r.exercises.some((e) =>
            [
              "gym_cmj_assisted",
              "gym_cmj_resisted",
              "gym_fast_band_curl",
              "gym_bridge_pulses",
            ].includes(e.exerciseId),
          ),
        ).toBe(false);
      }
      expect(strengthLandingCount(buildStrength(player, "A", "deload").exercises)).toBeLessThan(
        strengthLandingCount(buildStrength(player, "A", "development").exercises),
      );
    },
  );
  it("counts both directions once and does not count a walking stop as a jump or sprint", () => {
    const r = buildStrength({ ...player, goal: "agility" }, "B", "development");
    expect(r.exercises.find((row) => row.exerciseId === "gym_lateral_bound")!.dose.perSide).toBe(
      true,
    );
    expect(r.plyometricContacts).toBe(18);
    expect(r.exercises.find((row) => row.exerciseId === "gym_step_brake")!.dose).toMatchObject({
      sets: 1,
      reps: 2,
      perSide: true,
    });
    expect(r.sprintMetres).toBe(0);
    const compact = fitStrengthToBudget(r, 30);
    expect(compact.plyometricContacts).toBe(strengthLandingCount(compact.exercises));
    expect(compact.plyometricContacts).toBeLessThan(r.plyometricContacts!);
  });
  it("executes pulses and fast curls by seconds without asking for kilograms, RIR or a fictitious force", () => {
    for (const id of ["gym_fast_band_curl", "gym_bridge_pulses"]) {
      const row: TrainingExercise = {
        id,
        exerciseId: id,
        name: getExerciseDefinition(id)!.displayNamePl,
        sets: "2",
        duration: "4 s",
        engineDose: { sets: 2, seconds: 4, restSeconds: 300, intent: "controlled" },
      };
      expect(metricKindForExercise(row)).toBe("time");
      expect(taskKind(row, { type: "accessory" }, "strength")).toBe("general");
      expect(workSeconds(row)).toBe(4);
    }
  });
  it("records CMJ variants as jumping tasks instead of interpreting their names as loaded lifts", () => {
    for (const id of ["gym_cmj", "gym_cmj_assisted", "gym_cmj_resisted"]) {
      expect(
        metricKindForExercise({
          id,
          exerciseId: id,
          name: getExerciseDefinition(id)!.displayNamePl,
        }),
      ).toBe("contacts");
    }
  });
  it("renders and validates complete A/B plans for gym-only players without adding a power session", () => {
    for (const goal of ["power", "speed", "agility"] as const) {
      const p = { ...player, goal };
      const result = generateTrainingPlan(p, {
        startDate: "2026-11-02",
        weeks: 4,
        minutesPerSession: 70,
      });
      const own = result.plan.flatMap((d) => [d, d.secondSession]).filter((d) => d?.engineV2);
      const gym = own.filter((d) => d!.engineV2!.roles.some((role) => role.startsWith("strength")));
      expect(gym.length).toBeGreaterThanOrEqual(4);
      expect(own.every((d) => !d!.engineV2!.roles.some((role) => String(role) === "power"))).toBe(
        true,
      );
      expect(
        gym.some((d) => d!.engineV2!.exercises.some((row) => row.exerciseId.startsWith("gym_"))),
      ).toBe(true);
      for (const d of gym) expect(validateEngineSession(d!, p)).toEqual([]);
      expect(
        validateTrainingPlan(result.plan, p, {
          startDate: "2026-11-02",
          weeks: 4,
          minutesPerSession: 70,
        }).filter((e) => /GYM_|STALE_STRENGTH_CONTACTS|FUNCTION_MISMATCH/.test(e.code)),
      ).toEqual([]);
    }
  });
  it("rejects extra jump repetitions, a shortened fast-curl rest and a conflicting screen dose", () => {
    const plan = generateTrainingPlan(player, {
      startDate: "2026-11-02",
      weeks: 4,
      minutesPerSession: 75,
    }).plan;
    const slots = plan.flatMap((d) => [d, d.secondSession]).filter((d) => d?.engineV2);
    const jump = structuredClone(
      slots.find((d) => d!.engineV2!.exercises.some((e) => e.exerciseId === "gym_cmj_resisted"))!,
    );
    jump.engineV2!.exercises.find((e) => e.exerciseId === "gym_cmj_resisted")!.dose.reps = 20;
    expect(validateEngineSession(jump, player).map((issue) => issue.code)).toContain(
      "GYM_POWER_DOSE",
    );
    const curl = structuredClone(
      slots.find((d) => d!.engineV2!.exercises.some((e) => e.exerciseId === "gym_fast_band_curl"))!,
    );
    curl.engineV2!.exercises.find((e) => e.exerciseId === "gym_fast_band_curl")!.dose.restSeconds =
      5;
    expect(validateEngineSession(curl, player).map((issue) => issue.code)).toContain(
      "GYM_DYNAMIC_SUPPORT_DOSE",
    );
    const shown = structuredClone(
      slots.find((d) => d!.engineV2!.exercises.some((e) => e.exerciseId === "gym_cmj_resisted"))!,
    );
    shown
      .structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises))
      .find((e) => e.exerciseId === "gym_cmj_resisted")!.reps = "20";
    expect(validateEngineSession(shown, player).map((issue) => issue.code)).toContain(
      "GYM_RENDERED_DOSE_MISMATCH",
    );
    const rest = structuredClone(
      slots.find((d) => d!.engineV2!.exercises.some((e) => e.exerciseId === "gym_fast_band_curl"))!,
    );
    rest
      .structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises))
      .find((e) => e.exerciseId === "gym_fast_band_curl")!.restAfterExercise = "5 s";
    expect(validateEngineSession(rest, player).map((issue) => issue.code)).toContain(
      "GYM_RENDERED_DOSE_MISMATCH",
    );
  });
});
