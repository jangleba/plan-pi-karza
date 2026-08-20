import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import { validatePlanExerciseContract } from "./planExerciseContract";
import { getExerciseDefinition, isApprovedCanonicalExercise } from "./exerciseLibrary";
import { isEnduranceSession } from "./sessionClassification";
import type { Goal, Profile } from "./types";

const START = new Date("2026-07-13T00:00:00");

function makeProfile(goal: Goal): Profile {
  return {
    name: "Runtime contract test",
    age: 20,
    position: "midfielder",
    level: "intermediate",
    goal,
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 3, 5, 6],
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
  };
}

describe("Plan Exercise Contract — rzeczywisty generatePlan", () => {
  const goals: Goal[] = [
    "general",
    "speed",
    "strength",
    "endurance",
    "power",
    "agility",
  ];

  for (const goal of goals) {
    it(`plan dla celu "${goal}" nie zawiera pustych sesji ani placeholderów`, () => {
      const plan = generatePlan(makeProfile(goal), START, 28);

      expect(validatePlanExerciseContract(plan)).toEqual([]);
    });
  }

  it("wykrywa legacy fallback Sesja kontrolna", () => {
    const plan = generatePlan(makeProfile("general"), START, 7);
    const trainingDay = plan.find((day) => day.dayType === "training");

    expect(trainingDay).toBeDefined();

    trainingDay!.sections = {
      warmup: [],
      main: [
        {
          name: "Sesja kontrolna",
          prescription: "30 min zgodnie z opisem dnia",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    };

    const issues = validatePlanExerciseContract(plan);

    expect(
      issues.some((issue) => issue.code === "placeholder-exercise"),
    ).toBe(true);
  });

  it("requires every generated exercise to use an approved canonical ID", () => {
    const plan = generatePlan(makeProfile("strength"), START, 14);
    const exercises = plan.flatMap((day) => [
      ...day.sections.warmup,
      ...day.sections.main,
      ...day.sections.accessory,
      ...day.sections.footballTransfer,
      ...day.sections.cooldown,
    ]);

    expect(exercises.length).toBeGreaterThan(0);
    expect(
      exercises.every((exercise) =>
        isApprovedCanonicalExercise(getExerciseDefinition(exercise.exerciseId ?? "")),
      ),
    ).toBe(true);
  });

  it("canonicalizes generated endurance exercises deterministically", () => {
    const profile = makeProfile("endurance");
    profile.clubTrainingDays = [];
    const first = generatePlan(profile, START, 28);
    const second = generatePlan(profile, START, 28);
    const enduranceExercises = first
      .filter((day) => isEnduranceSession(day))
      .flatMap((day) => day.sections.main);

    expect(enduranceExercises.length).toBeGreaterThan(0);
    expect(
      enduranceExercises.every((exercise) =>
        isApprovedCanonicalExercise(getExerciseDefinition(exercise.exerciseId ?? "")),
      ),
    ).toBe(true);
    expect(first).toEqual(second);
  });

  it("rejects free-form structured exercises as well as flat exercises", () => {
    const plan = generatePlan(makeProfile("general"), START, 7);
    const trainingDay = plan.find((day) => day.dayType === "training")!;
    trainingDay.sections = {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    };
    trainingDay.structuredSections = [
      {
        id: "free-form",
        title: "Main",
        type: "main",
        blocks: [
          {
            id: "free-form-block",
            title: "Main",
            blockType: "single",
            intent: "strength",
            exercises: [{ id: "free-form", name: "Dowolny ruch" }],
          },
        ],
      },
    ];

    expect(validatePlanExerciseContract(plan).some((issue) => issue.code === "invalid-exercise-id")).toBe(
      true,
    );
  });
});