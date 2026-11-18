import { describe, expect, it } from "vitest";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { buildRunnerSteps } from "@/lib/loadwise/sessionRunner/steps";
import type { Profile, SessionDay } from "@/lib/loadwise/types";
import { linkedSummary } from "./SessionPlanList";

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
  trainingMethodPreferences: { gymTemplate: "paired_power" },
} as unknown as Profile;

describe("superset header in the session list", () => {
  it("names the letter, rounds and both rests the runner will time", () => {
    const plan = generateTrainingPlan(athlete, {
      startDate: "2026-11-02",
      weeks: 1,
      minutesPerSession: 75,
    }).plan;
    const session = plan
      .flatMap((d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])])
      .find((d) => d.engineV2?.organization === "complex")!;
    const linked = buildRunnerSteps(session.structuredSections!).filter((s) => s.kind === "linked");
    expect(linked.length).toBeGreaterThan(1);
    const first = linkedSummary(linked[0]);
    const pair = session.engineV2!.complexPairs![0];
    expect(first.letter).toBe(pair.no ?? pair.label);
    expect(first.rounds).toMatch(/^\d+ rund(y|a)?$/);
    expect(first.rest).toContain("30 s między");
    expect(first.rest).toContain("po rundzie");
    expect(new Set(linked.map((s) => linkedSummary(s).letter)).size).toBe(linked.length);
  });
});
