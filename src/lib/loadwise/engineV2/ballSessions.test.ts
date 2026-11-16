import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";

const athlete = (o: Record<string, unknown> = {}): Profile =>
  ({
    name: "ball",
    age: 17,
    position: "midfielder",
    level: "intermediate",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: null,
    matchDate: null,
    matchDates: [],
    weeklyMatches: false,
    equipment: ["barbell", "rack", "dumbbell", "bench", "band", "football", "rebounder"],
    painInjury: false,
    doubleSessionsAllowed: "light_only",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-11-01",
    seasonPhase: "offseason",
    seasonStage: null,
    competitionLevel: "iv_liga",
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    gymExperienceLevel: "intermediate",
    strengthTrainingMonths: 12,
    movementCompetence: "medium",
    supervisionLevel: "some",
    ...o,
  }) as unknown as Profile;
const START = "2026-11-16";
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const skillsOf = (plan: SessionDay[]) =>
  plan.flatMap((d) =>
    slots(d)
      .filter((s) => s.engineV2?.roles.includes("skills"))
      .map((s) => ({ day: d, s })),
  );

describe("individual ball sessions in the week", () => {
  it("a free week gives the ball session a day of its own, changing tasks week to week", () => {
    const p = athlete();
    const r = generateTrainingPlan(p, { startDate: START, weeks: 2, minutesPerSession: 60 });
    const ball = skillsOf(r.plan);
    expect(ball).toHaveLength(2);
    for (const { day, s } of ball) {
      expect(day.secondSession ?? null).toBeNull();
      expect(day.dayType).not.toBe("club");
      expect(s.engineV2!.exercises.length).toBeGreaterThanOrEqual(5);
      expect(s.durationMin).toBeLessThanOrEqual(60);
    }
    expect(ball[0].s.engineV2!.exercises.map((e) => e.exerciseId)).not.toEqual(
      ball[1].s.engineV2!.exercises.map((e) => e.exerciseId),
    );
    expect(validateTrainingPlan(r.plan, p, { startDate: START, minutesPerSession: 60 })).toEqual(
      [],
    );
  });

  it("next to club training it is the lighter version without fast or forceful drills", () => {
    const p = athlete({
      clubTrainingDays: [2, 3, 4],
      matchDate: "2026-11-21",
      matchDates: ["2026-11-21"],
      weeklyMatches: true,
      usualMatchDay: 6,
      seasonPhase: "in_season",
    });
    const r = generateTrainingPlan(p, { startDate: START, weeks: 1, minutesPerSession: 60 });
    const ball = skillsOf(r.plan);
    expect(ball).toHaveLength(1);
    expect(ball[0].day.dayType).toBe("club");
    const ids = ball[0].s.engineV2!.exercises.map((e) => e.exerciseId);
    for (const intense of [
      "football_speed_dribble",
      "football_slalom_time",
      "football_finishing_corners",
    ])
      expect(ids).not.toContain(intense);
    expect(r.issues.some((i) => i.code === "UNMET_GOAL_SUPPORT")).toBe(false);
    expect(validateTrainingPlan(r.plan, p, { startDate: START, minutesPerSession: 60 })).toEqual(
      [],
    );
  });
});
