import { describe, expect, it } from "vitest";
import type { Goal, Profile, SessionDay } from "../types";
import {
  finalizeStrengthRecipe,
  generateTrainingPlan,
  refreshStrengthSession,
  validateTrainingPlan,
} from "./planner";
import { buildStrength } from "./exercises";
import { planTimeBudget, sessionStartIssue } from "./planStatus";
import { gymAthlete } from "./testFixtures";

/** Core integrity: generation, corrections, validation and start share one rule set. */
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const sig = (s: SessionDay) =>
  JSON.stringify([
    s.engineV2?.exercises.map((e) => [e.exerciseId, e.dose]),
    s.engineV2?.strengthFocus?.mode,
    s.durationMin,
  ]);
const strength = (s: SessionDay) =>
  !!s.engineV2?.roles.some((r) => r === "strengthA" || r === "strengthB");

describe("strength is decided on the complete week and with one rule", () => {
  it("every generated strength session equals its re-evaluation on the full calendar", () => {
    const goals: Goal[] = ["strength", "power", "speed", "endurance", "general", "matchready"];
    const failures: string[] = [];
    for (const goal of goals)
      for (const club of [[], [2, 4]])
        for (const matches of [[], ["2026-11-07"], ["2026-11-04", "2026-11-08"]])
          for (const minutes of [30, 45, 60, 90]) {
            const p = {
              ...gymAthlete,
              goal,
              clubTrainingDays: club,
              individualTrainingDays: [1, 2, 3, 4, 5, 6, 7].filter((d) => !club.includes(d)),
              matchDates: matches,
            } as Profile;
            const opts = {
              startDate: "2026-11-02",
              asOfDate: "2026-11-02",
              weeks: 2,
              minutesPerSession: minutes,
            };
            const { plan } = generateTrainingPlan(p, opts);
            expect(validateTrainingPlan(plan, p, opts)).toEqual([]);
            for (const s of plan.flatMap(slots).filter(strength)) {
              expect(s.durationMin).toBeLessThanOrEqual(minutes);
              const again = refreshStrengthSession(s, p, opts, plan);
              if (!again || sig(again) !== sig(s))
                failures.push(`${goal} club${club} m${matches} ${minutes} ${s.date}`);
            }
          }
    expect(failures).toEqual([]);
  }, 120_000);

  it("fits time after the final dose and falls back to the compact variant", () => {
    const p = { ...gymAthlete, goal: "strength" } as Profile;
    const base = buildStrength(p, "A", "development");
    const opts = { startDate: "2026-11-02", asOfDate: "2026-11-02" };
    const roomy = finalizeStrengthRecipe(base, p, "2026-11-02", opts, [], 120)!;
    expect(roomy.variant).not.toBe("compact");
    const tight = finalizeStrengthRecipe(base, p, "2026-11-02", opts, [], 35)!;
    expect(tight).not.toBeNull();
    expect(tight.variant).toBe("compact");
    expect(tight.minutes).toBeLessThanOrEqual(35);
    // The primary lift keeps its final dose; only optional work is cut.
    expect(tight.exercises.some((e) => e.role === "knee_strength")).toBe(true);
    expect(finalizeStrengthRecipe(base, p, "2026-11-02", opts, [], 10)).toBeNull();
  });
});

describe("the saved time budget is used at start", () => {
  it("start validates against the plan's own budget, not a fixed 75 minutes", () => {
    const p = { ...gymAthlete, goal: "strength", individualTrainingDays: [1, 3, 5] } as Profile;
    const { plan } = generateTrainingPlan(p, {
      startDate: "2026-11-02",
      weeks: 1,
      minutesPerSession: 90,
    });
    expect(planTimeBudget(plan)).toBe(90);
    const longest = plan
      .flatMap(slots)
      .filter((s) => s.engineV2)
      .sort((a, b) => b.durationMin - a.durationMin)[0];
    const at = { session: longest, profile: p, todayIso: longest.date };
    expect(sessionStartIssue({ ...at, minutesPerSession: planTimeBudget(plan) })).toBeNull();
    // The parameter is honoured: a budget below the recipe blocks the start with a time issue.
    expect(sessionStartIssue({ ...at, minutesPerSession: longest.durationMin - 1 })).toMatch(
      /czas/i,
    );
  });
  it("falls back only when the plan records no budget", () => {
    expect(planTimeBudget([])).toBe(75);
    expect(planTimeBudget([{ planInputs: { minutesPerSession: 45 } } as SessionDay])).toBe(45);
  });
});
