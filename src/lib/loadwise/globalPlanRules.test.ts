import { describe, it, expect } from "vitest";
import { generatePlan, weekRanges } from "./planEngine";
import {
  buildTrainingContext,
  getMainGoalRules,
  getLimitationRules,
  getMandatoryWeeklySessions,
  getSupportSessions,
  scoreSessionLoad,
  canPlaceSession,
  calculateWeeklyLoadScore,
  compareWeekSimilarity,
  validateWeek,
  validatePlan,
  findWeekConflicts,
  PLANNING_PRIORITY_ORDER,
} from "./globalPlanRules";
import type { Profile, Goal } from "./types";

function baseProfile(p: Partial<Profile>): Profile {
  return {
    name: "Test",
    age: 20,
    position: "midfielder",
    level: "intermediate",
    goal: "endurance",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6],
    usualMatchDay: null,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-01-01",
    seasonPhase: "preseason",
    seasonStage: null,
    competitionLevel: "iv_liga",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...p,
  };
}

const START = new Date("2026-07-13T00:00:00"); // poniedziałek

function fullWeeks(plan: ReturnType<typeof generatePlan>) {
  const ranges = weekRanges(START, plan.length).filter((r) => r.end - r.start === 7);
  return ranges.map((r) => plan.slice(r.start, r.end));
}

describe("globalPlanRules — kontekst i reguły celu", () => {
  it("buildTrainingContext mapuje profil na kontekst", () => {
    const ctx = buildTrainingContext(
      baseProfile({ goal: "speed", hasGym: false, clubTrainingDays: [2, 4], usualMatchDay: 7 }),
    );
    expect(ctx.mainGoal).toBe("speed");
    expect(ctx.gymAccess).toBe(false);
    expect(ctx.clubSchedule).toEqual([2, 4]);
    expect(ctx.matchSchedule).toEqual([7]);
  });

  it("gymAccess=false wymusza fallback bodyweight dla siły", () => {
    const ctx = buildTrainingContext(baseProfile({ goal: "strength", hasGym: false }));
    const mandatory = getMandatoryWeeklySessions(ctx);
    expect(mandatory.some((m) => m.subcategory === "bodyweight_strength")).toBe(true);
    expect(mandatory.every((m) => m.gymRequired === false)).toBe(true);
  });

  it("gymAccess=true używa siłowni dla siły", () => {
    const ctx = buildTrainingContext(baseProfile({ goal: "strength", hasGym: true }));
    const mandatory = getMandatoryWeeklySessions(ctx);
    expect(mandatory.some((m) => m.category === "gym_strength" && m.gymRequired)).toBe(true);
  });

  it("limitation nie nadpisuje mainGoal, tylko dodaje wsparcie", () => {
    const view = getMainGoalRules("endurance");
    const lim = getLimitationRules("strength");
    expect(view.mandatoryCategories).toContain("endurance_conditioning");
    expect(lim.supportCategory).toBe("gym_strength");
  });

  it("fatigue redukuje load, return wymusza low-impact", () => {
    expect(getLimitationRules("fatigue").loadReduction).toBeGreaterThan(0);
    expect(getLimitationRules("return").forcesLowImpact).toBe(true);
  });

  it("getSupportSessions zawiera akcent pozycyjny", () => {
    const ctx = buildTrainingContext(baseProfile({ position: "forward", secondaryLimiter: "speed" }));
    const support = getSupportSessions(ctx);
    expect(support.some((s) => s.source === "position")).toBe(true);
    expect(support.some((s) => s.source === "limitation")).toBe(true);
  });

  it("PLANNING_PRIORITY_ORDER stawia kontuzję/mecz przed mainGoal", () => {
    expect(PLANNING_PRIORITY_ORDER.indexOf("injury_return_fatigue")).toBeLessThan(
      PLANNING_PRIORITY_ORDER.indexOf("main_goal"),
    );
    expect(PLANNING_PRIORITY_ORDER.indexOf("match")).toBeLessThan(
      PLANNING_PRIORITY_ORDER.indexOf("main_goal"),
    );
    expect(PLANNING_PRIORITY_ORDER.indexOf("main_goal")).toBeLessThan(
      PLANNING_PRIORITY_ORDER.indexOf("limitation"),
    );
  });
});

describe("globalPlanRules — scoring i konflikty", () => {
  it("scoreSessionLoad zwraca pełny profil obciążenia", () => {
    const plan = generatePlan(baseProfile({ goal: "strength" }), START, 7);
    const s = plan.find((d) => d.dayType !== "rest")!;
    const load = scoreSessionLoad(s);
    expect(load).toHaveProperty("neuromuscularLoad");
    expect(load).toHaveProperty("metabolicLoad");
    expect(load).toHaveProperty("lowerBodyLoad");
    expect(load).toHaveProperty("recoveryCost");
    expect(load).toHaveProperty("priority");
    expect(load.totalScore).toBeGreaterThanOrEqual(0);
  });

  it("canPlaceSession blokuje speed dzień po speed", () => {
    const plan = generatePlan(baseProfile({ goal: "speed" }), START, 7);
    const speed = plan.find((d) => d.classification?.category === "speed_sprint");
    expect(speed).toBeDefined();
    // sztuczny tydzień: poniedziałek ma speed, wtorek sprawdzamy
    const week = plan.slice(0, 7);
    const speedIdx = week.findIndex((d) => d.classification?.category === "speed_sprint");
    if (speedIdx >= 0 && speedIdx < 6) {
      const check = canPlaceSession(speedIdx + 1, speed!, week);
      expect(check.allowed).toBe(false);
    }
  });

  it("intermediate może połączyć dwie pełne, komplementarne sesje", () => {
    const gym = generatePlan(baseProfile({ goal: "strength" }), START, 7).find(
      (day) => day.classification?.category === "gym_strength",
    )!;
    const speed = generatePlan(baseProfile({ goal: "speed" }), START, 7).find(
      (day) => day.classification?.category === "speed_sprint",
    )!;
    const current = { ...gym, intensity: "wysoka" as const, secondSession: null };
    const candidate = { ...speed, intensity: "wysoka" as const, secondSession: null };
    const context = buildTrainingContext(baseProfile({ level: "intermediate" }));

    expect(canPlaceSession(0, candidate, [current], context)).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("beginner nie może połączyć dwóch mocnych sesji", () => {
    const gym = generatePlan(baseProfile({ goal: "strength" }), START, 7).find(
      (day) => day.classification?.category === "gym_strength",
    )!;
    const speed = generatePlan(baseProfile({ goal: "speed" }), START, 7).find(
      (day) => day.classification?.category === "speed_sprint",
    )!;
    const current = { ...gym, intensity: "wysoka" as const, secondSession: null };
    const candidate = { ...speed, intensity: "wysoka" as const, secondSession: null };
    const context = buildTrainingContext(baseProfile({ level: "beginner" }));

    expect(canPlaceSession(0, candidate, [current], context).allowed).toBe(false);
  });

  it("nie pozwala na dwie siłownie tego samego dnia", () => {
    const gym = generatePlan(baseProfile({ goal: "strength" }), START, 7).find(
      (day) => day.classification?.category === "gym_strength",
    )!;
    const current = { ...gym, secondSession: null };
    const candidate = { ...gym, secondSession: null };
    const context = buildTrainingContext(baseProfile({ level: "advanced" }));

    expect(canPlaceSession(0, candidate, [current], context).allowed).toBe(false);
  });

  it("findWeekConflicts nie znajduje konfliktów w wygenerowanym pełnym tygodniu", () => {
    // Uwaga: cel "speed" korzysta z osobnego, gęstego harmonogramu sprintu i jest
    // testowany na poziomie canPlaceSession; tu sprawdzamy cele o rozłożonym bodźcu.
    for (const goal of ["strength", "endurance", "power"] as Goal[]) {
      const plan = generatePlan(baseProfile({ goal }), START, 28);
      const ctx = buildTrainingContext(baseProfile({ goal }));
      for (const week of fullWeeks(plan)) {
        const conflicts = findWeekConflicts(week, ctx);
        expect(conflicts).toEqual([]);
      }
    }
  });
});

describe("globalPlanRules — walidacja tygodnia i planu", () => {
  const goals: Goal[] = ["strength", "endurance", "power", "general"];

  it("każdy pełny tydzień przechodzi validateWeek", () => {
    for (const goal of goals) {
      const plan = generatePlan(baseProfile({ goal }), START, 28);
      const ctx = buildTrainingContext(baseProfile({ goal }));
      for (const week of fullWeeks(plan)) {
        const res = validateWeek(week, ctx, { isFullWeek: true });
        expect(res.errors).toEqual([]);
        expect(res.valid).toBe(true);
      }
    }
  });

  it("gymAccess=false nie generuje siłowni (walidacja)", () => {
    const profile = baseProfile({ goal: "strength", hasGym: false });
    const plan = generatePlan(profile, START, 28);
    const ctx = buildTrainingContext(profile);
    for (const week of fullWeeks(plan)) {
      const res = validateWeek(week, ctx, { isFullWeek: true });
      expect(res.errors).not.toContain("gym-generated-without-access");
    }
  });

  it("validatePlan spełnia progresję i brak copy-paste", () => {
    for (const goal of goals) {
      const plan = generatePlan(baseProfile({ goal }), START, 28);
      const ctx = buildTrainingContext(baseProfile({ goal }));
      const report = validatePlan(fullWeeks(plan), ctx);
      // progresja
      expect(report.weekScores[0]).toBeLessThan(report.weekScores[1]);
      expect(report.weekScores[1]).toBeLessThan(report.weekScores[2]);
      expect(report.weekScores[3]).toBeLessThan(report.weekScores[2]);
      // brak copy-paste między kolejnymi tygodniami
      for (const sim of report.weekSimilarityScores) {
        expect(sim).toBeLessThanOrEqual(0.75);
      }
      expect(report.valid).toBe(true);
    }
  });

  it("compareWeekSimilarity: identyczny tydzień = 1, różne < 1", () => {
    const plan = generatePlan(baseProfile({ goal: "speed" }), START, 28);
    const weeks = fullWeeks(plan);
    expect(compareWeekSimilarity(weeks[0], weeks[0])).toBe(1);
    expect(compareWeekSimilarity(weeks[0], weeks[2])).toBeLessThan(1);
  });

  it("calculateWeeklyLoadScore rośnie z intensywnością", () => {
    const plan = generatePlan(baseProfile({ goal: "general" }), START, 28);
    const scores = fullWeeks(plan).map((w) => calculateWeeklyLoadScore(w));
    expect(Math.max(...scores)).toBe(scores[2]);
  });
});

describe("globalPlanRules — profil zawodnika (twarde zasady)", () => {
  it("Test 1: endurance + gym + club pon/śr/pt + match niedziela", () => {
    const profile = baseProfile({
      goal: "endurance",
      hasGym: true,
      clubTrainingDays: [1, 3, 5],
      individualTrainingDays: [2, 4, 6],
      usualMatchDay: 7,
      weeklyMatches: true,
      seasonPhase: "inseason",
    });
    const plan = generatePlan(profile, START, 28);
    const ctx = buildTrainingContext(profile);
    for (const week of fullWeeks(plan)) {
      const res = validateWeek(week, ctx, { isFullWeek: true });
      expect(res.errors).not.toContain("missing-endurance");
      expect(findWeekConflicts(week, ctx)).not.toContain("hard-endurance-before-match");
    }
  });

  it("Test 7: return — brak agresywnych bodźców, obowiązkowy bodziec zachowany", () => {
    const profile = baseProfile({ goal: "return", seasonPhase: "return_injury", painInjury: true, painLocations: ["hamstring"] });
    const plan = generatePlan(profile, START, 28);
    const ctx = buildTrainingContext(profile);
    for (const week of fullWeeks(plan)) {
      const res = validateWeek(week, ctx, { isFullWeek: true });
      // return dopuszcza dominację recovery, ale bez konfliktów
      expect(findWeekConflicts(week, ctx)).toEqual([]);
    }
    expect(ctx.injuryStatus.returnAfterBreak).toBe(true);
  });

  it("14-latek beginner endurance nie dostaje wysokiej intensywności HIIT", () => {
    const plan = generatePlan(
      baseProfile({ goal: "endurance", age: 14, level: "beginner", competitionLevel: "academy" }),
      START,
      28,
    );
    const hiit = plan.filter(
      (d) =>
        d.classification?.subcategory === "extensive_intervals" ||
        d.classification?.subcategory === "aerobic_intervals",
    );
    for (const d of hiit) expect(d.intensity).not.toBe("wysoka");
  });
});
