import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { buildRunnerSteps } from "../sessionRunner/steps";
import { restSecondsAfter } from "../sessionRunner/presentation";
import { ADVANCED_CONTACT_LIMIT, advancedSessionsEligible } from "./advancedSessions";

/** Advanced 16+ gym sessions organised like the athlete's coaching notes. */
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
    "kettlebell",
    "gym_jump_lane",
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
const pairIds = (s: SessionDay) => s.engineV2!.complexPairs!.map((p) => p.exerciseIds.join("+"));
const gen = (p: Profile, o = opts) => generateTrainingPlan(p, o).plan;

describe("advanced 16+ sessions follow the coaching notes", () => {
  it("builds A (11.09), A (squat note) and B (25.09) as pairs, valid end to end", () => {
    const plan = gen(athlete);
    expect(validateTrainingPlan(plan, athlete, opts)).toEqual([]);
    const [a1, b1, a2] = strength(plan);
    expect(a1.engineV2!.advancedTemplate).toBe("A_power");
    expect(pairIds(a1).slice(0, 2)).toEqual([
      "split_squat_iso_hold+bilateral_pogo", // Iso / Pogosy
      "drop_landing+depth_jump", // Landing / Depth jump
    ]);
    const bulgarian = a1.engineV2!.exercises.find((e) => e.exerciseId === "bulgarian_split_squat")!;
    expect(bulgarian.dose).toMatchObject({ sets: 3, reps: 3, perSide: true }); // Bulgary 3×3
    expect(ids(a1)).toContain("dumbbell_overhead_press"); // OHP
    expect(b1.engineV2!.advancedTemplate).toBe("B_hinge");
    expect(pairIds(b1)[0]).toBe("soleus_iso_hold+bilateral_pogo"); // ISO cała stopa / Pogo
    expect(ids(b1)).toEqual(
      expect.arrayContaining([
        "barbell_jump_squat", // Skoki ze sztangą
        "leg_extension", // maszyna, czwórki
        "single_leg_romanian_deadlift", // RDL jednonóż
        "gym_step_brake", // Hamowanie
        "pull_up", // Podciąganie
      ]),
    );
    expect(a2.engineV2!.advancedTemplate).toBe("A_squat");
    expect(pairIds(a2)).toEqual(
      expect.arrayContaining([
        "heavy_back_squat+box_jump", // Siady / Skoki na boxa
        "long_lever_hamstring_iso+repeated_broad_jump", // ISO na dwójki / Dwa skoki w dal
        "copenhagen_plank+medicine_ball_slam", // ISO bokiem / Slam z ziemi
        "dumbbell_overhead_press+side_plank", // OHP / Deska bokiem
      ]),
    );
    for (const s of [a1, b1, a2]) {
      expect(s.durationMin).toBeLessThanOrEqual(75);
      expect(s.engineV2!.plyometricContacts).toBeLessThanOrEqual(ADVANCED_CONTACT_LIMIT(20));
    }
  });

  it("runs each pair as one linked step: X1 → 30 s → X2 → the full round rest", () => {
    const [a1] = strength(gen(athlete));
    const linked = buildRunnerSteps(a1.structuredSections!).filter((s) => s.kind === "linked");
    expect(linked.length).toBe(a1.engineV2!.complexPairs!.length);
    for (const [i, step] of linked.entries()) {
      const pair = a1.engineV2!.complexPairs![i];
      expect(step.rows.map((r) => r.exercise.label)).toEqual([`${pair.label}1`, `${pair.label}2`]);
      expect(step.rows[0].block.executionProtocol).toBe("superset-rounds-v1");
      expect(restSecondsAfter(step.rows[0].block, step.rows[0].exercise, true, true)).toBe(30);
      expect(restSecondsAfter(step.rows[1].block, step.rows[1].exercise, true, false)).toBe(
        pair.roundRestSeconds,
      );
    }
    // Warm-up first, the pairs and single tasks in the order of the notes.
    expect(a1.structuredSections!.map((s) => s.type)).toEqual(["warmup", "main"]);
  });

  it("16–17: smaller volume and no depth jump; contacts stay under the youth limit", () => {
    const teen = { ...athlete, age: 17 } as Profile;
    const plan = gen(teen);
    expect(validateTrainingPlan(plan, teen, opts)).toEqual([]);
    for (const s of strength(plan).filter((x) => x.engineV2!.organization === "complex")) {
      expect(ids(s)).not.toContain("depth_jump");
      expect(s.engineV2!.plyometricContacts).toBeLessThanOrEqual(ADVANCED_CONTACT_LIMIT(17));
      for (const e of s.engineV2!.exercises.filter(
        (x) => x.role !== "warmup" && x.role !== "mobility",
      ))
        expect(e.dose.sets).toBeLessThanOrEqual(2);
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
    for (const blocked of ["depth_jump", "bulgarian_split_squat", "heavy_back_squat"])
      expect(all).not.toContain(blocked);
  });

  it.each([
    ["under 16 (existing account)", { age: 15 }],
    ["a declared limitation", { movementCompetence: "low" }],
    ["the strength goal (A/B with maximal-strength emphasis)", { goal: "strength" }],
    ["a chosen specialist method", { trainingMethodPreferences: { strength: "M09" } }],
    ["no gym", { hasGym: false }],
  ] as const)("keeps the usual A/B for %s", (_label, patch) => {
    const p = { ...athlete, ...patch } as Profile;
    expect(advancedSessionsEligible(p, "development")).toBe(false);
    for (const s of strength(gen(p))) expect(s.engineV2!.organization).not.toBe("complex");
  });

  it("lighter weeks are never advanced pairs", () => {
    expect(advancedSessionsEligible(athlete, "deload")).toBe(false);
    expect(advancedSessionsEligible(athlete, "adaptation")).toBe(false);
  });

  it("leaves the machine knee extension out in a match week (MD-3), as the note says", () => {
    const withMatch = { ...athlete, matchDates: ["2026-11-07"] } as Profile;
    const plan = gen(withMatch);
    expect(validateTrainingPlan(plan, withMatch, opts)).toEqual([]);
    const b = strength(plan).find((s) => s.date === "2026-11-04")!;
    expect(b.engineV2!.advancedTemplate).toBe("B_hinge");
    expect(ids(b)).not.toContain("leg_extension");
    const far = strength(gen(athlete)).find((s) => s.engineV2!.advancedTemplate === "B_hinge")!;
    expect(ids(far)).toContain("leg_extension");
  });

  it("a shorter budget drops optional trunk work first, otherwise uses the usual A/B", () => {
    for (const minutes of [45, 60]) {
      const o = { ...opts, minutesPerSession: minutes };
      const plan = gen(athlete, o);
      expect(validateTrainingPlan(plan, athlete, o)).toEqual([]);
      for (const s of strength(plan)) expect(s.durationMin).toBeLessThanOrEqual(minutes);
    }
  });

  it("jumps in the gym need the declared jump zone, not a pitch", () => {
    const noLane = {
      ...athlete,
      equipment: athlete.equipment.filter((e) => e !== "gym_jump_lane"),
    } as Profile;
    const plan = gen(noLane);
    expect(validateTrainingPlan(plan, noLane, opts)).toEqual([]);
    for (const s of strength(plan))
      for (const id of ["bilateral_pogo", "box_jump", "repeated_broad_jump", "medicine_ball_slam"])
        expect(ids(s)).not.toContain(id);
  });
});
