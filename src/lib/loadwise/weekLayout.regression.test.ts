import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import {
  classifySession,
  isEnduranceSession,
  isHeavyLegsSession,
  isSpeedSession,
} from "./sessionClassification";
import type {
  Goal,
  Level,
  Position,
  Profile,
  SeasonPhase,
  SecondaryLimiter,
  SessionDay,
} from "./types";

/**
 * Audyt układu tygodnia (2026-11-10): seedowany skan profili na końcowym
 * wyjściu generatora. Każdy profil to inna kombinacja wieku, poziomu, celu,
 * klubu, meczów (co tydzień lub pojedynczy), dostępności, sprzętu i okresu.
 */
const START = new Date("2026-11-16T00:00:00"); // poniedziałek
const PROFILES = 300;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function auditProfile(index: number): Profile {
  const r = rng(1000 + index * 7919);
  const pick = <T>(items: T[]): T => items[Math.floor(r() * items.length)];
  const subset = (days: number[], p: number) => days.filter(() => r() < p);
  const age = pick([13, 14, 15, 16, 17, 18, 21, 26, 33]);
  const level = pick<Level>(["beginner", "intermediate", "advanced", "elite"]);
  const usualMatchDay = pick<Profile["usualMatchDay"]>([6, 7, 7, 6, 3, "no_fixed_day", null]);
  const club = subset([1, 2, 3, 4, 5], pick([0, 0.3, 0.5, 0.7])).filter(
    (day) => day !== usualMatchDay,
  );
  const seasonPhase = pick<SeasonPhase>([
    "inseason",
    "inseason",
    "preseason",
    "offseason",
    "transition",
    "return_injury",
  ]);
  const individual = subset([1, 2, 3, 4, 5, 6, 7], pick([0.4, 0.7, 1]));
  const fixedDay = typeof usualMatchDay === "number" ? usualMatchDay : null;
  const matchDates: string[] = [];
  if (usualMatchDay === "no_fixed_day" && r() < 0.7)
    matchDates.push(pick(["2026-11-19", "2026-11-21", "2026-11-22"]));
  // Aplikacja zna najwyżej dwa najbliższe mecze (potwierdzone w tygodniowym oknie).
  if (fixedDay) matchDates.push(`2026-11-${15 + fixedDay}`, `2026-11-${22 + fixedDay}`);
  const unavailableDays =
    r() < 0.25 ? [pick([1, 3, 5, 7])].filter((d) => d !== fixedDay && !club.includes(d)) : [];
  return {
    name: "Audyt tygodnia",
    age,
    level,
    position: pick<Position>(["goalkeeper", "defender", "midfielder", "forward"]),
    goal: pick<Goal>([
      "speed",
      "strength",
      "endurance",
      "power",
      "agility",
      "general",
      "mobility",
      "return",
      "matchready",
    ]),
    secondaryLimiter: pick<SecondaryLimiter | null>([
      null,
      null,
      "speed",
      "strength",
      "endurance",
      "cod",
      "power",
      "ball",
      "fatigue",
      "return",
    ]),
    clubTrainingDays: club,
    individualTrainingDays: individual.length ? individual : [2, 4],
    unavailableDays,
    usualMatchDay,
    matchDate: matchDates[0] ?? null,
    matchDates,
    equipment: r() < 0.5 ? [] : ["ball", "cones", "mini_bands"],
    homeEquipment: r() < 0.3 ? ["dumbbells", "bands"] : [],
    painInjury: seasonPhase === "return_injury" || r() < 0.08,
    doubleSessionsAllowed: pick<Profile["doubleSessionsAllowed"]>([
      "no",
      "light_only",
      "yes_if_safe",
    ]),
    guardianConsent: age < 18,
    healthPersonalizationEnabled: r() < 0.7,
    onboardingComplete: true,
    createdAt: "2026-10-01",
    seasonPhase,
    seasonPhaseOverride: r() < 0.5,
    seasonStage: fixedDay ? "match_week" : null,
    competitionLevel: pick<Profile["competitionLevel"]>([
      "academy",
      "b_klasa",
      "okregowka",
      "iv_liga",
      "iii_liga",
      "semi_pro",
      "pro",
    ]),
    weeklyMatches: fixedDay !== null,
    hasGym: r() < 0.6,
    hasPitch: r() < 0.6,
    hasSprintSpace: r() < 0.7,
  };
}

const hasWork = (session: SessionDay | null | undefined): session is SessionDay =>
  !!session && session.dayType !== "rest" && session.durationMin > 0;
const external = (session: SessionDay) =>
  session.dayType === "match" || session.dayType === "club" || !!session.externalCommitment;
const sessionsOf = (day: SessionDay) => [day, day.secondSession].filter(hasWork);
const busy = (day: SessionDay) => sessionsOf(day).length > 0;

describe("układ tygodnia — seedowany audyt końcowego planu", () => {
  beforeAll(() => vi.spyOn(console, "debug").mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  const plans = Array.from({ length: PROFILES }, (_, index) => {
    const profile = auditProfile(index);
    return { index, profile, plan: generatePlan(profile, START, 28, 0) };
  });

  it("każdy pełny tydzień ma dzień wolny i nie ma 7 dni treningu z rzędu", () => {
    const failures: string[] = [];
    for (const { index, plan } of plans) {
      for (let week = 0; week < 4; week++) {
        const days = plan.slice(week * 7, week * 7 + 7);
        if (days.every(busy)) failures.push(`#${index} tydzień od ${days[0].date}`);
      }
      let streak = 0;
      for (const day of plan) {
        streak = busy(day) ? streak + 1 : 0;
        if (streak === 7) failures.push(`#${index} 7 dni z rzędu do ${day.date}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("młodsi (≤15) i początkujący mają najwyżej 4 własne treningi w tygodniu", () => {
    const failures: string[] = [];
    for (const { index, profile, plan } of plans) {
      if (profile.age >= 16 && profile.level !== "beginner") continue;
      for (let week = 0; week < 4; week++) {
        const own = plan
          .slice(week * 7, week * 7 + 7)
          .flatMap(sessionsOf)
          .filter((session) => !external(session));
        if (own.length > 4) failures.push(`#${index} tydzień ${week + 1}: ${own.length}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("dzień po meczu: bez sprintu, mocnego biegu i (poza zaawansowanymi) bez siły nóg", () => {
    const failures: string[] = [];
    for (const { index, profile, plan } of plans) {
      plan.forEach((day, dayIndex) => {
        if (dayIndex === 0 || plan[dayIndex - 1].dayType !== "match" || day.dayType === "match")
          return;
        if (day.mdLabel !== "MD+1") failures.push(`#${index} ${day.date} etykieta ${day.mdLabel}`);
        for (const session of sessionsOf(day).filter((s) => !external(s))) {
          if (
            isSpeedSession(session) ||
            (session.intensity === "wysoka" && !classifySession(session).isGym)
          )
            failures.push(`#${index} ${day.date} ${session.title}`);
          if (isEnduranceSession(session) && session.intensity !== "niska")
            failures.push(`#${index} ${day.date} ${session.title}`);
          if (
            isHeavyLegsSession(session) &&
            profile.level !== "advanced" &&
            profile.level !== "elite"
          )
            failures.push(`#${index} ${day.date} nogi: ${session.title}`);
        }
      });
    }
    expect(failures).toEqual([]);
  });

  it("nigdy dwa dni wydolności z rzędu", () => {
    const failures: string[] = [];
    for (const { index, plan } of plans) {
      for (let dayIndex = 1; dayIndex < plan.length; dayIndex++) {
        const endurance = (day: SessionDay) =>
          sessionsOf(day).some((s) => !external(s) && isEnduranceSession(s));
        if (endurance(plan[dayIndex - 1]) && endurance(plan[dayIndex]))
          failures.push(`#${index} ${plan[dayIndex].date}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("własna sesja nigdy nie jest liczona jako mecz ani klub", () => {
    const failures: string[] = [];
    for (const { index, plan } of plans)
      for (const day of plan)
        for (const session of sessionsOf(day).filter((s) => !external(s))) {
          const category = classifySession(session).category;
          if (category === "match" || category === "club")
            failures.push(`#${index} ${day.date} ${session.title} → ${category}`);
        }
    expect(failures).toEqual([]);
  });
});

describe("układ tygodnia — przypadki z audytu", () => {
  const weeklySaturday: Profile = {
    ...auditProfile(0),
    age: 18,
    level: "elite",
    goal: "general",
    clubTrainingDays: [2, 3, 5],
    individualTrainingDays: [1, 2, 4, 5, 7],
    unavailableDays: [],
    usualMatchDay: 6,
    matchDate: "2026-11-21",
    matchDates: ["2026-11-21", "2026-11-28"],
    weeklyMatches: true,
    seasonPhase: "inseason",
    seasonPhaseOverride: false,
    painInjury: false,
    hasGym: true,
    hasSprintSpace: true,
  };

  it("przy meczach co tydzień niedziela po meczu to MD+1, a nie MD-6 z pełnym sprintem", () => {
    const sunday = generatePlan(weeklySaturday, START, 7).find((d) => d.date === "2026-11-22")!;
    expect(sunday.mdLabel).toBe("MD+1");
    expect(sessionsOf(sunday).some(isSpeedSession)).toBe(false);
  });

  it("lekka góra ciała nie jest klasyfikowana jako ciężkie nogi", () => {
    const upper = {
      ...generatePlan(weeklySaturday, START, 7)[0],
      title: "Lekki tułów i góra ciała",
      sessionType: "Siła — góra ciała i tułów",
      intensity: "umiarkowana",
      goalOfSession: "Krótka praca góry ciała i tułowia.",
      sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
      structuredSections: undefined,
      classification: undefined,
    } as SessionDay;
    expect(classifySession(upper).isGym).toBe(true);
    expect(isHeavyLegsSession(upper)).toBe(false);
  });
});
