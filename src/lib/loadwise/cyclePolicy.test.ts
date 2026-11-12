import { describe, expect, it } from "vitest";
import { cycleWeekPhase, type CycleRecommendationKind } from "./cyclePolicy";
import { generatePlan } from "./planEngine";
import { generatePlanAsync } from "./generatePlanAsync";
import { phaseOf } from "./sessionRuntime";
import type { CycleStartRecord, Profile, SessionDay, WeekPhase } from "./types";

function phases(kind: CycleRecommendationKind | null, totalWeeks = 4, youth = false): WeekPhase[] {
  return Array.from({ length: totalWeeks }, (_, week) =>
    cycleWeekPhase(phaseOf(week, totalWeeks), week, totalWeeks, kind ? { kind, youth } : null),
  );
}

describe("start cyklu według podsumowania poprzedniego", () => {
  it("bez podsumowania: zwykły blok", () => {
    expect(phases(null)).toEqual(["adaptation", "development", "peak", "deload"]);
    expect(phases("progress", 5)).toEqual(["adaptation", "development", "peak", "peak", "deload"]);
  });

  it("zdrowie: 2 tygodnie odciążenia, bez przeciążenia", () => {
    expect(phases("health")).toEqual(["deload", "deload", "development", "deload"]);
  });

  it("roztrenowanie: lżejszy start, bez przeciążenia", () => {
    expect(phases("transition")).toEqual(["deload", "development", "development", "deload"]);
  });

  it("zmęczenie: tydzień odciążenia, potem wprowadzenie i blok", () => {
    expect(phases("deload", 5)).toEqual(["deload", "adaptation", "development", "peak", "deload"]);
  });

  it("regularność i utrzymanie: obciążenie nie rośnie (bez przeciążenia)", () => {
    for (const kind of ["consistency", "maintain"] as const)
      expect(phases(kind, 5)).not.toContain("peak");
  });

  it("zmiana bodźca: przeciążenie wcześniej, potem budowanie", () => {
    expect(phases("vary")).toEqual(["adaptation", "peak", "development", "deload"]);
  });

  it("młodzież przy progresie: najwyżej jeden tydzień przeciążenia", () => {
    expect(phases("progress", 5, true).filter((p) => p === "peak")).toHaveLength(1);
    expect(phases("progress", 5, false).filter((p) => p === "peak")).toHaveLength(2);
  });

  it("ostatni tydzień cyklu zostaje odciążeniem", () => {
    for (const kind of ["health", "transition", "deload", "vary", "maintain"] as const)
      expect(phases(kind).at(-1)).toBe("deload");
  });
});

const START = new Date("2026-06-15T12:00:00"); // poniedziałek

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Test",
    age: 20,
    position: "midfielder",
    level: "intermediate",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 3, 5, 6],
    unavailableDays: [],
    usualMatchDay: 7,
    matchDate: null,
    matchDates: [],
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-01-01",
    seasonPhase: "inseason",
    seasonPhaseOverride: true,
    seasonStage: null,
    competitionLevel: "iv_liga",
    weeklyMatches: true,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...overrides,
  } as Profile;
}

function record(kind: CycleRecommendationKind): CycleStartRecord {
  return {
    kind,
    youth: false,
    reviewedCycleId: "old-cycle",
    review: {
      startDate: "2026-05-18",
      endDate: "2026-06-14",
      planned: 16,
      done: 15,
      adherencePct: 94,
      avgRpe: 8.4,
      rpeRise: null,
      feeling: "unknown",
      healthFlag: false,
      progress: "unknown",
      progressImproved: 0,
      progressMeasured: 0,
      youth: false,
      phaseNext: "inseason",
      recommendation: kind,
    },
  };
}

function weekLabels(plan: SessionDay[]): string[] {
  // The fixed Sunday match makes Monday MD+1 (no block label), so read the week's first label.
  return [0, 7, 14, 21].map(
    (i) => plan.slice(i, i + 7).find((day) => day.blockPhaseLabel)?.blockPhaseLabel ?? "",
  );
}

describe("silnik planu używa reguły startu cyklu", () => {
  it("po ciężkim cyklu pierwszy tydzień nowego planu jest odciążeniem", () => {
    const base = weekLabels(generatePlan(profile(), START, 28));
    const lighter = weekLabels(generatePlan(profile({ cycleStart: record("deload") }), START, 28));
    expect(base[0]).toMatch(/Tydz\. 1 — kalibracja/);
    expect(lighter[0]).toMatch(/Tydz\. 1 — deload/);
    expect(lighter[1]).toMatch(/Tydz\. 2 — kalibracja/);
  });

  it("utrzymanie: w planie nie ma tygodnia przeciążenia", () => {
    const labels = weekLabels(generatePlan(profile({ cycleStart: record("maintain") }), START, 28));
    expect(labels.join("|")).not.toMatch(/przeciążenie/);
    expect(weekLabels(generatePlan(profile(), START, 28)).join("|")).toMatch(/przeciążenie/);
  });

  it("lżejszy start: mniej własnych sesji i niższe obciążenie pierwszego tygodnia", () => {
    const solo: Partial<Profile> = {
      clubTrainingDays: [],
      individualTrainingDays: [1, 2, 3, 4, 5, 6],
    };
    const firstWeek = (plan: SessionDay[]) => {
      const week = plan.slice(0, 7);
      const own = week
        .flatMap((day) => [day, day.secondSession])
        .filter((s): s is SessionDay => Boolean(s) && s!.dayType === "training");
      return { own: own.length, score: week[0].weekMeta?.weeklyLoadScore ?? 0 };
    };
    const base = firstWeek(generatePlan(profile(solo), START, 28));
    for (const kind of ["health", "deload", "transition"] as const) {
      const lighter = firstWeek(
        generatePlan(profile({ ...solo, cycleStart: record(kind) }), START, 28),
      );
      expect(lighter.own, kind).toBeLessThan(base.own);
      expect(lighter.score, kind).toBeLessThan(base.score);
    }
  });

  it("reguła i podsumowanie są zapisane na każdym dniu planu", async () => {
    const start = record("progress");
    const plan = await generatePlanAsync(profile({ cycleStart: start }), START, 7);
    expect(plan.every((day) => day.cycleStart === start)).toBe(true);
    const plain = await generatePlanAsync(profile(), START, 7);
    expect(plain.some((day) => day.cycleStart)).toBe(false);
  });
});
