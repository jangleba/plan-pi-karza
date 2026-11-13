import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rememberedMatchWeekday } from "./matchSchedule";
import {
  answersFromProfile,
  toggleFeeling,
  trainingFieldsFromAnswers,
  type OnboardingAnswers,
} from "./onboardingFlow";
import type { DesiredPitchFeeling, Profile } from "./types";

/**
 * The onboarding asks only questions that shape the plan. Each answer goes
 * through the same mapping the screen uses (trainingFieldsFromAnswers) and
 * must change the generated plan, or — for the weekly match — the remembered
 * match day used when the next week is confirmed.
 */

const NOV = new Date(2026, 10, 16); // Monday, after the season

const answers = (patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  position: "midfielder",
  level: "intermediate",
  competitionLevel: "iv_liga",
  goal: "speed",
  secondaryLimiter: "endurance",
  currentFeelings: ["fading_late_in_match"],
  desiredFeelings: ["ready_full_match"],
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

const QUESTIONS: Array<[string, Partial<OnboardingAnswers>]> = [
  ["pozycja", { position: "goalkeeper" }],
  ["poziom", { level: "elite" }],
  ["poziom rozgrywkowy", { competitionLevel: "pro" }],
  ["cel", { goal: "endurance" }],
  ["ograniczenie", { secondaryLimiter: "strength" }],
  ["jak czujesz się teraz", { currentFeelings: ["slow_to_turn"] }],
  ["jak chcesz się czuć", { desiredFeelings: ["agile_in_turns"] }],
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

/**
 * „Jak czujesz się / jak chcesz się czuć na boisku”: each answer moves the plan
 * towards its quality, inside the week limits (one sprint session, rest day,
 * MD rules) and never with pain, a return or in transition.
 */
describe("pitch feelings set the plan accent", () => {
  beforeAll(() => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterAll(() => vi.restoreAllMocks());

  it("keeps at most two answers, the newest replacing the oldest", () => {
    expect(toggleFeeling(["a", "b"], "c")).toEqual(["b", "c"]);
    expect(toggleFeeling(["a", "b"], "a")).toEqual(["b"]);
    const fields = trainingFieldsFromAnswers(
      answers({
        desiredFeelings: [
          "strong_in_duels",
          "not_an_answer" as DesiredPitchFeeling,
          "fast_and_light",
        ],
      }),
      null,
      NOV,
    );
    expect(fields.desiredPitchFeelings).toEqual(["strong_in_duels", "fast_and_light"]);
  });
});
