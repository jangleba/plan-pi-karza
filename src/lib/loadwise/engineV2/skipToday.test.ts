import { describe, expect, it } from "vitest";
import { sessionStartIssue, todayTrainingState } from "./planStatus";
import { generateTrainingPlan } from "./planner";
import { buildPlanSummary } from "../planSummary";
import type { Profile, SessionCompletion, SessionDay } from "../types";

const profile = {
  name: "Skip athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [2, 3, 4, 5, 6, 7],
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
} as unknown as Profile;
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const plan = () => {
  const days = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 2 }).plan;
  for (const d of days)
    slots(d).forEach((s, i) => {
      if (s.dayType !== "rest") s.dbId = `s-${s.date}-${i}`;
    });
  return days;
};
const missed: SessionCompletion = { completed: false, status: "missed", rpe: null, notes: "" };

describe("'Dziś nie mogę'", () => {
  it("a skipped slot is handled: today moves on to the next slot and nothing is carried over", () => {
    const p = plan();
    const day = p.find((d) => d.date === "2026-11-03")!;
    expect(slots(day).length).toBe(2);
    const first = slots(day)[0];
    const completions = { [first.dbId!]: missed };
    const state = todayTrainingState(p, completions, "2026-11-03");
    expect(state.session?.dbId).toBe(slots(day)[1].dbId);
    expect(state.slot).toBe(2);
    // both skipped: the day is done, and no other date got a session
    const all = { ...completions, [slots(day)[1].dbId!]: missed };
    expect(todayTrainingState(p, all, "2026-11-03")).toMatchObject({
      session: null,
      complete: true,
    });
    const dates = (x: SessionDay[]) =>
      x.filter((d) => slots(d).some((s) => s.engineV2)).map((d) => d.date);
    expect(dates(p)).toEqual(dates(plan()));
  });

  it("a skipped session cannot be started by accident", () => {
    const p = plan();
    const s = slots(p.find((d) => d.date === "2026-11-03")!)[0];
    expect(
      sessionStartIssue({ session: s, profile, todayIso: "2026-11-03", completion: missed }),
    ).toContain("opuszczona");
  });

  it("the summary counts a skipped session as skipped execution straight away, not as 'not planned'", () => {
    const p = plan();
    const s = slots(p.find((d) => d.date === "2026-11-03")!)[0];
    const summary = buildPlanSummary({
      profile,
      plan: p,
      completions: { [s.dbId!]: missed },
      history: [],
      readiness: {},
      todayIso: "2026-11-03",
    })!;
    expect(summary.own.missed).toBe(1);
    expect(summary.targets.reduce((n, t) => n + t.notPlanned, 0)).toBe(0);
  });
});
