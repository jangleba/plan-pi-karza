import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { generateTrainingPlan, refreshStrengthSession, validateTrainingPlan } from "./planner";
import { buildRunnerSteps } from "../sessionRunner/steps";
import { restSecondsAfter } from "../sessionRunner/presentation";
import {
  ADVANCED_CONTACT_LIMIT,
  advancedSessionsEligible,
  buildAdvancedStrength,
  noteLevel,
} from "./advancedSessions";

/**
 * The athlete's four gym notes are the universal 16+ gym sessions: 1a/1b/1c groups with 30 s
 * transitions and a full rest after each round, the note's own exercises where preparation and
 * equipment allow, replacements of the same function otherwise.
 */
const athlete = {
  name: "Notes",
  age: 20,
  position: "midfielder",
  level: "advanced",
  goal: "power",
  secondaryLimiter: null,
  clubTrainingDays: [2, 4],
  individualTrainingDays: [1, 3, 5, 6, 7],
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
    "box",
    "platform",
    "med_ball",
    "gym_throw_zone",
    "kettlebell",
    "gym_jump_lane",
    "trap_bar",
    "nordic_setup",
    "swiss_ball",
    "sliders",
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
  hasPitch: false,
  hasSprintSpace: false,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 24,
  movementCompetence: "high",
  supervisionLevel: "full",
} as unknown as Profile;
const opts = { startDate: "2026-11-02", weeks: 2, minutesPerSession: 75 };
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const strength = (plan: SessionDay[]) =>
  plan.flatMap(slots).filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")));
const ids = (s: SessionDay) => s.engineV2!.exercises.map((e) => e.exerciseId);
const groups = (s: SessionDay) => s.engineV2!.complexPairs!.map((p) => p.exerciseIds.join("+"));
const gen = (p: Profile, o = opts) => generateTrainingPlan(p, o).plan;
const byNote = (plan: SessionDay[], note: string) =>
  strength(plan).find((s) => s.engineV2!.advancedTemplate === note)!;
const LOWER = ["knee_strength", "hip_strength", "unilateral_strength"];

describe("gym sessions follow the athlete's four notes", () => {
  const plan = gen(athlete);

  it("uses all four notes over two weeks, valid, within time and the landing limit", () => {
    expect(validateTrainingPlan(plan, athlete, opts)).toEqual([]);
    const notes = strength(plan).map((s) => s.engineV2!.advancedTemplate);
    expect(new Set(notes)).toEqual(
      new Set(["N_squat_bench", "N_trapbar", "N_clean_plyo", "N_step_reactive"]),
    );
    // A and B alternate their two notes week by week.
    const a = strength(plan).filter((s) => s.engineV2!.roles.includes("strengthA"));
    expect(a[0].engineV2!.advancedTemplate).not.toBe(a[1].engineV2!.advancedTemplate);
    for (const s of strength(plan)) {
      expect(s.durationMin).toBeLessThanOrEqual(75);
      expect(s.engineV2!.plyometricContacts).toBeLessThanOrEqual(ADVANCED_CONTACT_LIMIT(20));
      expect(s.engineV2!.organization).toBe("complex");
    }
  });

  it("„Jutro zrób tak”: iso push + SL box jump, hang power clean, back squat + depth jump over hurdle, bench + facepull, row + SL hip thrust", () => {
    const s = byNote(plan, "N_squat_bench");
    expect(groups(s)).toEqual(
      expect.arrayContaining([
        "knee_iso_push+single_leg_box_jump",
        "heavy_back_squat+depth_jump_over_hurdle",
        "barbell_bench_press+face_pull_band",
        "barbell_row+single_leg_straight_leg_hip_thrust",
      ]),
    );
    expect(ids(s)).toContain("power_clean");
    const squat = s.engineV2!.exercises.find((e) => e.exerciseId === "heavy_back_squat")!;
    expect(squat.dose).toMatchObject({ sets: 4, reps: 2 });
    expect(squat.dose.tempo).toEqual({
      eccentricSeconds: 4,
      pauseSeconds: 1,
      concentricSeconds: 1,
    });
    const bench = s.engineV2!.exercises.find((e) => e.exerciseId === "barbell_bench_press")!;
    expect(bench.dose.reps).toBe(2);
  });

  it("Day 1: SL hip thrust iso prep, hang power clean + pogo, quarter squat + drop jump, shot put + banded thrust, plyo row + back extension", () => {
    const s = byNote(plan, "N_clean_plyo");
    const main = s.engineV2!.exercises.filter((e) => e.role !== "warmup");
    expect(main[0].exerciseId).toBe("single_leg_straight_leg_ht_iso");
    expect(groups(s)).toEqual(
      expect.arrayContaining([
        "power_clean+bilateral_pogo",
        "quarter_box_squat+depth_jump",
        "medicine_ball_shot_put+single_leg_banded_hip_thrust",
        "single_arm_plyo_row+rebound_back_extension",
      ]),
    );
  });

  it("step-up note: three-exercise group step-up → weighted step-up jump → assisted single-leg jump", () => {
    const s = byNote(plan, "N_step_reactive");
    const triple = s.engineV2!.complexPairs!.find((g) => g.exerciseIds[0] === "loaded_step_up")!;
    expect(triple.exerciseIds).toHaveLength(3);
    expect(triple.exerciseIds[1]).toBe("weighted_step_up_jump");
    expect(ids(s)).toEqual(
      expect.arrayContaining(["banded_plyo_push_up", "speed_barbell_row", "full_nordic_hamstring"]),
    );
  });

  it("trap bar note: iso push + jumps, trap bar deadlift + plyo + assisted jumps (max 3), upper 3 × 5 push/pull, accessories", () => {
    const s = byNote(plan, "N_trapbar");
    const deadlift = s.engineV2!.exercises.find((e) => e.exerciseId === "trap_bar_deadlift")!;
    expect(deadlift.dose.reps).toBeLessThanOrEqual(3);
    expect(groups(s)[1].startsWith("trap_bar_deadlift+")).toBe(true);
    expect(s.engineV2!.complexPairs![1].exerciseIds).toHaveLength(3);
    const upper = s.engineV2!.exercises.filter((e) => ["push", "pull"].includes(e.role));
    expect(upper.length).toBeGreaterThanOrEqual(2);
    for (const e of upper) expect(e.dose).toMatchObject({ sets: 3, reps: 5 });
  });

  it("runs every group as one linked step: X1 → 30 s → X2 (→ 30 s → X3) → the full round rest", () => {
    for (const s of strength(plan)) {
      const linked = buildRunnerSteps(s.structuredSections!).filter((x) => x.kind === "linked");
      expect(linked.length).toBe(s.engineV2!.complexPairs!.length);
      for (const [i, step] of linked.entries()) {
        const group = s.engineV2!.complexPairs![i];
        expect(step.rows.map((r) => r.exercise.label)).toEqual(
          group.exerciseIds.map((_, n) => `${group.label}${n + 1}`),
        );
        expect(step.rows[0].block.executionProtocol).toBe("superset-rounds-v1");
        const last = step.rows.length - 1;
        step.rows.forEach((row, n) =>
          expect(restSecondsAfter(row.block, row.exercise, true, n < last)).toBe(
            n < last ? 30 : group.roundRestSeconds,
          ),
        );
      }
      expect(s.structuredSections!.map((x) => x.type)).toEqual(["warmup", "main"]);
    }
  });

  it("a rebuilt session keeps its note", () => {
    for (const s of strength(plan)) {
      const again = refreshStrengthSession(s, athlete, opts, plan)!;
      expect(again.engineV2!.advancedTemplate).toBe(s.engineV2!.advancedTemplate);
      expect(ids(again)).toEqual(ids(s));
    }
  });
});

describe("the notes adapt to the player", () => {
  it("16–17: at most 3 rounds, no depth or drop jumps, landings under the youth limit", () => {
    const teen = { ...athlete, age: 17 } as Profile;
    const plan = gen(teen);
    expect(validateTrainingPlan(plan, teen, opts)).toEqual([]);
    for (const s of strength(plan)) {
      expect(s.engineV2!.advancedTemplate).toBeDefined();
      for (const id of ["depth_jump", "depth_jump_over_hurdle"]) expect(ids(s)).not.toContain(id);
      expect(s.engineV2!.plyometricContacts).toBeLessThanOrEqual(ADVANCED_CONTACT_LIMIT(17));
      for (const e of s.engineV2!.exercises.filter((x) => x.role !== "warmup"))
        expect(e.dose.sets).toBeLessThanOrEqual(3);
    }
  });

  it("a 16-year-old beginner with dumbbells gets the same notes with replacements and smaller doses", () => {
    const beginner = {
      ...athlete,
      age: 16,
      level: "beginner",
      gymExperienceLevel: "beginner",
      strengthTrainingMonths: 3,
      movementCompetence: "medium",
      supervisionLevel: "some",
      equipment: ["dumbbell", "bench", "band"],
    } as unknown as Profile;
    expect(noteLevel(beginner)).toBe("intro");
    const plan = gen(beginner);
    expect(validateTrainingPlan(plan, beginner, opts)).toEqual([]);
    for (const s of strength(plan)) {
      expect(s.engineV2!.advancedTemplate).toBeDefined();
      const roles = new Set(s.engineV2!.exercises.map((e) => e.role));
      expect(LOWER.some((r) => roles.has(r as never))).toBe(true);
      expect(roles.has("push") || roles.has("pull")).toBe(true);
      for (const id of ["heavy_back_squat", "power_clean", "depth_jump", "wall_push_up"])
        expect(ids(s)).not.toContain(id);
    }
  });

  it("without declared strength data: replacements from the library, never the specialist ones", () => {
    const undeclared = {
      ...athlete,
      gymExperienceLevel: undefined,
      strengthTrainingMonths: undefined,
      movementCompetence: undefined,
      supervisionLevel: undefined,
    } as Profile;
    const plan = gen(undeclared);
    expect(validateTrainingPlan(plan, undeclared, opts)).toEqual([]);
    const all = strength(plan).flatMap(ids);
    for (const blocked of [
      "depth_jump",
      "depth_jump_over_hurdle",
      "heavy_back_squat",
      "power_clean",
    ])
      expect(all).not.toContain(blocked);
  });

  it.each([
    ["a chosen specialist method", { trainingMethodPreferences: { strength: "M09" } }],
    ["the chosen athletic A/B", { trainingMethodPreferences: { gymTemplate: "athletic_ab" } }],
    ["the chosen balanced A/B", { trainingMethodPreferences: { gymTemplate: "balanced" } }],
    [
      "hand-picked gym exercises",
      { trainingMethodPreferences: { gymExercises: { squat: "heavy_back_squat" } } },
    ],
    ["no gym", { hasGym: false }],
  ] as const)("keeps the usual A/B for %s", (_label, patch) => {
    const p = { ...athlete, ...patch } as Profile;
    expect(advancedSessionsEligible(p, "development")).toBe(false);
    for (const s of strength(gen(p))) expect(s.engineV2!.organization).not.toBe("complex");
  });

  it("keeps existing under-16 data readable but does not generate new training for it", () => {
    const young = { ...athlete, age: 15 } as Profile;
    expect(advancedSessionsEligible(young, "development")).toBe(false);
    expect(() => gen(young)).toThrow(/od 16 lat/);
  });

  it("a deload week keeps the note with at most 2 rounds, 3 reps in reserve and no depth jumps", () => {
    const s = buildAdvancedStrength(athlete, "A", "deload", 0, "N_clean_plyo")!;
    expect(s.advancedTemplate).toBe("N_clean_plyo");
    const plan = gen(athlete, { ...opts, startDate: "2026-11-02" });
    expect(plan.length).toBeGreaterThan(0);
    const deload = generateTrainingPlan(athlete, {
      ...opts,
      cycleStart: {
        kind: "deload",
        youth: false,
        reviewedCycleId: null,
        review: { recommendation: "deload" } as never,
      },
    }).plan;
    const first = strength(deload)[0].engineV2!;
    expect(first.phase).toBe("deload");
    expect(first.advancedTemplate).toBeDefined();
    for (const e of first.exercises.filter((x) => x.role !== "warmup")) {
      expect(e.dose.sets).toBeLessThanOrEqual(2);
      if (e.dose.rir !== undefined) expect(e.dose.rir).toBeGreaterThanOrEqual(3);
    }
    expect(first.exercises.map((e) => e.exerciseId)).not.toContain("depth_jump");
  });

  it("a shorter budget keeps the main lift and upper body; the note shortens from the end", () => {
    for (const minutes of [30, 45, 60]) {
      const o = { ...opts, minutesPerSession: minutes };
      const plan = gen(athlete, o);
      expect(validateTrainingPlan(plan, athlete, o)).toEqual([]);
      for (const s of strength(plan)) {
        expect(s.durationMin).toBeLessThanOrEqual(minutes);
        const roles = new Set(s.engineV2!.exercises.map((e) => e.role));
        expect(LOWER.some((r) => roles.has(r as never))).toBe(true);
        expect(roles.has("push") || roles.has("pull")).toBe(true);
      }
    }
  });

  it("jumps in the gym need the declared jump zone, not a pitch", () => {
    const noLane = {
      ...athlete,
      equipment: (athlete.equipment as string[]).filter((e) => e !== "gym_jump_lane"),
    } as Profile;
    const plan = gen(noLane);
    expect(validateTrainingPlan(plan, noLane, opts)).toEqual([]);
    for (const s of strength(plan))
      for (const id of [
        "bilateral_pogo",
        "box_jump",
        "single_leg_box_jump",
        "weighted_step_up_jump",
      ])
        expect(ids(s)).not.toContain(id);
  });
});
