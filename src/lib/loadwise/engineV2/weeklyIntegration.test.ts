import { describe, expect, it } from "vitest";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { buildStrength } from "./exercises";
import { resolveGoalPolicy } from "./goalPolicy";
import type { EngineSession } from "./model";
import type { Profile, SessionDay } from "../types";

const base: Profile = {
  name: "Integration athlete",
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
    "machine",
    "band",
    "bench",
    "med_ball",
    "nordic_setup",
  ],
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
const options = { startDate: "2026-11-02", weeks: 1 };
const targetRoles = ["strengthA", "strengthB", "speed", "endurance"] as const;
const physicalSlots = (day: SessionDay) => [day, ...(day.secondSession ? [day.secondSession] : [])];
const ownSlots = (days: SessionDay[]) =>
  days.flatMap(physicalSlots).filter((slot) => !!slot.engineV2);
const targets = (days: SessionDay[]) =>
  ownSlots(days).flatMap((slot) =>
    slot.engineV2!.roles.filter((role) =>
      targetRoles.includes(role as (typeof targetRoles)[number]),
    ),
  );
const hasRole = (slot: SessionDay, role: EngineSession["roles"][number]) =>
  slot.engineV2?.roles.includes(role) === true;

describe("weekly planner end-to-end contracts", () => {
  it("lets a strength limiter or leading strength answer adjust priorities without inventing extra strength volume", () => {
    const plain = resolveGoalPolicy({ ...base, goal: "speed" });
    const limited = resolveGoalPolicy({ ...base, goal: "speed", secondaryLimiter: "strength" });
    const feeling = resolveGoalPolicy({
      ...base,
      goal: "speed",
      desiredPitchFeelings: ["strong_in_duels"],
    });
    expect(limited.priorities[0]).toBeGreaterThan(plain.priorities[0]);
    expect(feeling.priorities[1]).toBeGreaterThan(plain.priorities[1]);
    expect(limited.priorities[2]).toBeGreaterThan(limited.priorities[0]);
    const r = generateTrainingPlan(
      { ...base, goal: "speed", secondaryLimiter: "strength" },
      options,
    );
    expect(
      targets(r.plan).filter((role) => role === "strengthA" || role === "strengthB"),
    ).toHaveLength(2);
  });
  it("preserves the promised second endurance unit for the endurance goal and secondary limiter", () => {
    for (const p of [
      { ...base, goal: "endurance" as const },
      { ...base, secondaryLimiter: "endurance" as const },
    ]) {
      const r = generateTrainingPlan(p, options);
      expect(targets(r.plan).filter((role) => role === "endurance")).toHaveLength(2);
      expect(
        targets(r.plan).filter((role) => role === "strengthA" || role === "strengthB"),
      ).toHaveLength(2);
      expect(targets(r.plan).filter((role) => role === "speed")).toHaveLength(1);
      expect(r.issues.filter((issue) => issue.code === "UNMET_GOAL_TARGET")).toEqual([]);
      expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
    }
  });
  it("reports an omitted second endurance unit when the fixed baseline leaves no legal slot", () => {
    const p = {
      ...base,
      goal: "endurance" as const,
      individualTrainingDays: [2, 4],
      doubleSessionsAllowed: "no" as const,
    };
    const r = generateTrainingPlan(p, options);
    expect(targets(r.plan).filter((role) => role === "endurance")).toHaveLength(1);
    expect(r.issues.some((issue) => issue.code === "UNMET_GOAL_TARGET")).toBe(true);
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });
  it("uses only the leading directional answer and preserves the primary sprint goal", () => {
    const strong = {
      ...base,
      desiredPitchFeelings: [
        "strong_in_duels",
        "agile_in_turns",
      ] as Profile["desiredPitchFeelings"],
    };
    const agile = {
      ...base,
      desiredPitchFeelings: [
        "agile_in_turns",
        "strong_in_duels",
      ] as Profile["desiredPitchFeelings"],
    };
    const hasBraking = (p: Profile) =>
      ownSlots(
        generateTrainingPlan({ ...p, trainingMethodPreferences: { spaceLengthM: 40 } }, options)
          .plan,
      ).some((s) => ["planned_cod", "braking"].includes(s.engineV2!.sprintGoal ?? ""));
    expect(hasBraking(strong)).toBe(false);
    expect(hasBraking(agile)).toBe(true);
    expect(hasBraking({ ...agile, goal: "speed", secondaryLimiter: "cod" })).toBe(false);
    expect(
      resolveGoalPolicy({
        ...base,
        desiredPitchFeelings: ["prepared_for_higher_level", "agile_in_turns"],
        currentPitchFeelings: ["lacking_duel_strength"],
      }).firstAccent,
    ).toBe("strength");
  });
  it("reduces actual strength, sprint and running doses for explicit fatigue and return labels", () => {
    const normalProfile = { ...base, goal: "endurance" as const };
    const normal = generateTrainingPlan(normalProfile, options);
    const main = (r: ReturnType<typeof generateTrainingPlan>, role: (typeof targetRoles)[number]) =>
      ownSlots(r.plan).find((s) => hasRole(s, role))!.engineV2!;
    for (const p of [
      { ...normalProfile, secondaryLimiter: "fatigue" as const },
      {
        ...normalProfile,
        currentPitchFeelings: ["returning_after_break"] as Profile["currentPitchFeelings"],
      },
      { ...normalProfile, goal: "return" as const },
    ]) {
      const r = generateTrainingPlan(p, options);
      const sets = (s: EngineSession) =>
        s.exercises.find((e) => e.role === "knee_strength")!.dose.sets;
      expect(sets(main(r, "strengthA"))).toBeLessThan(sets(main(normal, "strengthA")));
      expect(main(r, "speed").sprintMetres).toBeLessThan(main(normal, "speed").sprintMetres);
      expect(main(r, "endurance").runningRecipe!.blocks[0].work.seconds).toBeLessThan(
        main(normal, "endurance").runningRecipe!.blocks[0].work.seconds,
      );
      expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
    }
  });
  it("does not infer a current fatigue diagnosis from fading late in matches", () => {
    const p = {
      ...base,
      currentPitchFeelings: ["fading_late_in_match"] as Profile["currentPitchFeelings"],
    };
    expect(resolveGoalPolicy(p).reduced).toBe(false);
    expect(resolveGoalPolicy(p).extraEndurance).toBe(true);
  });
  it("keeps low-readiness MD-1 activation gentle instead of adding default jumps", () => {
    const p = {
      ...base,
      weeklyMatches: true,
      usualMatchDay: 7,
      healthPersonalizationEnabled: true,
    };
    const r = generateTrainingPlan(p, {
      ...options,
      readiness: {
        "2026-11-07": {
          date: "2026-11-07",
          sleep: 3,
          energy: 3,
          fatigue: 8,
          soreness: 6,
          jointPain: 0,
          stress: 7,
          motivation: 3,
          overall: 3,
        },
      },
    });
    const activation = ownSlots(r.plan).find((s) => hasRole(s, "activation"))!;
    expect(activation).toBeDefined();
    expect(
      activation.engineV2!.exercises.some(
        (e) => e.role === "power" || e.exerciseId === "countermovement_jump",
      ),
    ).toBe(false);
  });
  it("does not unlock double-high sessions from an unverified advanced onboarding tier", () => {
    const p = {
      ...base,
      gymExperienceLevel: undefined,
      strengthTrainingMonths: undefined,
      movementCompetence: undefined,
      supervisionLevel: undefined,
      individualTrainingDays: [2, 4],
    };
    const r = generateTrainingPlan(p, options);
    for (const day of r.plan)
      expect(ownSlots([day]).filter((s) => s.engineV2!.highLower).length).toBeLessThanOrEqual(1);
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });
  it("adds real MD-1 activation and MD+1 recovery without crediting them as strength or sprint", () => {
    const p = { ...base, weeklyMatches: true, usualMatchDay: 7, seasonPhase: "inseason" as const };
    const r = generateTrainingPlan(p, { ...options, weeks: 2 });
    const saturday = r.plan.find((day) => day.date === "2026-11-07")!;
    const monday = r.plan.find((day) => day.date === "2026-11-09")!;
    expect(physicalSlots(saturday).some((slot) => hasRole(slot, "activation"))).toBe(true);
    expect(physicalSlots(monday).some((slot) => hasRole(slot, "recovery"))).toBe(true);
    for (const slot of [...physicalSlots(saturday), ...physicalSlots(monday)].filter(
      (slot) => slot.engineV2,
    )) {
      expect(slot.engineV2!.highLower).toBe(false);
      expect(
        slot.engineV2!.roles.some((role) =>
          targetRoles.includes(role as (typeof targetRoles)[number]),
        ),
      ).toBe(false);
    }
    expect(validateTrainingPlan(r.plan, p, { ...options, weeks: 2 })).toEqual([]);
  });

  it("keeps club commitments while never creating a hidden third physical session", () => {
    const p = {
      ...base,
      clubTrainingDays: [2, 4],
      weeklyMatches: true,
      usualMatchDay: 7,
      seasonPhase: "inseason" as const,
    };
    const r = generateTrainingPlan(p, options);
    for (const date of ["2026-11-03", "2026-11-05"]) {
      const club = r.plan.find((day) => day.date === date)!;
      expect(club.dayType).toBe("club");
      expect(club.externalCommitment).toBe(true);
      expect(club.engineV2).toBeUndefined();
      expect(physicalSlots(club)).toHaveLength(club.secondSession ? 2 : 1);
      expect(club.secondSession?.secondSession).toBeFalsy();
      if (club.secondSession) expect(club.secondSession.externalCommitment).toBe(false);
    }
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });

  it("builds different foundational and advanced strength content from actual preparation", () => {
    const beginner = {
      ...base,
      age: 13,
      level: "elite" as const,
      gymExperienceLevel: "beginner" as const,
      strengthTrainingMonths: 2,
      movementCompetence: "low" as const,
    };
    const novice = generateTrainingPlan(beginner, options);
    const advanced = generateTrainingPlan(base, options);
    expect(novice.tier).toBe("foundation");
    expect(advanced.tier).toBe("performance");
    const main = (days: SessionDay[]) =>
      ownSlots(days).flatMap((slot) =>
        slot.engineV2!.exercises.filter((exercise) =>
          ["knee_strength", "hip_strength"].includes(exercise.role),
        ),
      );
    expect(
      main(novice.plan).some((exercise) =>
        ["heavy_back_squat", "barbell_deadlift", "trap_bar_deadlift"].includes(exercise.exerciseId),
      ),
    ).toBe(false);
    expect(
      main(advanced.plan).some((exercise) =>
        ["heavy_back_squat", "barbell_deadlift", "trap_bar_deadlift"].includes(exercise.exerciseId),
      ),
    ).toBe(true);
    const advancedExercises = ownSlots(advanced.plan).flatMap((slot) => slot.engineV2!.exercises);
    expect(advancedExercises.some((exercise) => exercise.role === "unilateral_strength")).toBe(
      true,
    );
    expect(advancedExercises.some((exercise) => exercise.role === "knee_flexion")).toBe(true);
    expect(advancedExercises.some((exercise) => exercise.role === "hamstring_iso")).toBe(true);
    expect(advancedExercises.some((exercise) => exercise.role === "adductor")).toBe(true);
  });

  it("covers two own strength units, sprint and endurance while support remains additional", () => {
    const p = { ...base, goal: "mobility" as const };
    const r = generateTrainingPlan(p, options);
    expect(targets(r.plan).sort()).toEqual([...targetRoles].sort());
    expect(ownSlots(r.plan).some((slot) => hasRole(slot, "mobility"))).toBe(true);
    expect(r.issues.filter((issue) => issue.code === "UNMET_WEEKLY_TARGET")).toEqual([]);
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });

  it("keeps strength and sprint on separate days and reports an impossible two-date week", () => {
    const p = { ...base, individualTrainingDays: [2, 4] };
    const r = generateTrainingPlan(p, options);
    expect(targets(r.plan).sort()).toEqual(["endurance", "strengthA", "strengthB"]);
    expect(r.issues.filter((issue) => issue.code === "UNMET_WEEKLY_TARGET")).toHaveLength(1);
    for (const day of r.plan) {
      if (ownSlots([day]).length) expect(["2026-11-03", "2026-11-05"]).toContain(day.date);
      expect(day.secondSession?.secondSession).toBeFalsy();
    }
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });

  it("returns concrete unavailability explanations instead of pretending an impossible week is complete", () => {
    const p = { ...base, unavailableDays: [1, 2, 3, 4, 5, 6, 7] };
    const r = generateTrainingPlan(p, options);
    expect(targets(r.plan)).toEqual([]);
    const missing = r.issues.filter((issue) => issue.code === "UNMET_WEEKLY_TARGET");
    expect(missing).toHaveLength(4);
    for (const issue of missing) {
      expect(issue.message).toMatch(/dostępn/i);
      expect(issue.message).not.toMatch(/strengthA|strengthB|endurance/);
    }
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });

  it("does not manufacture an integrated double-heavy unit for a sixteen-year-old", () => {
    const p = {
      ...base,
      age: 16,
      gymExperienceLevel: "intermediate" as const,
      strengthTrainingMonths: 12,
      weeklyMatches: true,
      usualMatchDay: 7,
    };
    const r = generateTrainingPlan(p, options);
    for (const day of r.plan) {
      const heavy = ownSlots([day]).filter((slot) => slot.engineV2!.highLower);
      expect(heavy.length).toBeLessThanOrEqual(1);
      for (const slot of heavy)
        expect(
          slot.engineV2!.roles.filter((role) =>
            targetRoles.includes(role as (typeof targetRoles)[number]),
          ),
        ).toHaveLength(1);
    }
    expect(r.issues.some((issue) => issue.code === "UNMET_WEEKLY_TARGET")).toBe(true);
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });

  it("never consolidates strength and sprint even for a qualified adult", () => {
    const p = { ...base, weeklyMatches: true, usualMatchDay: 7 };
    const r = generateTrainingPlan(p, options);
    expect(r.issues.some((issue) => issue.code === "UNMET_WEEKLY_TARGET")).toBe(true);
    expect(
      r.plan.some((day) => {
        const roles = targets([day]);
        return (
          roles.includes("speed") && (roles.includes("strengthA") || roles.includes("strengthB"))
        );
      }),
    ).toBe(false);
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });

  it("fits compact balanced sessions within thirty minutes when equipment permits", () => {
    const short = { ...options, minutesPerSession: 30 };
    const r = generateTrainingPlan(base, short);
    for (const slot of ownSlots(r.plan)) expect(slot.durationMin).toBeLessThanOrEqual(30);
    expect(targets(r.plan).sort()).toEqual([...targetRoles].sort());
    expect(validateTrainingPlan(r.plan, base, short)).toEqual([]);
  });

  it("does not reduce a normal strength prescription merely because the sole available day is MD-3", () => {
    const p = {
      ...base,
      individualTrainingDays: [4],
      weeklyMatches: true,
      usualMatchDay: 7,
      doubleSessionsAllowed: "no" as const,
    };
    const r = generateTrainingPlan(p, options);
    const slot = ownSlots(r.plan).find((session) => hasRole(session, "strengthA"))!;
    expect(slot).toBeDefined();
    expect(slot.date).toBe("2026-11-05");
    expect(slot.mdLabel).toBe("MD-3");
    const expected = buildStrength(p, "A", "adaptation").exercises.find(
      (exercise) => exercise.role === "knee_strength",
    )!;
    const actual = slot.engineV2!.exercises.find((exercise) => exercise.role === "knee_strength")!;
    expect(actual.dose).toEqual(expected.dose);
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });
});
