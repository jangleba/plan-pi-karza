import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { planWindowDays } from "./planWindow";
import { rememberedMatchWeekday } from "./matchSchedule";
import {
  answersFromProfile,
  onboardingPlanFacts,
  toggleFeeling,
  trainingFieldsFromAnswers,
  type OnboardingAnswers,
} from "./onboardingFlow";
import { classifySession } from "./sessionClassification";
import { ONBOARDING_CURRENT_FEELINGS, ONBOARDING_DESIRED_FEELINGS } from "./playerDirection";
import type { CurrentPitchFeeling, DesiredPitchFeeling, Profile, SessionDay } from "./types";

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

  const general = answers({
    goal: "general",
    secondaryLimiter: "ball",
    currentFeelings: [],
    desiredFeelings: [],
  });
  const slots = (plan: SessionDay[]) =>
    plan
      .flatMap((day) => [day, day.secondSession])
      .filter((slot): slot is SessionDay => Boolean(slot) && slot!.dayType === "training");
  const plan28 = (a: OnboardingAnswers, extra: Partial<Profile> = {}, age = 22) =>
    generatePlan({ ...profileOf(a, age, NOV), ...extra }, NOV, 28);
  const count = (plan: SessionDay[], test: (slot: SessionDay) => boolean) =>
    slots(plan).filter(test).length;
  const isCod = (slot: SessionDay) => /hamowanie|zmiana kierunku|reakcja/i.test(slot.title);
  const isAcceleration = (slot: SessionDay) => /^sprint: akceleracja/i.test(slot.title);
  const category = (slot: SessionDay) =>
    slot.classification?.category ?? classifySession(slot).category;

  it("agile in turns: the sprint session works on braking and change of direction", () => {
    const a = { ...general, clubDays: [3] };
    const base = plan28(a);
    const agile = plan28({ ...a, desiredFeelings: ["agile_in_turns"] });
    expect(count(agile, isCod)).toBeGreaterThan(count(base, isCod));
    expect(count(plan28({ ...a, currentFeelings: ["slow_to_turn"] }), isCod)).toBeGreaterThan(
      count(base, isCod),
    );
  }, 60_000);

  it("fast / explosive: braking sessions become acceleration", () => {
    const base = plan28(general);
    for (const feeling of ["fast_and_light", "explosive_first_steps"] as DesiredPitchFeeling[])
      expect(
        count(plan28({ ...general, desiredFeelings: [feeling] }), isAcceleration),
        feeling,
      ).toBeGreaterThan(count(base, isAcceleration));
  }, 60_000);

  it("ready for the whole match: more endurance sessions", () => {
    const isEndurance = (slot: SessionDay) => category(slot) === "endurance_conditioning";
    const a = { ...general, clubDays: [3] };
    expect(
      count(plan28({ ...a, desiredFeelings: ["ready_full_match"] }), isEndurance),
    ).toBeGreaterThan(count(plan28(a), isEndurance));
  }, 60_000);

  it("strong in duels: a second strength session without a gym", () => {
    const a = answers({
      ...general,
      level: "advanced",
      noMatch: true,
      matchDate: "",
      weeklyMatches: false,
      seasonPhase: "offseason",
      hasGym: false,
      clubDays: [],
    });
    const isStrength = (slot: SessionDay) => category(slot) === "gym_strength";
    const strong = plan28({ ...a, desiredFeelings: ["strong_in_duels"] });
    expect(count(strong, isStrength)).toBeGreaterThan(count(plan28(a), isStrength));
    for (const slot of slots(strong)) expect(slot.title).not.toMatch(/siłowni/i);
  }, 60_000);

  // Mobility takes a recovery or spare light day; a full in-season week has none to give.
  it("loose in movement: mobility sessions where the week has room", () => {
    const a = answers({
      ...general,
      noMatch: true,
      matchDate: "",
      weeklyMatches: false,
      seasonPhase: "offseason",
      clubDays: [],
    });
    const isMobility = (slot: SessionDay) => slot.type === "prehab_mobility";
    expect(
      count(plan28({ ...a, desiredFeelings: ["loose_in_movement"] }), isMobility),
    ).toBeGreaterThan(count(plan28(a), isMobility));
  }, 60_000);

  it("never more than one dedicated sprint session a week, whatever the feeling", () => {
    const feelings: Array<Partial<OnboardingAnswers>> = [
      ...ONBOARDING_DESIRED_FEELINGS.map((id) => ({ desiredFeelings: [id] })),
      ...ONBOARDING_CURRENT_FEELINGS.map((id) => ({
        currentFeelings: [id] as CurrentPitchFeeling[],
      })),
    ];
    for (const patch of feelings) {
      const plan = plan28({ ...general, ...patch });
      for (let week = 0; week < 4; week++) {
        const sprint = slots(plan.slice(week * 7, week * 7 + 7)).filter(
          (slot) => category(slot) === "speed_sprint",
        );
        expect(sprint.length, JSON.stringify(patch)).toBeLessThanOrEqual(1);
      }
    }
  }, 240_000);

  it("changes nothing with pain, a return goal or in transition", () => {
    const sig = (a: OnboardingAnswers, extra: Partial<Profile>) =>
      JSON.stringify(plan28(a, extra).map((d) => d.title));
    for (const [a, extra] of [
      [general, { painInjury: true }],
      [{ ...general, goal: "return" as const }, {}],
      [{ ...general, seasonPhase: "transition" as const, seasonPhaseOverride: true }, {}],
    ] as Array<[OnboardingAnswers, Partial<Profile>]>)
      expect(sig({ ...a, desiredFeelings: ["agile_in_turns"] }, extra)).toBe(sig(a, extra));
  }, 120_000);

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

  it("the summary names the feeling and what the week has for it", () => {
    const a = {
      ...general,
      clubDays: [3],
      desiredFeelings: ["agile_in_turns"] as DesiredPitchFeeling[],
    };
    const profile = profileOf(a, 22, NOV);
    const facts = onboardingPlanFacts(profile, generatePlan(profile, NOV, 14));
    expect(facts.find((fact) => fact.id === "direction")?.value).toMatch(
      /^Zwinny w zwrotach · (Hamowanie|Reakcja)/,
    );
    const endurance = profileOf({ ...general, desiredFeelings: ["ready_full_match"] }, 22, NOV);
    expect(
      onboardingPlanFacts(endurance, generatePlan(endurance, NOV, 14)).find(
        (fact) => fact.id === "direction",
      )?.value,
    ).toMatch(/^Świeży cały mecz · wytrzymałość \d× w tygodniu$/);
  }, 60_000);
});
