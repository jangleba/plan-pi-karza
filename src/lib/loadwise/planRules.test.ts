import { describe, it, expect } from "vitest";
import { generatePlan, weekRanges } from "./planEngine";
import {
  MAIN_GOAL_RULES,
  computeWeeklyLoadScore,
  validateGeneratedWeek,
  countWeekRoles,
  countLimitationSessions,
  blockWeekOf,
  weekThemeFor,
} from "./planRules";
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

describe("rule-based week layer — progresja bloku", () => {
  it("weekMeta jest dołączane do każdej sesji z tematem bloku", () => {
    const plan = generatePlan(baseProfile({}), START, 28);
    for (const s of plan) {
      expect(s.weekMeta).toBeDefined();
      expect(s.weekMeta!.weekTheme).toBe(weekThemeFor(s.weekMeta!.blockWeek));
    }
  });

  it("load rośnie w1<w2<w3 i maleje w4<w3 (deload niepusty)", () => {
    const plan = generatePlan(baseProfile({}), START, 28);
    const scores = fullWeeks(plan).map((w) => computeWeeklyLoadScore(w));
    expect(scores).toHaveLength(4);
    expect(scores[0]).toBeLessThan(scores[1]);
    expect(scores[1]).toBeLessThan(scores[2]);
    expect(scores[3]).toBeLessThan(scores[2]);
    expect(scores[3]).toBeGreaterThan(0);
  });

  it("tydzień 3 ma najwyższy load", () => {
    const plan = generatePlan(baseProfile({ goal: "speed" }), START, 28);
    const scores = fullWeeks(plan).map((w) => computeWeeklyLoadScore(w));
    expect(Math.max(...scores)).toBe(scores[2]);
  });

  it("tygodnie 1–4 nie mają identycznego rozkładu", () => {
    const weeks = fullWeeks(generatePlan(baseProfile({}), START, 28));
    const sigs = weeks.map((w) => w.map((d) => `${d.sessionType}:${d.durationMin}`).join("|"));
    expect(new Set(sigs).size).toBe(4);
  });
});

describe("rule-based week layer — cel główny i walidacja", () => {
  const goals: Goal[] = ["speed", "strength", "endurance", "power", "general"];

  it("każdy cel ma obowiązkowy typ sesji w pełnym tygodniu", () => {
    for (const goal of goals) {
      const plan = generatePlan(baseProfile({ goal }), START, 28);
      for (const week of fullWeeks(plan)) {
        const counts = countWeekRoles(week, goal);
        expect(counts.mandatory).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("każdy pełny tydzień ma minimum 1 wydolność, niezależnie od liczby klubowych", () => {
    for (const club of [[2, 5], [2, 4, 6], [1, 3, 5, 6]]) {
      const individual = [1, 2, 3, 4, 5, 6].filter((d) => !club.includes(d));
      const plan = generatePlan(
        baseProfile({ goal: "endurance", clubTrainingDays: club, individualTrainingDays: individual }),
        START,
        28,
      );
      for (const week of fullWeeks(plan)) {
        const counts = countWeekRoles(week, "endurance");
        expect(counts.endurance).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("żaden pełny tydzień nie zostaje pokazany jako invalid", () => {
    for (const goal of goals) {
      const plan = generatePlan(baseProfile({ goal }), START, 28);
      for (const week of fullWeeks(plan)) {
        expect(week[0].weekMeta!.validationStatus).not.toBe("invalid");
      }
    }
  });

  it("regeneracja nie dominuje pełnego tygodnia bez powodu", () => {
    for (const week of fullWeeks(generatePlan(baseProfile({ goal: "endurance" }), START, 28))) {
      const c = countWeekRoles(week, "endurance");
      expect(c.recovery).toBeLessThanOrEqual(c.mandatory + c.support);
    }
  });

  it("validateGeneratedWeek wykrywa brak wydolności", () => {
    const res = validateGeneratedWeek([], {
      goal: "endurance",
      isFullWeek: true,
      hasMatch: false,
      blockWeek: 1,
    });
    expect(res.status).toBe("invalid");
    expect(res.errors).toContain("missing-endurance");
  });
});

describe("rule-based week layer — profil zawodnika", () => {
  it("ból kolana → low-impact endurance zamiast ciężkiego biegania", () => {
    const plan = generatePlan(
      baseProfile({ goal: "endurance", painInjury: true, painLocations: ["knee"] }),
      START,
      28,
    );
    const endurance = plan.filter((d) => d.classification?.category === "endurance_conditioning");
    expect(endurance.length).toBeGreaterThan(0);
    const lowImpact = endurance.filter((d) =>
      ["bike_conditioning", "pool_conditioning", "low_impact_conditioning", "easy_aerobic"].includes(
        d.classification?.subcategory ?? "",
      ),
    );
    expect(lowImpact.length).toBeGreaterThan(0);
  });

  it("14-latek beginner nie dostaje agresywnego HIIT jako domyślnej wydolności", () => {
    const plan = generatePlan(
      baseProfile({ goal: "endurance", age: 14, level: "beginner", competitionLevel: "academy" }),
      START,
      28,
    );
    const hiit = plan.filter((d) => d.classification?.subcategory === "extensive_intervals" || d.classification?.subcategory === "aerobic_intervals");
    // Dopuszczamy 0; twarda zasada: brak wysokiej intensywności interwałowej dla beginnera 14 lat.
    for (const d of hiit) {
      expect(d.intensity).not.toBe("wysoka");
    }
  });

  it("MAIN_GOAL_RULES pokrywa wszystkie cele", () => {
    const goals: Goal[] = [
      "speed",
      "strength",
      "endurance",
      "power",
      "agility",
      "general",
      "mobility",
      "return",
      "matchready",
    ];
    for (const g of goals) expect(MAIN_GOAL_RULES[g]).toBeDefined();
  });

  it("blockWeekOf mapuje tygodnie na blok 1..4", () => {
    expect(blockWeekOf(0)).toBe(1);
    expect(blockWeekOf(1)).toBe(2);
    expect(blockWeekOf(2)).toBe(3);
    expect(blockWeekOf(3)).toBe(4);
    expect(blockWeekOf(4)).toBe(1);
  });
});

describe("cel główny + ograniczenie — twarde minima", () => {
  const START2 = new Date("2026-07-13T00:00:00");
  const full = (plan: ReturnType<typeof generatePlan>) =>
    weekRanges(START2, plan.length)
      .filter((r) => r.end - r.start === 7)
      .map((r) => plan.slice(r.start, r.end));

  it("każdy cel ma min. mandatoryCount bodźców powiązanych z celem", () => {
    for (const goal of ["speed", "strength", "endurance", "power", "general"] as Goal[]) {
      for (const week of full(generatePlan(baseProfile({ goal }), START2, 28))) {
        expect(countWeekRoles(week, goal).mandatory).toBeGreaterThanOrEqual(
          MAIN_GOAL_RULES[goal].mandatoryCount,
        );
      }
    }
  });

  it("ograniczenie dokłada min. 1 sesję ponad cel (gdy kategoria inna niż cel)", () => {
    for (const week of full(
      generatePlan(baseProfile({ goal: "speed", secondaryLimiter: "strength" }), START2, 28),
    )) {
      expect(countWeekRoles(week, "speed").mandatory).toBeGreaterThanOrEqual(2);
      expect(countLimitationSessions(week, "strength")).toBeGreaterThanOrEqual(1);
    }
  });
});
