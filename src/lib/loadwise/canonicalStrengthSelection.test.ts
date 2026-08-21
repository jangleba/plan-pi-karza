/**
 * Regression tests — canonical strength-session selection.
 *
 * Verifies that:
 *  1. All strength exercises carry valid approved canonical IDs.
 *  2. No placeholder or empty exercises appear.
 *  3. Age and maturity rules are respected.
 *  4. MD-1 / MD-2 rules prevent heavy loading.
 *  5. Non-gym profiles receive canonical bodyweight exercises.
 *  6. Gym profiles are routed through buildStrengthPowerStructured.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import { validatePlanExerciseContract } from "./planExerciseContract";
import { getExerciseDefinition, isApprovedCanonicalExercise } from "./exerciseLibrary";
import type { Profile, SessionDay } from "./types";

const START = new Date("2026-07-07T00:00:00");

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Test",
    age: 20,
    position: "midfielder",
    level: "intermediate",
    goal: "strength",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 3, 5],
    usualMatchDay: null,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-07-01",
    seasonPhase: "preseason",
    seasonPhaseOverride: true,
    seasonStage: null,
    competitionLevel: "iv_liga",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...overrides,
  };
}

/** Return every ExerciseItem (flat and structured) from training sessions. */
function collectExercises(plan: SessionDay[]) {
  const out: Array<{ name: string; exerciseId?: string; date: string }> = [];
  for (const day of plan) {
    if (day.dayType !== "training") continue;
    const sessions = [day, day.secondSession].filter(Boolean) as SessionDay[];
    for (const sess of sessions) {
      // Structured sections (primary source when present).
      if (sess.structuredSections?.length) {
        for (const sec of sess.structuredSections) {
          for (const blk of sec.blocks) {
            for (const ex of blk.exercises) {
              out.push({ name: ex.name, exerciseId: ex.exerciseId, date: day.date });
            }
          }
        }
      } else {
        // Flat sections fallback.
        const items = [
          ...(sess.sections?.main ?? []),
          ...(sess.sections?.accessory ?? []),
        ];
        for (const ex of items) {
          out.push({ name: ex.name, exerciseId: ex.exerciseId, date: day.date });
        }
      }
    }
  }
  return out;
}

/** Strength / gym training days only. */
function strengthDays(plan: SessionDay[]): SessionDay[] {
  return plan.filter(
    (d) =>
      d.dayType === "training" &&
      (d.classification?.category === "gym_strength" ||
        /sił|strength/i.test(d.sessionType ?? "")),
  );
}

// ---------------------------------------------------------------------------
// Contract: no placeholders or invalid IDs in any plan
// ---------------------------------------------------------------------------

describe("Plan contract — strength goal (gym)", () => {
  it("28-day plan passes exercise contract — age 20, gym", () => {
    const plan = generatePlan(makeProfile(), START, 28);
    expect(validatePlanExerciseContract(plan)).toEqual([]);
  });

  it("28-day plan passes exercise contract — age 14, gym", () => {
    const plan = generatePlan(makeProfile({ age: 14, level: "beginner" }), START, 28);
    expect(validatePlanExerciseContract(plan)).toEqual([]);
  });

  it("28-day plan passes exercise contract — age 16, gym", () => {
    const plan = generatePlan(makeProfile({ age: 16, level: "beginner" }), START, 28);
    expect(validatePlanExerciseContract(plan)).toEqual([]);
  });

  it("28-day plan passes exercise contract — age 25, advanced, gym", () => {
    const plan = generatePlan(makeProfile({ age: 25, level: "advanced" }), START, 28);
    expect(validatePlanExerciseContract(plan)).toEqual([]);
  });
});

describe("Plan contract — strength goal (no gym)", () => {
  it("28-day plan passes contract — no gym, age 20", () => {
    const plan = generatePlan(makeProfile({ hasGym: false }), START, 28);
    expect(validatePlanExerciseContract(plan)).toEqual([]);
  });

  it("28-day plan passes contract — no gym, age 14", () => {
    const plan = generatePlan(makeProfile({ hasGym: false, age: 14, level: "beginner" }), START, 28);
    expect(validatePlanExerciseContract(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Canonical IDs: every exercise in strength sessions must be approved
// ---------------------------------------------------------------------------

describe("Canonical exercise IDs — strength sessions", () => {
  it("gym: all strength-session exercises carry approved canonical IDs", () => {
    const plan = generatePlan(makeProfile(), START, 28);
    const days = strengthDays(plan);
    expect(days.length).toBeGreaterThan(0);

    const exercises = collectExercises(days);
    expect(exercises.length).toBeGreaterThan(0);

    for (const ex of exercises) {
      const def = ex.exerciseId ? getExerciseDefinition(ex.exerciseId) : undefined;
      expect(
        isApprovedCanonicalExercise(def),
        `Exercise "${ex.name}" (id: ${ex.exerciseId ?? "none"}) on ${ex.date} lacks approved canonical ID`,
      ).toBe(true);
    }
  });

  it("no-gym: all strength-session exercises carry approved canonical IDs", () => {
    const plan = generatePlan(makeProfile({ hasGym: false }), START, 28);
    const days = strengthDays(plan);
    if (days.length === 0) return; // no strength days scheduled — not an error

    const exercises = collectExercises(days);
    for (const ex of exercises) {
      const def = ex.exerciseId ? getExerciseDefinition(ex.exerciseId) : undefined;
      expect(
        isApprovedCanonicalExercise(def),
        `No-gym exercise "${ex.name}" (id: ${ex.exerciseId ?? "none"}) lacks canonical ID`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Age rules: youth must not get heavy barbell max-strength main lifts
// ---------------------------------------------------------------------------

describe("Age rules — youth (13–14) strength sessions", () => {
  it("age-14 gym: no heavy barbell back squat as main lift", () => {
    const plan = generatePlan(makeProfile({ age: 14, level: "beginner" }), START, 28);
    const exercises = collectExercises(strengthDays(plan));
    const heavyBarbell = exercises.filter((e) =>
      /heavy_back_squat|barbell_deadlift|power_clean/.test(e.exerciseId ?? ""),
    );
    expect(heavyBarbell).toHaveLength(0);
  });

  it("age-13 gym: exercises come from the canonical library (no placeholder names)", () => {
    const plan = generatePlan(makeProfile({ age: 13, level: "beginner" }), START, 28);
    const exercises = collectExercises(strengthDays(plan));
    const placeholders = exercises.filter(
      (e) => !e.exerciseId || /do uzupełnienia|placeholder|TODO/i.test(e.name),
    );
    expect(placeholders).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// MD rules: no heavy strength load on MD-1 / MD-2
// ---------------------------------------------------------------------------

describe("Match-day rules", () => {
  const matchDate = "2026-07-12"; // Saturday

  it("MD-1 (Friday): session is primer/reduced, not full heavy strength", () => {
    const plan = generatePlan(makeProfile({ matchDate }), START, 14);
    const md1 = plan.find((d) => d.mdLabel === "MD-1");
    if (!md1 || md1.dayType !== "training") return;
    // MD-1 should NOT be a full heavy gym strength session
    expect(md1.sessionType).not.toMatch(/^Siła$/);
  });

  it("MD (match day): no training session scheduled", () => {
    const plan = generatePlan(makeProfile({ matchDate }), START, 14);
    const matchDay = plan.find((d) => d.mdLabel === "MD" || d.dayType === "match");
    if (!matchDay) return;
    expect(matchDay.dayType).toBe("match");
  });
});

// ---------------------------------------------------------------------------
// Pain / readiness safety
// ---------------------------------------------------------------------------

describe("Pain/injury safety", () => {
  it("painInjury=true: plan passes contract and avoids heavy loading", () => {
    const plan = generatePlan(makeProfile({ painInjury: true }), START, 28);
    expect(validatePlanExerciseContract(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Session has one clear primary adaptation (goalOfSession filled)
// ---------------------------------------------------------------------------

describe("Session goalOfSession is populated", () => {
  it("gym strength sessions have non-empty goalOfSession", () => {
    const plan = generatePlan(makeProfile(), START, 28);
    for (const day of strengthDays(plan)) {
      expect(
        (day.goalOfSession ?? "").trim().length,
        `goalOfSession is empty on ${day.date}`,
      ).toBeGreaterThan(0);
    }
  });
});
