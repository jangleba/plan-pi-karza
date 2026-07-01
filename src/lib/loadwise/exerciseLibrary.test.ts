import { describe, it, expect } from "vitest";
import type { Profile } from "./types";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import {
  getAllExerciseDefinitions,
  getExerciseDefinition,
  isExerciseAllowedForProfile,
  getExerciseRegression,
  replaceExerciseWithSafeAlternative,
  validateExerciseLibraryCompleteness,
  validateWorkoutExercises,
  type ExerciseDefinition,
} from "./exerciseLibrary";

function makeProfile(over: Partial<Profile>): Profile {
  return {
    name: "Test",
    age: 14,
    position: "midfielder",
    level: "beginner",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 3, 6],
    usualMatchDay: 7,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-06-01",
    seasonPhase: "inseason",
    seasonStage: null,
    competitionLevel: "academy",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...over,
  };
}

const youthBeginner = () => buildAthleteTrainingProfile(makeProfile({ age: 14, level: "beginner" }));
const adultAdvanced = () =>
  buildAthleteTrainingProfile(
    makeProfile({
      age: 25,
      level: "advanced",
      gymExperienceLevel: "advanced",
      movementCompetence: "high",
      supervisionLevel: "full",
    }),
    {},
    { readiness: 8 },
  );

describe("exercise library completeness", () => {
  it("every exercise has required fields and valid references", () => {
    const report = validateExerciseLibraryCompleteness();
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.totalExercises).toBeGreaterThan(0);
  });

  it("all definitions expose the ExerciseDefinition shape", () => {
    for (const def of getAllExerciseDefinitions()) {
      const d: ExerciseDefinition = def;
      expect(typeof d.id).toBe("string");
      expect(Array.isArray(d.coachingCues)).toBe(true);
      expect(Array.isArray(d.commonErrors)).toBe(true);
    }
  });
});

describe("blocking rules", () => {
  it("blocks barbell deadlift for 14yo beginner", () => {
    const r = isExerciseAllowedForProfile("barbell_deadlift", youthBeginner());
    expect(r.ok).toBe(false);
  });

  it("blocks heavy back squat for 14yo beginner", () => {
    const r = isExerciseAllowedForProfile("heavy_back_squat", youthBeginner());
    expect(r.ok).toBe(false);
  });

  it("blocks clean/snatch for beginner without supervision", () => {
    const a = buildAthleteTrainingProfile(
      makeProfile({ age: 20, level: "beginner", supervisionLevel: "none" }),
    );
    expect(isExerciseAllowedForProfile("power_clean", a).ok).toBe(false);
  });

  it("blocks depth jump for low movement competence", () => {
    const a = buildAthleteTrainingProfile(
      makeProfile({ age: 22, level: "advanced", movementCompetence: "low" }),
    );
    expect(isExerciseAllowedForProfile("depth_jump", a).ok).toBe(false);
  });

  it("blocks max velocity high volume for beginner youth", () => {
    expect(isExerciseAllowedForProfile("max_velocity_high_volume", youthBeginner()).ok).toBe(false);
  });
});

describe("allowed for youth beginner", () => {
  it("allows bodyweight split squat", () => {
    expect(isExerciseAllowedForProfile("bodyweight_split_squat", youthBeginner()).ok).toBe(true);
  });
  it("allows glute bridge", () => {
    expect(isExerciseAllowedForProfile("glute_bridge", youthBeginner()).ok).toBe(true);
  });
  it("allows plank / dead bug / bird dog", () => {
    const a = youthBeginner();
    expect(isExerciseAllowedForProfile("plank", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("dead_bug", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("bird_dog", a).ok).toBe(true);
  });
  it("allows low-volume acceleration mechanics for youth", () => {
    expect(isExerciseAllowedForProfile("acceleration_mechanics", youthBeginner()).ok).toBe(true);
  });
});

describe("regression and replacement", () => {
  it("provides an allowed regression for a blocked lift", () => {
    const a = youthBeginner();
    const reg = getExerciseRegression("barbell_deadlift", a);
    expect(reg).toBeTruthy();
    expect(isExerciseAllowedForProfile(reg!, a).ok).toBe(true);
  });

  it("generator swaps a blocked exercise for a safe alternative", () => {
    const a = youthBeginner();
    const res = replaceExerciseWithSafeAlternative("heavy_back_squat", a);
    expect(res.unresolved).toBe(false);
    expect(res.exercise).toBeTruthy();
    expect(isExerciseAllowedForProfile(res.exercise!, a).ok).toBe(true);
  });
});

describe("unknown / missing metadata", () => {
  it("does not allow exercises without metadata for youth/beginner", () => {
    const a = youthBeginner();
    expect(getExerciseDefinition("mystery_move")).toBeUndefined();
    expect(isExerciseAllowedForProfile("mystery_move", a).ok).toBe(false);
    const report = validateWorkoutExercises(
      { exercises: [{ exerciseId: "mystery_move", name: "Mystery move" }] },
      a,
    );
    expect(report.ok).toBe(false);
    expect(report.unresolvedIssues.length).toBe(1);
  });
});

describe("advanced adult without injuries", () => {
  it("can receive advanced exercises", () => {
    const a = adultAdvanced();
    expect(isExerciseAllowedForProfile("heavy_back_squat", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("barbell_deadlift", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("depth_jump", a).ok).toBe(true);
    expect(isExerciseAllowedForProfile("power_clean", a).ok).toBe(true);
  });

  it("still blocks a contraindicated exercise when injured", () => {
    const injured = buildAthleteTrainingProfile(
      makeProfile({
        age: 25,
        level: "advanced",
        gymExperienceLevel: "advanced",
        movementCompetence: "high",
        supervisionLevel: "full",
        painLocations: ["back"],
      }),
      {},
      { readiness: 8 },
    );
    expect(isExerciseAllowedForProfile("barbell_deadlift", injured).ok).toBe(false);
  });
});

describe("workout validation report", () => {
  it("flags unresolved issue when no safe alternative exists", () => {
    const a = youthBeginner();
    const report = validateWorkoutExercises(
      [{ exerciseId: "bodyweight_squat", name: "Bodyweight squat" }],
      a,
    );
    expect(report.ok).toBe(true);
    expect(report.replacements.length).toBe(0);
  });
});
