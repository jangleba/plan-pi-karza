import { describe, expect, it } from "vitest";
import {
  mondayOf,
  offseasonGroup,
  offseasonStageForWeek,
  offseasonWeekLoad,
  seasonPhaseForWeek,
} from "./offseasonPeriod";
import type { Profile, SeasonPhase } from "./types";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Test",
    age: 20,
    position: "midfielder",
    level: "intermediate",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: "no_fixed_day",
    matchDate: null,
    matchDates: [],
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-01-01",
    seasonPhase: "offseason",
    seasonPhaseOverride: true,
    seasonStage: null,
    competitionLevel: "iv_liga",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...overrides,
  } as Profile;
}

describe("etap okresu bez meczów", () => {
  const season = (seasonPhase: SeasonPhase, matchDates: string[]) =>
    profile({ seasonPhase, matchDates, matchDate: null });

  it("po ostatnim meczu jest roztrenowanie, potem baza, a przed pierwszym meczem przedsezon", () => {
    const p = season("offseason", ["2026-06-06", "2026-08-15"]);
    expect(offseasonStageForWeek(p, "2026-06-08")).toBe("transition"); // 2 dni po meczu
    expect(offseasonStageForWeek(p, "2026-06-22")).toBe("transition"); // 16 dni
    expect(offseasonStageForWeek(p, "2026-06-29")).toBe("base"); // 23 dni
    expect(offseasonStageForWeek(p, "2026-07-06")).toBe("base"); // 40 dni do meczu
    expect(offseasonStageForWeek(p, "2026-07-13")).toBe("preseason"); // 33 dni do meczu
  });

  it("bez dat meczów używa okresu wybranego w profilu", () => {
    expect(offseasonStageForWeek(season("transition", []), "2026-06-15")).toBe("transition");
    expect(offseasonStageForWeek(season("offseason", []), "2026-06-15")).toBe("base");
    expect(offseasonStageForWeek(season("preseason", []), "2026-06-15")).toBe("preseason");
  });

  it("wybrany przedsezon nie cofa się do roztrenowania po starym meczu", () => {
    expect(offseasonStageForWeek(season("preseason", ["2026-06-10"]), "2026-06-15")).toBe(
      "preseason",
    );
  });

  it("liczy etap od poniedziałku, więc każdy dzień tygodnia ma ten sam etap", () => {
    expect(mondayOf("2026-06-21")).toBe("2026-06-15");
    const p = season("offseason", ["2026-07-19"]);
    expect(seasonPhaseForWeek(p, "2026-06-15")).toBe(seasonPhaseForWeek(p, "2026-06-21"));
  });

  it("cotygodniowe mecze albo stały dzień meczu oznaczają sezon — bez etapów", () => {
    expect(offseasonStageForWeek(profile({ weeklyMatches: true }), "2026-06-15")).toBeNull();
    expect(offseasonStageForWeek(profile({ usualMatchDay: 6 }), "2026-06-15")).toBeNull();
    expect(offseasonStageForWeek(profile({ seasonPhase: "inseason" }), "2026-06-15")).toBeNull();
  });
});

describe("liczba sesji według wieku i poziomu", () => {
  it("młodsi i początkujący mają mniej sesji i bez dni podwójnych", () => {
    expect(offseasonGroup({ age: 13, level: "advanced" })).toBe("u14");
    expect(offseasonGroup({ age: 15, level: "intermediate" })).toBe("developing");
    expect(offseasonGroup({ age: 25, level: "beginner" })).toBe("developing");
    expect(offseasonWeekLoad({ age: 13, level: "intermediate" }, "base")).toEqual({
      cap: 4,
      maxDoubles: 0,
    });
    expect(offseasonWeekLoad({ age: 22, level: "elite" }, "base")).toEqual({
      cap: 6,
      maxDoubles: 4,
    });
    // Przedsezon: intensywność rośnie, objętość (dni podwójne) maleje.
    expect(offseasonWeekLoad({ age: 22, level: "elite" }, "preseason").maxDoubles).toBe(3);
    expect(offseasonWeekLoad({ age: 22, level: "elite" }, "transition")).toEqual({
      cap: 3,
      maxDoubles: 0,
    });
  });
});
