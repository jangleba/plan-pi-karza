import { describe, expect, it } from "vitest";
import { generateTrainingPlan } from "./planner";
import { mainGoalTasks } from "./goalPolicy";
import type { Profile, SessionDay } from "../types";

const base = {
  name: "Tight week",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [2, 3],
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
  doubleSessionsAllowed: "no",
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
const covered = (p: Profile) => {
  const result = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 });
  const roles = new Set(
    result.plan.flatMap(slots).flatMap((s) => (s.engineV2 ? s.engineV2.roles : [])),
  );
  return { roles, issues: result.issues };
};

describe("main goal in a week too tight for everything", () => {
  it("maps each goal to explicit weekly targets", () => {
    expect(mainGoalTasks({ ...base, goal: "speed" })).toEqual(["speed"]);
    expect(mainGoalTasks({ ...base, goal: "agility" })).toEqual(["speed"]);
    expect(mainGoalTasks({ ...base, goal: "endurance" })).toEqual(["endurance"]);
    expect(mainGoalTasks({ ...base, goal: "strength" })).toEqual(["strengthA", "strengthB"]);
    expect(mainGoalTasks({ ...base, goal: "power" })).toEqual(["strengthA", "strengthB"]);
    // other goals follow the highest-weighted targets of the existing table
    expect(mainGoalTasks({ ...base, goal: "general" })).toEqual(["strengthA", "strengthB"]);
  });

  it("one free day goes to the main goal and the miss stays visible", () => {
    for (const [goal, role] of [
      ["speed", "speed"],
      ["agility", "speed"],
      ["endurance", "endurance"],
    ] as const) {
      const { roles, issues } = covered({ ...base, goal, individualTrainingDays: [3] });
      expect(roles.has(role)).toBe(true);
      expect(issues.some((i) => i.code === "UNMET_WEEKLY_TARGET")).toBe(true);
    }
  });

  it("strength and power keep both strength days when two separated days exist", () => {
    for (const goal of ["strength", "power"] as const) {
      const { roles } = covered({ ...base, goal, individualTrainingDays: [2, 5] });
      expect(roles.has("strengthA") && roles.has("strengthB")).toBe(true);
    }
  });

  it("an unmet target carries its target id so the summary can tell it from a skipped session", () => {
    const { issues } = covered({ ...base, goal: "speed", individualTrainingDays: [3] });
    const unmet = issues.filter((i) => i.code === "UNMET_WEEKLY_TARGET");
    expect(unmet.length).toBeGreaterThan(0);
    for (const issue of unmet)
      expect(["strengthA", "strengthB", "speed", "endurance"]).toContain(issue.target);
  });
});
