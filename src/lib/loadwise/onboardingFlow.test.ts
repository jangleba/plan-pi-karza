import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { planWindowDays } from "./planWindow";
import { rememberedMatchWeekday } from "./matchSchedule";
import {
  answersFromProfile,
  onboardingPlanFacts,
  trainingFieldsFromAnswers,
  type OnboardingAnswers,
} from "./onboardingFlow";
import type { Profile } from "./types";

/**
 * The onboarding asks only questions that shape the plan. Each answer goes
 * through the same mapping the screen uses (trainingFieldsFromAnswers) and
 * must change the generated plan, or — for the weekly match — the remembered
 * match day used when the next week is confirmed.
 */

const NOV = new Date(2026, 10, 16); // Monday, in season
const JUNE = new Date(2026, 5, 15); // Monday, after the season

const answers = (patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  position: "midfielder",
  level: "intermediate",
  competitionLevel: "iv_liga",
  goal: "speed",
  secondaryLimiter: "endurance",
  clubDays: [2, 4],
  unavailableDays: [],
  matchDate: "2026-11-21",
  noMatch: false,
  weeklyMatches: true,
  seasonPhase: "inseason",
  seasonPhaseOverride: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  hasWall: false,
  equipment: [],
  doubleSessionsAllowed: "no",
  ...patch,
});

function profileOf(a: OnboardingAnswers, age: number, today: Date): Profile {
  return {
    name: "Test",
    age,
    painInjury: false,
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-10-01",
    ...trainingFieldsFromAnswers(a, null, today),
  } as Profile;
}

const signature = (profile: Profile, start: Date) =>
  JSON.stringify(
    generatePlan(profile, start, 28).map((day) => [
      day.date,
      day.dayType,
      day.title,
      day.intensity,
      day.durationMin,
      day.secondSession?.title ?? null,
      day.sections ?? null,
      day.structuredSections ?? null,
    ]),
  );

type Base = { name: string; age: number; start: Date; answers: OnboardingAnswers };
const BASES: Base[] = [
  { name: "senior w sezonie", age: 22, start: NOV, answers: answers() },
  {
    name: "senior bez siłowni",
    age: 22,
    start: NOV,
    answers: answers({ hasGym: false, hasPitch: false, goal: "strength" }),
  },
  {
    name: "16 lat, akademia",
    age: 16,
    start: NOV,
    answers: answers({ level: "beginner", competitionLevel: "academy", goal: "general" }),
  },
  {
    name: "przerwa letnia",
    age: 20,
    start: JUNE,
    answers: answers({
      matchDate: "",
      noMatch: true,
      weeklyMatches: false,
      seasonPhase: "offseason",
      level: "advanced",
    }),
  },
];

/** One alternative answer per question; the plan must change for at least one base athlete. */
const QUESTIONS: Array<[string, Partial<OnboardingAnswers>]> = [
  ["pozycja", { position: "goalkeeper" }],
  ["poziom", { level: "elite" }],
  ["poziom rozgrywkowy", { competitionLevel: "pro" }],
  ["cel", { goal: "endurance" }],
  ["ograniczenie", { secondaryLimiter: "strength" }],
  ["treningi w klubie", { clubDays: [1, 3, 5] }],
  ["dni bez treningu", { unavailableDays: [6, 7] }],
  ["data meczu", { matchDate: "2026-11-19" }],
  ["brak meczu", { matchDate: "", noMatch: true }],
  ["okres", { seasonPhase: "transition" }],
  ["siłownia", { hasGym: false }],
  ["boisko", { hasPitch: false }],
  ["prosta do sprintu", { hasSprintSpace: false }],
  ["ściana do podań", { hasWall: true }],
  ["sprzęt", { equipment: ["Hantle", "Guma oporowa"] }],
  ["dwa treningi dziennie", { doubleSessionsAllowed: "yes_if_safe" }],
];

describe("every onboarding answer drives the plan", () => {
  beforeAll(() => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterAll(() => vi.restoreAllMocks());
  const baseSignatures = new Map<Base, string>();
  const baseSig = (base: Base) => {
    if (!baseSignatures.has(base))
      baseSignatures.set(
        base,
        signature(profileOf(base.answers, base.age, base.start), base.start),
      );
    return baseSignatures.get(base)!;
  };

  it.each(QUESTIONS)(
    "%s",
    (_name, patch) => {
      const changed = BASES.some((base) => {
        const next = { ...base.answers, ...patch };
        return signature(profileOf(next, base.age, base.start), base.start) !== baseSig(base);
      });
      expect(changed).toBe(true);
    },
    120_000,
  );

  it("covers every answer the screens ask for", () => {
    const asked = new Set(QUESTIONS.flatMap(([, patch]) => Object.keys(patch)));
    for (const key of Object.keys(answers()) as Array<keyof OnboardingAnswers>) {
      if (key === "weeklyMatches" || key === "seasonPhaseOverride") continue; // see below
      expect(asked, key).toContain(key);
    }
  });

  it("a weekly match is remembered as the usual match day for the next weeks", () => {
    const weekly = trainingFieldsFromAnswers(answers({ matchDate: "2026-11-21" }), null, NOV);
    expect(weekly.usualMatchDay).toBe(6);
    expect(weekly.weeklyMatches).toBe(true);
    expect(rememberedMatchWeekday([], "2026-11-23", weekly.usualMatchDay)).toBe(6);
    const once = trainingFieldsFromAnswers(answers({ weeklyMatches: false }), null, NOV);
    expect(once.usualMatchDay).toBe("no_fixed_day");
    expect(rememberedMatchWeekday([], "2026-11-23", once.usualMatchDay)).toBeNull();
  });

  it("an unusual season (override) is used as chosen", () => {
    const base = BASES[0];
    const chosen = { ...base.answers, seasonPhase: "offseason" as const };
    const ignored = signature(profileOf(chosen, base.age, base.start), base.start);
    const kept = signature(
      profileOf({ ...chosen, seasonPhaseOverride: true }, base.age, base.start),
      base.start,
    );
    expect(kept).not.toBe(ignored);
  });
});

describe("answers → profile", () => {
  it("keeps rules for days, double sessions, wall and season", () => {
    const fields = trainingFieldsFromAnswers(
      answers({
        level: "beginner",
        doubleSessionsAllowed: "yes_if_safe",
        clubDays: [4, 2, 2],
        unavailableDays: [2, 7],
        hasWall: true,
        equipment: ["Hantle"],
        noMatch: true,
      }),
      null,
      NOV,
    );
    expect(fields.doubleSessionsAllowed).toBe("light_only");
    expect(fields.clubTrainingDays).toEqual([2, 4]);
    expect(fields.unavailableDays).toEqual([7]);
    expect(fields.individualTrainingDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fields.equipment).toEqual(["Hantle", "rebounder"]);
    expect(fields.matchDate).toBeNull();
    expect(fields.matchDates).toEqual([]);
    expect(fields.weeklyMatches).toBe(false);
    expect(fields.usualMatchDay).toBe("no_fixed_day");
    expect(fields.seasonStage).toBeNull();
  });

  it("keeps saved later matches when the next match date is unchanged", () => {
    const fields = trainingFieldsFromAnswers(
      answers({ matchDate: "2026-11-21" }),
      { matchDate: "2026-11-21", matchDates: ["2026-11-21", "2026-11-28"] },
      NOV,
    );
    expect(fields.matchDates).toEqual(["2026-11-21", "2026-11-28"]);
  });

  it("round-trips a saved profile into the same answers", () => {
    const a = answers({ hasWall: true, equipment: ["Kettlebell"] });
    const profile = profileOf(a, 22, NOV);
    expect(answersFromProfile(profile)).toEqual(a);
  });

  it("throws on missing answers", () => {
    expect(() => trainingFieldsFromAnswers(answers({ goal: null }), null, NOV)).toThrow();
  });
});

describe("summary shows facts of the real plan", () => {
  beforeAll(() => vi.spyOn(console, "debug").mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  it("counts sessions of the first week exactly as the saved plan has them", () => {
    for (const base of BASES) {
      const profile = profileOf(base.answers, base.age, base.start);
      const preview = generatePlan(profile, base.start, 14);
      const saved = generatePlan(
        profile,
        base.start,
        planWindowDays(base.start.toISOString().slice(0, 10)),
      );
      expect(onboardingPlanFacts(profile, preview), base.name).toEqual(
        onboardingPlanFacts(profile, saved),
      );
    }
  }, 120_000);

  it("lists concrete facts without explanations", () => {
    const base = BASES[0];
    const profile = profileOf(
      { ...base.answers, unavailableDays: [7], hasGym: false, equipment: ["Hantle"] },
      22,
      NOV,
    );
    const facts = onboardingPlanFacts(profile, generatePlan(profile, NOV, 14));
    const byId = Object.fromEntries(facts.map((fact) => [fact.id, fact.value]));
    expect(byId.week).toMatch(/trening/);
    expect(byId.match).toBe("so 21.11 · co tydzień: sobota");
    expect(byId.strength).toBe("Bez siłowni: hantle");
    expect(byId.focus).toBe("Szybkość · dodatkowo wytrzymałość");
    expect(byId.off).toBe("Nd");
    for (const fact of facts) expect(fact.value).not.toMatch(/bo |ponieważ|dlatego|aby /i);
  });
});
