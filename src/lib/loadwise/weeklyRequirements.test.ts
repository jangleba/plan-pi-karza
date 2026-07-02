import { describe, it, expect } from "vitest";
import {
  calculateWeeklyMinimumRequirements,
  getAthleteGoalRules,
  getSeasonPhaseRules,
  getClubTrainingCount,
  getMatchCount,
  getRequiredGymSessions,
  getRequiredEnduranceSessions,
  getRequiredSpeedSessions,
  shouldAddExtraEnduranceSessions,
  shouldAddSecondSpeedSession,
  type WeekRequirementContext,
  type UserRequirementSettings,
  type AthleteRequirementProfile,
} from "./weeklyRequirements";

function ctx(overrides: Partial<WeekRequirementContext> = {}): WeekRequirementContext {
  return {
    seasonPhase: "preseason",
    clubTrainingCount: 2,
    matchCount: 0,
    isFullWeek: true,
    ...overrides,
  };
}

const settings: UserRequirementSettings = { hasGym: true };

describe("weeklyRequirements — cel normalny", () => {
  it("zwykły tydzień zwraca 2 gym, 1 endurance, 1 speed", () => {
    const r = calculateWeeklyMinimumRequirements(ctx(), settings, "general");
    expect(r.requiredGymSessions).toBe(2);
    expect(r.requiredEnduranceSessions).toBe(1);
    expect(r.requiredSpeedSessions).toBe(1);
  });

  it("brak celu wydolnościowego i 4 klubowe zwraca requiredEnduranceSessions = 1", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 4 }),
      settings,
      "strength",
    );
    expect(r.requiredEnduranceSessions).toBe(1);
    expect(r.requiredGymSessions).toBe(2);
  });
});

describe("weeklyRequirements — cel szybkościowy", () => {
  it('cel "szybkość" zwraca 2 gym, 1 endurance, 2 speed', () => {
    const r = calculateWeeklyMinimumRequirements(ctx(), settings, "szybkość");
    expect(r.requiredGymSessions).toBe(2);
    expect(r.requiredEnduranceSessions).toBe(1);
    expect(r.requiredSpeedSessions).toBe(2);
    expect(r.isSpeedGoal).toBe(true);
  });

  it('cel "przyspieszenie" zwraca 2 speed', () => {
    const r = calculateWeeklyMinimumRequirements(ctx(), settings, "przyspieszenie");
    expect(r.requiredSpeedSessions).toBe(2);
    expect(shouldAddSecondSpeedSession(ctx(), "przyspieszenie")).toBe(true);
  });

  it("enum speed/agility/power liczą się jako cel szybkościowy", () => {
    expect(getAthleteGoalRules("speed").isSpeedGoal).toBe(true);
    expect(getAthleteGoalRules("agility").isSpeedGoal).toBe(true);
    expect(getAthleteGoalRules("power").isSpeedGoal).toBe(true);
    expect(getAthleteGoalRules("change of direction").isSpeedGoal).toBe(true);
  });
});

describe("weeklyRequirements — cel wydolnościowy", () => {
  it("wydolność + 2 klubowe zwraca requiredEnduranceSessions = 3", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 2 }),
      settings,
      "wydolność",
    );
    expect(r.requiredEnduranceSessions).toBe(3);
    expect(r.isEnduranceGoal).toBe(true);
  });

  it("wydolność + 3 klubowe zwraca requiredEnduranceSessions = 2", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 3 }),
      settings,
      "kondycja",
    );
    expect(r.requiredEnduranceSessions).toBe(2);
  });

  it("wydolność + 4 klubowe zwraca 2 endurance i absoluteMinimum = 1", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 4 }),
      settings,
      "endurance",
    );
    expect(r.requiredEnduranceSessions).toBe(2);
    expect(r.absoluteMinimumEnduranceSessions).toBe(1);
  });

  it("wydolność + 2 klubowe: absoluteMinimum = required (3)", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 2 }),
      settings,
      "wydolność",
    );
    expect(r.absoluteMinimumEnduranceSessions).toBe(3);
  });

  it("shouldAddExtraEnduranceSessions dla wydolności + 2 klubowe", () => {
    expect(shouldAddExtraEnduranceSessions(ctx({ clubTrainingCount: 2 }), "wydolność")).toBe(true);
    expect(shouldAddExtraEnduranceSessions(ctx(), "general")).toBe(false);
  });
});

describe("weeklyRequirements — sezon i klub nie kasują kategorii", () => {
  it("in-season nadal wymaga 2 gym, minimum 1 endurance i 1 speed", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ seasonPhase: "inseason", matchCount: 1 }),
      settings,
      "general",
    );
    expect(r.requiredGymSessions).toBe(2);
    expect(r.requiredEnduranceSessions).toBeGreaterThanOrEqual(1);
    expect(r.requiredSpeedSessions).toBeGreaterThanOrEqual(1);
    expect(getSeasonPhaseRules("inseason").isInSeason).toBe(true);
  });

  it("trening klubowy nie zmniejsza required endurance ani speed", () => {
    const few = calculateWeeklyMinimumRequirements(ctx({ clubTrainingCount: 1 }), settings, "speed");
    const many = calculateWeeklyMinimumRequirements(ctx({ clubTrainingCount: 4 }), settings, "speed");
    expect(many.requiredSpeedSessions).toBe(few.requiredSpeedSessions);
    expect(many.requiredEnduranceSessions).toBeGreaterThanOrEqual(1);
    expect(many.requiredGymSessions).toBe(2);
  });

  it("forbidEnduranceOnClubDays zawsze wynosi true", () => {
    expect(calculateWeeklyMinimumRequirements(ctx(), settings, "general").forbidEnduranceOnClubDays).toBe(true);
    expect(
      calculateWeeklyMinimumRequirements(ctx({ seasonPhase: "inseason", clubTrainingCount: 5 }), settings, "wydolność")
        .forbidEnduranceOnClubDays,
    ).toBe(true);
  });
});

describe("weeklyRequirements — wiek/poziom nie kasują kategorii", () => {
  const youth14: AthleteRequirementProfile = {
    developmentStage: "early_youth",
    gymExperienceLevel: "beginner",
  };

  it("14 lat beginner nadal ma 2 gym, ale requiresYouthSafeContent = true", () => {
    const r = calculateWeeklyMinimumRequirements(ctx(), settings, "general", youth14);
    expect(r.requiredGymSessions).toBe(2);
    expect(r.requiresYouthSafeContent).toBe(true);
  });

  it("14 lat cel szybkość nadal ma 2 speed, ale youth-safe", () => {
    const r = calculateWeeklyMinimumRequirements(ctx(), settings, "szybkość", youth14);
    expect(r.requiredSpeedSessions).toBe(2);
    expect(r.requiresYouthSafeContent).toBe(true);
  });

  it("14 lat cel wydolność nadal ma wymaganą liczbę endurance, youth-safe", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 2 }),
      settings,
      "wydolność",
      youth14,
    );
    expect(r.requiredEnduranceSessions).toBe(3);
    expect(r.requiresYouthSafeContent).toBe(true);
  });
});

describe("weeklyRequirements — liczniki kontekstu", () => {
  it("getClubTrainingCount preferuje jawny licznik, potem dni klubowe", () => {
    expect(getClubTrainingCount(ctx({ clubTrainingCount: 3 }))).toBe(3);
    expect(getClubTrainingCount(undefined, { clubTrainingDays: [2, 4, 6] })).toBe(3);
  });

  it("getMatchCount czyta liczbę meczów", () => {
    expect(getMatchCount(ctx({ matchCount: 2 }))).toBe(2);
    expect(getMatchCount(undefined)).toBe(0);
  });

  it("getRequired* helpery są spójne z funkcją główną", () => {
    const c = ctx({ clubTrainingCount: 3 });
    expect(getRequiredGymSessions(c, settings)).toBe(2);
    expect(getRequiredEnduranceSessions(c, settings, "wydolność")).toBe(2);
    expect(getRequiredSpeedSessions(c, settings, "szybkość")).toBe(2);
  });
});
