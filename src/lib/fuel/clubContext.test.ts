import { describe, expect, it } from "vitest";
import { planFuelContexts } from "./experience";
import { generateTrainingPlan } from "../loadwise/engineV2/planner";
import { proposeFeedbackAdjustment } from "../loadwise/engineV2/feedbackAdjustment";
import type { Profile, SessionCompletion, SessionDay } from "../loadwise/types";

const profile = {
  name: "Fuel athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [1],
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
function plan() {
  const days = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 2 }).plan;
  for (const d of days) {
    d.dayDbId = `day-${d.date}`;
    d.planDbId = "p";
    slots(d).forEach((s, i) => {
      if (s.dayType !== "rest") s.dbId = `s-${s.date}-${i}`;
    });
  }
  return days;
}

describe("Fuel context for club and corrected plans", () => {
  it("a future club session is planned as an estimated 90 minutes and is not a completed activity", () => {
    const contexts = planFuelContexts(plan(), "2026-11-09", {});
    const club = contexts.find((c) => c.title.toLowerCase().includes("klub"))!;
    expect(club).toMatchObject({ durationMin: 90, durationEstimated: true, completed: false });
  });
  it("a planned match gets no invented minutes", () => {
    const p = { ...profile, matchDates: ["2026-11-07"], clubTrainingDays: [] } as Profile;
    const days = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 }).plan;
    expect(planFuelContexts(days, "2026-11-07", {}).some((c) => c.kind === "match")).toBe(false);
  });
  it("after an accepted correction the day context follows the new plan (skipped run disappears)", () => {
    const p = plan();
    const completions: Record<string, SessionCompletion> = {
      "s-2026-11-02-0": {
        completed: true,
        status: "completed",
        rpe: 6,
        notes: "",
        durationMin: 90,
        durationSource: "club_default",
        activityTags: ["running_endurance"],
        feedbackVersion: 1,
        endedAt: "2026-11-02T19:00:00Z",
      },
    };
    const proposal = proposeFeedbackAdjustment({
      profile,
      plan: p,
      completions,
      todayIso: "2026-11-03",
      planId: "p",
    })!;
    const credit = proposal.changes.find((c) => c.kind === "external_credit")!;
    const before = planFuelContexts(p, credit.before.date, completions);
    expect(before.some((c) => c.kind === "endurance")).toBe(true);
    const after = planFuelContexts(proposal.candidatePlan, credit.before.date, completions);
    expect(after.some((c) => c.kind === "endurance" && c.title === credit.title)).toBe(false);
    // the completed club session itself stays in the day's history as completed
    expect(planFuelContexts(p, "2026-11-02", completions)[0]).toMatchObject({ completed: true });
  });
});
