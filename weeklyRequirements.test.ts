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
  getRequiredBallSessions,
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
  it("zwykły tydzień zwraca 2 gym, 1 endurance, 1 speed i 1 własną piłkę", () => {
    const r = calculateWeeklyMinimumRequirements(ctx(), settings, "general");
    expect(r.requiredGymSessions).toBe(2);
    expect(r.requiredEnduranceSessions).toBe(1);
    expect(r.requiredSpeedSessions).toBe(1);
    expect(r.requiredBallSessions).toBe(1);
  });

  it("klub i mecz nie zastępują własnej sesji piłkarskiej", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 4, matchCount: 1 }),
      settings,
      "general",
    );
    expect(r.requiredBallSessions).toBe(1);
  });

  it("nawet zatłoczony tydzień zachowuje jedną własną sesję z piłką", () => {
    const crowded = ctx({ clubTrainingCount: 5, matchCount: 2 });
    expect(getRequiredBallSessions(crowded, { gymExperienceLevel: "beginner" })).toBe(1);
    expect(getRequiredBallSessions(crowded, { gymExperienceLevel: "advanced" })).toBe(1);
  });

  it("brak celu wydolnościowego i 4 klubowe zwraca requiredEnduranceSessions = 1", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 4 }),
      settings,
      "strength",
    );
    expect(r.requiredEnduranceSessions).toBe(1);
    expect(r.requiredGymSessions).toBe(1);
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

  it("speed/agility/COD liczą się jako cel szybkościowy, ale cel mocy pozostaje odrębny", () => {
    expect(getAthleteGoalRules("speed").isSpeedGoal).toBe(true);
    expect(getAthleteGoalRules("agility").isSpeedGoal).toBe(true);
    expect(getAthleteGoalRules("change of direction").isSpeedGoal).toBe(true);
    expect(getAthleteGoalRules("power").isSpeedGoal).toBe(false);
    expect(getAthleteGoalRules("power").requiredSpeedSessions).toBe(1);
    expect(getAthleteGoalRules("moc").requiredSpeedSessions).toBe(1);
  });
});

describe("weeklyRequirements — cel wydolnościowy", () => {
  it("cel wydolnościowy zawsze wymaga 2 własnych sesji", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 2 }),
      settings,
      "wydolność",
    );
    expect(r.requiredEnduranceSessions).toBe(2);
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

  it("klub nie obniża minimum celu wydolnościowego", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 4 }),
      settings,
      "endurance",
    );
    expect(r.requiredEnduranceSessions).toBe(2);
    expect(r.absoluteMinimumEnduranceSessions).toBe(2);
  });

  it("absoluteMinimum celu wydolnościowego wynosi 2", () => {
    const r = calculateWeeklyMinimumRequirements(
      ctx({ clubTrainingCount: 2 }),
      settings,
      "wydolność",
    );
    expect(r.absoluteMinimumEnduranceSessions).toBe(2);
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
    expect(many.requiredGymSessions).toBe(1);
  });

  it("nie ma globalnej blokady club + endurance — bezpieczeństwo ocenia scheduler par", () => {
    expect(calculateWeeklyMinimumRequirements(ctx(), settings, "general").forbidEnduranceOnClubDays).toBe(false);
    expect(
      calculateWeeklyMinimumRequirements(ctx({ seasonPhase: "inseason", clubTrainingCount: 5 }), settings, "wydolność")
        .forbidEnduranceOnClubDays,
    ).toBe(false);
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
    expect(r.requiredEnduranceSessions).toBe(2);
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

  it("dwa mecze obniżają minimum siłowni do jednej", () => {
    expect(getRequiredGymSessions(ctx({ matchCount: 2 }), settings)).toBe(1);
  });

  it("powrót po urazie nie wymaga siłowni przy aktywnym bólu", () => {
    expect(
      getRequiredGymSessions(
        ctx({ seasonPhase: "return_injury" }),
        settings,
        { hasActivePain: true },
      ),
    ).toBe(0);
  });

  it("powrót po urazie zachowuje jedną ostrożną siłownię bez bólu", () => {
    expect(
      getRequiredGymSessions(
        ctx({ seasonPhase: "return_injury" }),
        settings,
        { hasActivePain: false },
      ),
    ).toBe(1);
  });

  it("powrót po urazie zachowuje jedną ostrożną siłownię bez odpowiedzi", () => {
    expect(
      getRequiredGymSessions(ctx({ seasonPhase: "return_injury" }), settings),
    ).toBe(1);
  });

  it("zatłoczony tydzień zachowuje po jednej szybkości i wydolności", () => {
    const crowded = ctx({ isFullWeek: false, clubTrainingCount: 4, matchCount: 1 });
    expect(getRequiredSpeedSessions(crowded, settings, "speed")).toBe(1);
    expect(getRequiredEnduranceSessions(crowded, settings, "endurance")).toBe(1);
    expect(getRequiredGymSessions(crowded, settings)).toBe(1);
    expect(getRequiredBallSessions(crowded)).toBe(1);
  });
});
