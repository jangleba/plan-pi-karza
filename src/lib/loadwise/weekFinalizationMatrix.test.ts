import { describe, expect, it } from "vitest";
import { generatePlan, weekRanges } from "./planEngine";
import { classifySession, isBallTechnicalSession } from "./sessionClassification";
import { assertFinalPlanMeetsMinimums, requirementsFor } from "./weekFinalization";
import type { Profile, SessionDay } from "./types";

const START = new Date("2026-09-14T00:00:00");

function profile(overrides: Partial<Profile>): Profile {
  return {
    name: "Regresja finalizatora",
    age: 20,
    position: "midfielder",
    level: "intermediate",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6],
    unavailableDays: [],
    usualMatchDay: null,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-09-01",
    seasonPhase: "preseason",
    seasonStage: null,
    competitionLevel: "iv_liga",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...overrides,
  };
}

function sessions(day: SessionDay): SessionDay[] {
  return day.secondSession ? [day, day.secondSession] : [day];
}

describe("finalizator — reprezentatywna macierz gęstych tygodni", () => {
  const cases: Array<{ name: string; profile: Profile }> = [
    {
      name: "14 lat beginner, cel szybkość, 4 dni klubu",
      profile: profile({ age: 14, level: "beginner", goal: "speed", clubTrainingDays: [1, 2, 4, 5] }),
    },
    {
      name: "14 lat beginner, cel szybkość, 4 dni klubu i mecz",
      profile: profile({
        age: 14,
        level: "beginner",
        goal: "speed",
        clubTrainingDays: [1, 2, 4, 5],
        matchDate: "2026-09-20",
        weeklyMatches: true,
      }),
    },
    {
      name: "dorosły intermediate, cel szybkość, 4 dni klubu i mecz",
      profile: profile({
        age: 22,
        level: "intermediate",
        goal: "speed",
        clubTrainingDays: [1, 2, 4, 5],
        matchDate: "2026-09-20",
        weeklyMatches: true,
      }),
    },
    {
      name: "14 lat intermediate, cel wydolność, 4 dni klubu",
      profile: profile({ age: 14, level: "intermediate", goal: "endurance", clubTrainingDays: [1, 2, 4, 5] }),
    },
    {
      name: "16 lat beginner, cel moc, 4 dni klubu",
      profile: profile({ age: 16, level: "beginner", goal: "power", clubTrainingDays: [1, 2, 4, 5] }),
    },
    {
      name: "dorosły elite, cel ogólny, 3 dni klubu",
      profile: profile({ age: 22, level: "elite", goal: "general", clubTrainingDays: [1, 3, 5] }),
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.name}: każdy pełny tydzień spełnia minima i reguły`, () => {
      console.debug = () => undefined;
      const plan = generatePlan(testCase.profile, START, 28);
      const ranges = weekRanges(START, plan.length).filter((range) => range.end - range.start === 7);

      for (const range of ranges) {
        const week = plan.slice(range.start, range.end);
        const report = assertFinalPlanMeetsMinimums(
          week,
          requirementsFor(week, testCase.profile),
          testCase.profile,
        );
        expect(report.unresolvedIssues).toEqual([]);
        expect(report.finalStatus).toBe("valid");

        for (const session of week.flatMap(sessions)) {
          expect(session.classification?.category).toBe(classifySession(session).category);
        }
      }
    });
  }

  it("własna piłka zachowuje nazwy techniczne i nie zmienia się w przysiad", () => {
    console.debug = () => undefined;
    const plan = generatePlan(
      profile({ age: 14, level: "beginner", goal: "speed", clubTrainingDays: [1, 2, 4, 5] }),
      START,
      28,
    );
    const ballExercises = plan
      .flatMap(sessions)
      .filter(isBallTechnicalSession)
      .flatMap((session) => Object.values(session.sections).flat());

    expect(ballExercises.length).toBeGreaterThan(0);
    expect(ballExercises.every((exercise) => Boolean(exercise.exerciseId))).toBe(true);
    expect(ballExercises.some((exercise) => exercise.exerciseId === "football_technical_self_selected")).toBe(true);
    expect(ballExercises.some((exercise) => /piłk|technicz|reakcji/i.test(exercise.name))).toBe(true);
    const wrong = plan
      .flatMap(sessions)
      .filter(isBallTechnicalSession)
      .flatMap((session) => Object.values(session.sections).flat().filter((exercise) => /przysiad/i.test(exercise.name)).map((exercise) => ({ session: session.title, name: exercise.name, id: exercise.exerciseId, prescription: exercise.prescription })));
    expect(wrong).toEqual([]);
  });

  it("tydzień 5: gęsty kalendarz szybkości przechodzi pełną finalizację", () => {
    console.debug = () => undefined;
    const fifthWeekProfile = profile({
      age: 14,
      level: "beginner",
      goal: "speed",
      clubTrainingDays: [1, 2, 4, 5],
      matchDate: "2026-09-20",
      weeklyMatches: true,
    });
    const week = generatePlan(fifthWeekProfile, START, 7, 4);
    const report = assertFinalPlanMeetsMinimums(
      week,
      requirementsFor(week, fifthWeekProfile),
      fifthWeekProfile,
    );

    expect(week).toHaveLength(7);
    expect(report.unresolvedIssues).toEqual([]);
    expect(report.finalStatus).toBe("valid");
  });
});
