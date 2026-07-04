import { describe, it, expect } from "vitest";
import {
  scoreDayForGym,
  scoreDayForEndurance,
  scoreDayForSpeed,
  getDayPlacementWarnings,
  findBestPlacementForSession,
  placeSessionWithReason,
  canSafelyPairSessions,
  isDayBlockedForEndurance,
  buildCandidateSession,
  type PlacementSessionType,
} from "./dayPlacementScoring";
import type {
  SchedDay,
  SchedSession,
  UserSchedulingSettings,
  AthleteSchedProfile,
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

describe("isDayBlockedForEndurance", () => {
  it("dzień klubowy jest zablokowany dla wydolności", () => {
    expect(isDayBlockedForEndurance(day([club()]))).toBe(true);
    expect(isDayBlockedForEndurance(day([gym()]))).toBe(false);
    expect(isDayBlockedForEndurance(day([], { toMatch: 0 }))).toBe(true);
  });
});

describe("scoreDayForEndurance — twarda blokada club", () => {
  it("zwraca blocked=true i dokładny reason w dzień klubowy", () => {
    const week = [day([club()])];
    const res = scoreDayForEndurance(week[0], week, null, twoADay, "wydolność", null, adult);
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe("Endurance cannot be scheduled on club training day");
  });
});

describe("canSafelyPairSessions", () => {
  it("club + endurance zablokowane", () => {
    const res = canSafelyPairSessions(club(), endurance(), null, null, adult);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("Endurance cannot be scheduled on club training day");
  });
  it("gym + endurance dozwolone", () => {
    const res = canSafelyPairSessions(gym({ loadLevel: "high" }), endurance({ loadLevel: "low" }), null, null, adult);
    expect(res.allowed).toBe(true);
  });
  it("speed + gym dozwolone", () => {
    expect(canSafelyPairSessions(gym(), speed(), null, null, adult).allowed).toBe(true);
  });
});

describe("brakująca siłownia", () => {
  it("trafia w dzień klubowy gdy nie ma wolnego dnia i 2/dzień dozwolone", () => {
    const week: SchedDay[] = [
      day([club({ loadLevel: "moderate" })], { dayOfWeek: 1 }),
      day([club({ loadLevel: "moderate" })], { dayOfWeek: 2 }),
    ];
    const res = findBestPlacementForSession("gym", week, null, twoADay, "ogólny", null, adult);
    expect(res.dayIndex).not.toBeNull();
    expect(week[res.dayIndex!].sessions.some((s) => s.category === "gym_strength")).toBe(true);
  });

  it("ciężka siła nóg nie trafia dzień przed meczem", () => {
    const week: SchedDay[] = [
      day([], { dayOfWeek: 1 }),
      day([], { dayOfWeek: 2, toMatch: 1 }),
    ];
    const res = findBestPlacementForSession("gym", week, null, twoADay, "ogólny", null, adult);
    expect(res.dayIndex).toBe(0);
    const md1 = scoreDayForGym(week[1], week, null, twoADay, adult);
    expect(md1.blocked).toBe(true);
  });

  it("dwie ciężkie siłownie dzień po dniu są blokowane", () => {
    const week: SchedDay[] = [
      day([gym({ isHeavyLegs: true, loadLevel: "high" })], { dayOfWeek: 1 }),
      day([], { dayOfWeek: 2 }),
    ];
    const res = scoreDayForGym(week[1], week, null, twoADay, adult);
    expect(res.blocked).toBe(true);
  });

  it("14-letni beginner dostaje youth-safe strength, nie ciężką siłownię", () => {
    const week: SchedDay[] = [day([], { dayOfWeek: 1 })];
    const res = findBestPlacementForSession("gym", week, null, twoADay, "ogólny", null, youth);
    expect(res.session?.isHeavyLegs).toBeFalsy();
    expect(res.reason).toContain("youth-safe");
    expect(res.session?.loadLevel).not.toBe("high");
  });
});

describe("brakująca wydolność", () => {
  it("trafia w dzień siłowni zamiast w dzień klubowy", () => {
    const week: SchedDay[] = [
      day([club({ loadLevel: "moderate" })], { dayOfWeek: 1 }),
      day([gym({ loadLevel: "moderate" })], { dayOfWeek: 2 }),
    ];
    const res = findBestPlacementForSession("endurance", week, null, twoADay, "ogólny", null, adult);
    expect(res.dayIndex).toBe(1);
  });

  it("nigdy nie trafia w dzień klubowy", () => {
    const week: SchedDay[] = [
      day([club()], { dayOfWeek: 1 }),
      day([club()], { dayOfWeek: 2 }),
    ];
    const res = findBestPlacementForSession("endurance", week, null, twoADay, "wydolność", null, adult);
    expect(res.dayIndex).toBeNull();
    expect(res.unresolvedIssue).toBeTruthy();
  });

  it("ciężkie bieganie nie trafia dzień przed meczem", () => {
    const week: SchedDay[] = [day([], { dayOfWeek: 1, toMatch: 1 })];
    const res = scoreDayForEndurance(week[0], week, null, twoADay, "wydolność", null, adult);
    expect(res.blocked).toBe(true);
  });
});

describe("brakująca szybkość", () => {
  it("trafia przed siłownią jeśli to najlepsza opcja", () => {
    const week: SchedDay[] = [
      day([gym({ loadLevel: "moderate" })], { dayOfWeek: 1 }),
      day([club({ loadLevel: "moderate" })], { dayOfWeek: 2 }),
    ];
    const res = findBestPlacementForSession("speed", week, null, twoADay, "szybkość", null, adult);
    expect(res.dayIndex).toBe(0);
  });

  it("może trafić przed klubowym", () => {
    const week: SchedDay[] = [day([club({ loadLevel: "moderate" })], { dayOfWeek: 1 })];
    const res = findBestPlacementForSession("speed", week, null, twoADay, "przyspieszenie", null, adult);
    expect(res.dayIndex).toBe(0);
    expect(week[0].sessions.some((s) => s.category === "speed_sprint")).toBe(true);
  });

  it("może trafić przed lekką wydolnością", () => {
    const week: SchedDay[] = [day([endurance({ loadLevel: "low" })], { dayOfWeek: 1 })];
    const res = findBestPlacementForSession("speed", week, null, twoADay, "szybkość", null, adult);
    expect(res.dayIndex).toBe(0);
  });

  it("max velocity nie trafia dzień przed meczem jako pełna ciężka sesja", () => {
    const week: SchedDay[] = [
      day([], { dayOfWeek: 1 }),
      day([], { dayOfWeek: 2, toMatch: 1 }),
    ];
    const md1 = scoreDayForSpeed(week[1], week, null, twoADay, "szybkość", adult);
    expect(md1.blocked).toBe(true);
    expect(md1.reason).toContain("max velocity");
    const res = findBestPlacementForSession("speed", week, null, twoADay, "szybkość", null, adult);
    expect(res.dayIndex).toBe(0);
  });

  it("14-latek beginner nie dostaje dużej objętości max velocity", () => {
    const week: SchedDay[] = [day([], { dayOfWeek: 1 })];
    const res = findBestPlacementForSession("speed", week, null, twoADay, "szybkość", null, youth);
    expect(res.session?.isMaxVelocity).toBeFalsy();
    expect(res.session?.isFullSpeed).toBeFalsy();
  });
});

describe("limity sesji dziennie", () => {
  it("maxSessionsPerDay = 1 nie tworzy dni z 2 treningami", () => {
    const week: SchedDay[] = [day([gym()], { dayOfWeek: 1 })];
    const res = findBestPlacementForSession("endurance", week, null, oneADay, "ogólny", null, adult);
    // Dzień ma już 1 sesję, limit 1 → brak miejsca.
    expect(res.dayIndex).toBeNull();
  });

  it("maxSessionsPerDay = 2 nie tworzy dni z 3 treningami", () => {
    const week: SchedDay[] = [day([gym(), endurance()], { dayOfWeek: 1 })];
    const res = scoreDayForSpeed(week[0], week, null, twoADay, "szybkość", adult);
    expect(res.blocked).toBe(true);
  });
});

describe("getDayPlacementWarnings", () => {
  it("ostrzega o wysokim obciążeniu i youth", () => {
    const w = getDayPlacementWarnings(
      day([gym({ loadLevel: "high" })]),
      endurance({ loadLevel: "low" }),
      null,
      null,
      youth,
    );
    expect(w.length).toBeGreaterThan(0);
  });
  it("ostrzega o endurance w dzień klubowy", () => {
    const w = getDayPlacementWarnings(day([club()]), endurance(), null, null, adult);
    expect(w.some((x) => x.includes("klubow"))).toBe(true);
  });
});

describe("buildCandidateSession + placeSessionWithReason", () => {
  it("youth gym jest lekki i bez heavy legs", () => {
    const c = buildCandidateSession("gym", youth);
    expect(c.isHeavyLegs).toBe(false);
  });
  it("placeSessionWithReason dodaje sesję z powodem", () => {
    const d = day([]);
    const placed = placeSessionWithReason(gym(), d, "test reason");
    expect(placed.placementReason).toBe("test reason");
    expect(d.sessions.length).toBe(1);
  });
});
