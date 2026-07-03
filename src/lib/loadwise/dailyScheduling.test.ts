import { describe, it, expect } from "vitest";
import {
  getMaxSessionsPerDay,
  isTwoADayAllowed,
  countSessionsForDay,
  hasAvailableSecondSessionSlot,
  hasClubSession,
  hasEnduranceSession,
  hasMatchSession,
  canAddSessionToDay,
  validateDailySessionLimit,
  validateTwoADayCombination,
  getMinimumEnduranceSessionsPerWeek,
  countWeeklyEnduranceSessions,
  validateWeeklyEnduranceMinimum,
  findBestDayForEndurance,
  canPlaceEnduranceOnClubDay,
  adaptEnduranceForClubDay,
  getClubSessionLoadLevel,
  sortSessionsWithinDay,
  getSessionOrderPriority,
  type SchedDay,
  type SchedSession,
  type UserSchedulingSettings,
  type AthleteSchedProfile,
} from "./dailyScheduling";

const oneADay: UserSchedulingSettings = { maxSessionsPerDay: 1 };
const twoADay: UserSchedulingSettings = { maxSessionsPerDay: 2 };

const youth: AthleteSchedProfile = { developmentStage: "early_youth", gymExperienceLevel: "beginner" };
const adult: AthleteSchedProfile = { developmentStage: "adult", gymExperienceLevel: "advanced" };

function day(sessions: SchedSession[], extra: Partial<SchedDay> = {}): SchedDay {
  return { sessions, ...extra };
}

const club = (o: Partial<SchedSession> = {}): SchedSession => ({ category: "club", ...o });
const gym = (o: Partial<SchedSession> = {}): SchedSession => ({ category: "gym_strength", ...o });
const speed = (o: Partial<SchedSession> = {}): SchedSession => ({ category: "speed_sprint", ...o });
const endurance = (o: Partial<SchedSession> = {}): SchedSession => ({
  category: "endurance_conditioning",
  ...o,
});

describe("limity dzienne", () => {
  it("maxSessionsPerDay = 1 blokuje drugą sesję", () => {
    expect(getMaxSessionsPerDay(oneADay)).toBe(1);
    const d = day([gym()]);
    const res = canAddSessionToDay(d, endurance(), oneADay);
    expect(res.allowed).toBe(false);
    expect(res.blockReason).toContain("maxSessionsPerDay = 1");
  });

  it("maxSessionsPerDay = 2 pozwala na bezpieczną drugą sesję", () => {
    expect(isTwoADayAllowed(twoADay)).toBe(true);
    const d = day([gym({ loadLevel: "high" })]);
    const res = canAddSessionToDay(d, endurance({ loadLevel: "low" }), twoADay, null, null, adult);
    expect(res.allowed).toBe(true);
  });

  it("doubleSessionsAllowed steruje limitem gdy brak jawnego", () => {
    expect(getMaxSessionsPerDay({ doubleSessionsAllowed: "no" })).toBe(1);
    expect(getMaxSessionsPerDay({ doubleSessionsAllowed: "light_only" })).toBe(2);
    expect(getMaxSessionsPerDay({ doubleSessionsAllowed: "yes_if_safe" })).toBe(2);
  });

  it("dzień z 2 sesjami nie dostaje trzeciej", () => {
    const d = day([gym(), endurance()]);
    expect(countSessionsForDay(d)).toBe(2);
    expect(hasAvailableSecondSessionSlot(d, twoADay)).toBe(false);
    const res = canAddSessionToDay(d, speed(), twoADay, null, null, adult);
    expect(res.allowed).toBe(false);
    expect(res.blockReason).toContain("maxSessionsPerDay = 2");
    const combo = validateTwoADayCombination(d, speed());
    expect(combo.allowed).toBe(false);
  });

  it("validateDailySessionLimit wykrywa przekroczenie", () => {
    expect(validateDailySessionLimit(day([gym()]), oneADay).valid).toBe(true);
    expect(validateDailySessionLimit(day([gym(), endurance()]), oneADay).valid).toBe(false);
    const three = validateDailySessionLimit(day([gym(), endurance(), speed()]), twoADay);
    expect(three.valid).toBe(false);
    expect(three.unresolvedIssue).toContain("2 sesje");
  });
});

describe("dozwolone kombinacje", () => {
  it("club + gym jest dozwolone", () => {
    const res = validateTwoADayCombination(day([club({ loadLevel: "moderate" })]), gym({ loadLevel: "moderate" }), null, null, adult);
    expect(res.allowed).toBe(true);
  });

  it("club + speed jest dozwolone", () => {
    const res = validateTwoADayCombination(day([club({ loadLevel: "moderate" })]), speed({ loadLevel: "moderate" }), null, null, adult);
    expect(res.allowed).toBe(true);
  });

  it("gym + endurance jest dozwolone", () => {
    const res = validateTwoADayCombination(
      day([gym({ loadLevel: "high" })]),
      endurance({ loadLevel: "low" }),
      null,
      null,
      adult,
    );
    expect(res.allowed).toBe(true);
  });

  it("club + endurance dozwolone tylko po adaptacji jako fallback", () => {
    const d = day([club({ rpe: 5 })]);
    const place = canPlaceEnduranceOnClubDay(d, endurance({ loadLevel: "low" }), twoADay, null, null, adult);
    expect(place.allowed).toBe(true);
    const adapted = adaptEnduranceForClubDay(d, endurance({ durationMin: 40 }), adult);
    expect(adapted.adaptationReason).toBeTruthy();
    expect(adapted.timingHint).toContain("4–6");
    expect(adapted.placementReason).toContain("minimum tygodniowego");
  });
});

describe("zablokowane kombinacje", () => {
  it("dwie ciężkie sesje jednego dnia są zablokowane", () => {
    const res = validateTwoADayCombination(
      day([gym({ loadLevel: "high" })]),
      speed({ isFullSpeed: true }),
      null,
      null,
      adult,
    );
    expect(res.allowed).toBe(false);
  });

  it("ciężka siła nóg + ciężkie conditioning tego samego dnia", () => {
    const res = validateTwoADayCombination(
      day([gym({ isHeavyLegs: true })]),
      endurance({ isHeavyConditioning: true }),
      null,
      null,
      adult,
    );
    expect(res.allowed).toBe(false);
    expect(res.blockReason).toContain("conditioning");
  });

  it("ciężkie sprinty nie są dodawane dzień przed meczem", () => {
    const d = day([gym({ loadLevel: "low" })], { toMatch: 1 });
    const res = validateTwoADayCombination(d, speed({ isMaxVelocity: true }), null, null, adult);
    expect(res.allowed).toBe(false);
    expect(res.blockReason).toContain("max velocity");
  });

  it("dwie pełne sesje szybkościowe jednego dnia", () => {
    const res = validateTwoADayCombination(day([speed()]), speed(), null, null, adult);
    expect(res.allowed).toBe(false);
  });

  it("14-letni beginner nie dostaje dwóch ciężkich sesji jednego dnia", () => {
    const res = validateTwoADayCombination(
      day([club({ loadLevel: "high" })]),
      gym({ loadLevel: "high" }),
      null,
      null,
      youth,
    );
    expect(res.allowed).toBe(false);
    expect(res.blockReason).toContain("youth/beginner");
  });

  it("ciężki club obniża endurance albo tworzy unresolvedIssue jeśli niebezpiecznie", () => {
    const heavyClubDay = day([club({ rpe: 8 })]);
    expect(getClubSessionLoadLevel(heavyClubDay.sessions[0])).toBe("heavy");
    const adapted = adaptEnduranceForClubDay(heavyClubDay, endurance({ durationMin: 40 }), adult);
    expect(adapted.loadLevel).toBe("low");
    expect(adapted.adaptationReason).toContain("ciężki");

    // Bardzo ciężki club + próba ciężkiego endurance → unresolved / block.
    const veryHeavy = day([club({ rpe: 10 })]);
    const place = canPlaceEnduranceOnClubDay(veryHeavy, endurance({ loadLevel: "high" }), twoADay, null, null, adult);
    expect(place.allowed).toBe(false);
    expect(place.clubLoad).toBe("very_heavy");
  });
});

describe("kolejność sesji", () => {
  it("speed jest sortowane przed gym/club/endurance", () => {
    const d = day([club(), endurance(), gym(), speed()]);
    const sorted = sortSessionsWithinDay(d).map((s) => s.category);
    expect(sorted[0]).toBe("speed_sprint");
    expect(sorted.indexOf("gym_strength")).toBeLessThan(sorted.indexOf("club"));
    expect(sorted.indexOf("endurance_conditioning")).toBeLessThan(sorted.indexOf("club"));
  });

  it("endurance po klubowym idzie za club", () => {
    expect(getSessionOrderPriority(endurance({ afterClub: true }))).toBeGreaterThan(
      getSessionOrderPriority(club()),
    );
  });
});

describe("twarde minimum endurance na tydzień", () => {
  it("minimum zawsze wynosi co najmniej 1", () => {
    expect(getMinimumEnduranceSessionsPerWeek(oneADay, youth)).toBe(1);
    expect(getMinimumEnduranceSessionsPerWeek(twoADay, adult)).toBe(1);
  });

  it("tydzień bez endurance jest niepoprawny", () => {
    const week: SchedDay[] = [day([club()]), day([gym()]), day([speed()])];
    expect(countWeeklyEnduranceSessions(week)).toBe(0);
    const res = validateWeeklyEnduranceMinimum(week);
    expect(res.valid).toBe(false);
    expect(res.unresolvedIssue).toBeTruthy();
  });

  it("tydzień z endurance przechodzi", () => {
    const week: SchedDay[] = [day([club()]), day([endurance()]), day([gym()])];
    const res = validateWeeklyEnduranceMinimum(week);
    expect(res.valid).toBe(true);
    expect(res.count).toBe(1);
  });
});

describe("findBestDayForEndurance", () => {
  it("najpierw szuka dnia bez club i bez match", () => {
    const week: SchedDay[] = [
      day([club()], { dayOfWeek: 1 }),
      day([gym()], { dayOfWeek: 2 }),
      day([], { dayOfWeek: 3 }), // wolny dzień
      day([club()], { dayOfWeek: 4 }),
    ];
    const res = findBestDayForEndurance(week, twoADay, null, null, adult);
    expect(res.dayIndex).toBe(2);
    expect(res.tier).toBe("no_club_no_match");
  });

  it("gdy brak wolnego dnia, wybiera dzień z gym/speed", () => {
    const week: SchedDay[] = [
      day([club()], { dayOfWeek: 1 }),
      day([gym({ loadLevel: "high" })], { dayOfWeek: 2 }),
      day([club()], { dayOfWeek: 3 }),
    ];
    const res = findBestDayForEndurance(week, twoADay, null, null, adult);
    expect(res.tier).toBe("gym_or_speed");
    expect(res.dayIndex).toBe(1);
  });

  it("dzień club jest ostatnim fallbackiem", () => {
    const week: SchedDay[] = [
      day([club({ rpe: 4 })], { dayOfWeek: 1 }),
      day([club({ rpe: 4 })], { dayOfWeek: 2 }),
    ];
    const res = findBestDayForEndurance(week, twoADay, null, null, adult);
    expect(res.tier).toBe("club_fallback");
  });

  it("gdy nigdzie się nie da — unresolvedIssue", () => {
    const week: SchedDay[] = [day([gym(), endurance()], { dayOfWeek: 1 })];
    const res = findBestDayForEndurance(week, oneADay, null, null, adult);
    expect(res.dayIndex).toBe(null);
    expect(res.unresolvedIssue).toBeTruthy();
  });
});

describe("helpery obecności sesji", () => {
  it("hasClub/Endurance/Match działają", () => {
    expect(hasClubSession(day([club()]))).toBe(true);
    expect(hasEnduranceSession(day([endurance()]))).toBe(true);
    expect(hasMatchSession(day([{ category: "match" }]))).toBe(true);
    expect(hasClubSession(day([gym()]))).toBe(false);
  });
});
