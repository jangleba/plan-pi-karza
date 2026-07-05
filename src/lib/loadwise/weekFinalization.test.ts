import { describe, it, expect } from "vitest";
import type { Profile, SessionDay, DayType } from "./types";
import { normalizeSessionCategory, isEnduranceSession, isClubSession } from "./sessionClassification";
import {
  countEnduranceSessions,
  addMissingEnduranceSessions,
  validateAndRepairWeekPlan,
  assertFinalPlanMeetsMinimums,
  validateNoEnduranceOnClubDays,
} from "./weekFinalization";
import {
  calculateWeeklyMinimumRequirements,
  type WeekRequirementContext,
} from "./weeklyRequirements";

// ---------------------------------------------------------------------------
// Helpery — budowa dni typu SessionDay dla pełnego tygodnia (pon–niedz)
// ---------------------------------------------------------------------------

const MON = "2026-06-29"; // poniedziałek
const DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 5, 29 + i));
  return d.toISOString().slice(0, 10);
});

function baseDay(dayType: DayType, over: Partial<SessionDay> = {}): SessionDay {
  const idx = over.date ? DATES.indexOf(over.date) : 0;
  const raw: SessionDay = {
    date: over.date ?? DATES[0],
    dayOfWeek: idx >= 0 ? idx + 1 : 1,
    dayName: "Dzień",
    dayType,
    title: "",
    goalLabel: "",
    intensity: "umiarkowana",
    durationMin: 45,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
    ...over,
  };
  return normalizeSessionCategory(raw);
}

function gymDay(date: string): SessionDay {
  return baseDay("training", { date, title: "Siła dolna — przysiad", sessionType: "Siła / moc", intensity: "wysoka" });
}
function speedDay(date: string): SessionDay {
  return baseDay("training", { date, title: "Acceleration / pierwszy krok", sessionType: "Szybkość", intensity: "wysoka" });
}
function clubDay(date: string): SessionDay {
  return baseDay("club", { date, title: "Trening klubowy", sessionType: "Klub" });
}
function recoveryDay(date: string): SessionDay {
  return baseDay("recovery", { date, title: "Regeneracja i mobilność", sessionType: "Regeneracja", intensity: "niska" });
}
function restDay(date: string): SessionDay {
  return baseDay("rest", { date, title: "Dzień wolny", sessionType: "Dzień wolny", intensity: "niska", durationMin: 0 });
}

function profile(over: Partial<Profile> = {}): Profile {
  return {
    name: "Test",
    age: 22,
    position: "midfielder" as Profile["position"],
    level: "intermediate" as Profile["level"],
    goal: "general" as Profile["goal"],
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [],
    usualMatchDay: "none" as Profile["usualMatchDay"],
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-06-01",
    seasonPhase: "inseason" as Profile["seasonPhase"],
    seasonStage: null,
    competitionLevel: "amateur" as Profile["competitionLevel"],
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    gymExperienceLevel: "intermediate",
    ...over,
  };
}

function reqFor(week: SessionDay[], p: Profile) {
  const ctx: WeekRequirementContext = {
    seasonPhase: p.seasonPhase,
    clubTrainingCount: week.filter((d) => isClubSession(d)).length,
    matchCount: 0,
  };
  return calculateWeeklyMinimumRequirements(ctx, { hasGym: p.hasGym }, p.goal);
}

// ---------------------------------------------------------------------------
// Testy regresyjne
// ---------------------------------------------------------------------------

describe("weekFinalization — twarda zasada endurance", () => {
  it("1) pełny tydzień nigdy nie wychodzi z 0 endurance (2 gym + club + 2 recovery + speed)", () => {
    const p = profile();
    const week = [
      gymDay(DATES[0]),
      clubDay(DATES[1]),
      recoveryDay(DATES[2]),
      gymDay(DATES[3]),
      speedDay(DATES[4]),
      recoveryDay(DATES[5]),
      clubDay(DATES[6]),
    ];
    expect(countEnduranceSessions(week)).toBe(0);
    const { report } = validateAndRepairWeekPlan(week, p);
    expect(countEnduranceSessions(week)).toBeGreaterThanOrEqual(1);
    expect(report.finalStatus).toBe("valid");
  });

  it("2) 2 recovery/prehab i 0 endurance → jeden recovery zamieniony na endurance", () => {
    const p = profile();
    const week = [
      gymDay(DATES[0]),
      recoveryDay(DATES[1]),
      recoveryDay(DATES[2]),
      gymDay(DATES[3]),
      speedDay(DATES[4]),
      clubDay(DATES[5]),
      clubDay(DATES[6]),
    ];
    const req = reqFor(week, p);
    const res = addMissingEnduranceSessions(week, { seasonPhase: p.seasonPhase, clubTrainingCount: 2, matchCount: 0 }, p, req, p);
    expect(res.converted).toBeGreaterThanOrEqual(1);
    expect(res.count).toBeGreaterThanOrEqual(1);
    // dodana sesja jest oznaczona
    const added = week.find((d) => d.classification?.repairTag === "missing-endurance");
    expect(added).toBeTruthy();
    expect(added!.classification?.generatedBy).toBe("final-week-validator");
    expect(added!.classification?.placementReason).toContain("regenerację");
  });

  it("3) endurance nigdy nie trafia w dzień klubowy", () => {
    const p = profile({ doubleSessionsAllowed: "yes_if_safe" });
    const week = [
      clubDay(DATES[0]),
      clubDay(DATES[1]),
      clubDay(DATES[2]),
      gymDay(DATES[3]),
      speedDay(DATES[4]),
      recoveryDay(DATES[5]),
      restDay(DATES[6]),
    ];
    validateAndRepairWeekPlan(week, p);
    for (const d of week) {
      if (isClubSession(d)) {
        expect(d.secondSession && isEnduranceSession(d.secondSession)).toBeFalsy();
      }
    }
    expect(countEnduranceSessions(week)).toBeGreaterThanOrEqual(1);
  });

  it("4) tydzień nieprzeciążony → brakująca endurance jest normalna, nie lekka", () => {
    const p = profile();
    const week = [
      gymDay(DATES[0]),
      restDay(DATES[1]),
      recoveryDay(DATES[2]),
      gymDay(DATES[3]),
      speedDay(DATES[4]),
      restDay(DATES[5]),
      restDay(DATES[6]),
    ];
    validateAndRepairWeekPlan(week, p);
    const end = week.find((d) => isEnduranceSession(d));
    expect(end).toBeTruthy();
    expect(end!.intensity).not.toBe("niska");
  });

  it("5) niski readiness/ból → brakująca endurance może być low-impact (lekka)", () => {
    const p = profile({ painInjury: true, painLocations: ["knee"] });
    const week = [
      gymDay(DATES[0]),
      restDay(DATES[1]),
      recoveryDay(DATES[2]),
      gymDay(DATES[3]),
      speedDay(DATES[4]),
      restDay(DATES[5]),
      restDay(DATES[6]),
    ];
    validateAndRepairWeekPlan(week, p);
    const end = week.find((d) => isEnduranceSession(d));
    expect(end).toBeTruthy();
    expect(end!.intensity).toBe("niska");
    expect(end!.sessionType.toLowerCase()).toContain("low-impact");
  });

  it("6) plan z 0 endurance nie może mieć finalStatus = valid", () => {
    const p = profile();
    const week = [
      gymDay(DATES[0]),
      gymDay(DATES[1]),
      speedDay(DATES[2]),
      recoveryDay(DATES[3]),
      clubDay(DATES[4]),
      clubDay(DATES[5]),
      clubDay(DATES[6]),
    ];
    const req = reqFor(week, p);
    const report = assertFinalPlanMeetsMinimums(week, req);
    expect(report.enduranceSessionsCount).toBe(0);
    expect(report.finalStatus).toBe("invalid");
    expect(report.ok).toBe(false);
  });

  it("7) walidator uruchomiony dwa razy nie dodaje duplikatów endurance", () => {
    const p = profile();
    const week = [
      gymDay(DATES[0]),
      recoveryDay(DATES[1]),
      recoveryDay(DATES[2]),
      gymDay(DATES[3]),
      speedDay(DATES[4]),
      clubDay(DATES[5]),
      restDay(DATES[6]),
    ];
    validateAndRepairWeekPlan(week, p);
    const after1 = countEnduranceSessions(week);
    validateAndRepairWeekPlan(week, p);
    const after2 = countEnduranceSessions(week);
    expect(after2).toBe(after1);
  });

  it("validateNoEnduranceOnClubDays usuwa endurance z 2. slotu dnia klubowego", () => {
    const club = clubDay(DATES[0]);
    club.secondSession = baseDay("training", { date: DATES[0], title: "Tempo aerobowe", sessionType: "Wytrzymałość" });
    const week = [club];
    const res = validateNoEnduranceOnClubDays(week);
    expect(res.removed).toBe(1);
    expect(club.secondSession).toBeNull();
  });
});
