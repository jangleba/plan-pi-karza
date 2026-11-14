import { sprintChronology } from "./sprintRecipe";
import { describe, expect, it } from "vitest";
import { generateTrainingPlan } from "./planner";
import { executionKey, sessionExercises } from "../sessionExecution";
import { sessionPrescription } from "../planIdentity";
import { recipeTotalSeconds } from "@/lib/running/recipe";
import type { Profile, SessionDay } from "../types";

const base = {
  name: "Consistency athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "general",
  secondaryLimiter: null,
  clubTrainingDays: [1],
  individualTrainingDays: [2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: ["2026-11-14"],
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
} as unknown as Profile;
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const profiles: Profile[] = [
  base,
  { ...base, goal: "endurance" } as Profile,
  { ...base, goal: "speed", age: 16, level: "intermediate" } as Profile,
  {
    ...base,
    age: 15,
    level: "beginner",
    gymExperienceLevel: "beginner",
    strengthTrainingMonths: 0,
  } as Profile,
];

describe("one structure for plan, details and counter", () => {
  it.each(profiles.map((p, i) => [i, p] as const))(
    "profile %i: every own session is internally consistent",
    (_i, p) => {
      const plan = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 2 }).plan;
      const sessions = plan.flatMap(slots).filter((s) => s.engineV2);
      expect(sessions.length).toBeGreaterThan(0);
      for (const s of sessions) {
        const r = s.engineV2!;
        const shown = sessionExercises(s);
        // the exercises, their order and doses shown are the engine's decision
        const prescription =
          r.sprintRecipeVersion === 1 ? sprintChronology(r.exercises) : r.exercises;
        expect(shown.map((e) => e.exerciseId)).toEqual(prescription.map((e) => e.exerciseId));
        shown.forEach((e, i) => {
          const dose = prescription[i].dose;
          expect(e.engineDose).toEqual(dose);
          expect(e.sets).toBe(String(dose.sets));
          expect(e.restAfterExercise).toBe(`${dose.restSeconds} s`);
          if (dose.perSide) expect(e.displayPrescription).toContain("/ stronę");
        });
        // the same movement never appears twice in one session, so execution keys never collide
        const keys = shown.map(executionKey);
        expect(new Set(keys).size).toBe(keys.length);
        expect(new Set(shown.map((e) => e.id)).size).toBe(shown.length);
        // time shown equals the engine's total, including the counter's own recipe
        expect(s.durationMin).toBe(r.minutes);
        const run = s.runningRecipe ?? r.runningRecipe;
        if (run && r.roles[0] === "endurance")
          expect(Math.round(recipeTotalSeconds(run) / 60)).toBe(Math.round(r.minutes));
      }
    },
  );

  it("the same inputs give the same prescription, and a saved plan survives storage and another device", () => {
    const a = generateTrainingPlan(base, { startDate: "2026-11-02", weeks: 2 }).plan;
    const b = generateTrainingPlan(base, { startDate: "2026-11-02", weeks: 2 }).plan;
    const stored = JSON.parse(JSON.stringify(a)) as SessionDay[];
    for (const [i, day] of a.entries()) {
      expect(sessionPrescription(b[i])).toBe(sessionPrescription(day));
      expect(sessionPrescription(stored[i])).toBe(sessionPrescription(day));
      if (day.secondSession)
        expect(sessionPrescription(stored[i].secondSession!)).toBe(
          sessionPrescription(day.secondSession),
        );
    }
  });

  it("a changed profile never rewrites a stored prescription (history keeps what was shown)", () => {
    const stored = generateTrainingPlan(base, { startDate: "2026-11-02", weeks: 1 }).plan;
    const before = JSON.stringify(stored);
    generateTrainingPlan({ ...base, goal: "speed" } as Profile, {
      startDate: "2026-11-02",
      weeks: 1,
    });
    expect(JSON.stringify(stored)).toBe(before);
  });
});
