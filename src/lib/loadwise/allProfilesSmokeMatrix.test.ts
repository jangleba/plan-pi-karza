import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import type { Goal, Level, Position, Profile } from "./types";

const positions: Position[] = ["goalkeeper", "defender", "midfielder", "forward"];
const levels: Level[] = ["beginner", "intermediate", "advanced", "elite"];
const goals: Goal[] = [
  "speed",
  "strength",
  "endurance",
  "power",
  "agility",
  "general",
  "mobility",
  "return",
  "matchready",
];

function profile(position: Position, level: Level, goal: Goal, index: number): Profile {
  const minor = index % 2 === 0;
  return {
    name: "Macierz QA",
    age: minor ? 16 : 22,
    healthPersonalizationEnabled: index % 3 !== 0,
    position,
    level,
    goal,
    secondaryLimiter: null,
    clubTrainingDays: index % 2 === 0 ? [2, 4] : [1, 3, 5],
    individualTrainingDays: [1, 2, 3, 4, 5, 6],
    unavailableDays: index % 4 === 0 ? [7] : [],
    usualMatchDay: 7,
    matchDate: "2026-09-20",
    equipment: [],
    painInjury: goal === "return",
    doubleSessionsAllowed: minor ? "light_only" : "yes_if_safe",
    guardianConsent: minor,
    onboardingComplete: true,
    createdAt: "2026-09-01",
    seasonPhase: goal === "return" ? "return_injury" : "preseason",
    seasonStage: "match_week",
    competitionLevel: minor ? "academy" : "iv_liga",
    weeklyMatches: true,
    hasGym: index % 3 !== 1,
    hasPitch: true,
    hasSprintSpace: index % 5 !== 1,
  };
}

describe("LoadWise — wszystkie pozycje, poziomy i cele", () => {
  it("generuje poprawną strukturę tygodnia startowego i piątego", () => {
    console.debug = () => undefined;
    let index = 0;
    for (const position of positions) {
      for (const level of levels) {
        for (const goal of goals) {
          const athlete = profile(position, level, goal, index++);
          for (const weekOffset of [0, 4]) {
            const plan = generatePlan(
              athlete,
              new Date("2026-09-14T00:00:00"),
              7,
              weekOffset,
            );
            expect(plan).toHaveLength(7);
            expect(new Set(plan.map((day) => day.date)).size).toBe(7);
            expect(plan.every((day) => day.title.trim().length > 0)).toBe(true);
            expect(plan.every((day) => day.sessionType.trim().length > 0)).toBe(true);
            expect(plan.every((day) => Number.isFinite(day.durationMin))).toBe(true);
            expect(plan.every((day) => day.durationMin >= 0)).toBe(true);
          }
        }
      }
    }
  }, 30_000);
});
