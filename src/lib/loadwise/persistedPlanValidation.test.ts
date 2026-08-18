import { describe, expect, it } from "vitest";
import type { ExerciseItem, Profile, SessionDay } from "./types";
import { persistedPlanNeedsRegeneration, validatePersistedPlan } from "./persistedPlanValidation";

const ENGINE_VERSION = "test-engine-v1";

function sections(main: ExerciseItem[]): SessionDay["sections"] {
  return {
    warmup: [],
    main,
    accessory: [],
    footballTransfer: [],
    cooldown: [],
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    clubTrainingDays: [],
    ...overrides,
  } as Profile;
}

function session(date: string, overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    generatorVersion: ENGINE_VERSION,
    date,
    dayName: "Dzień testowy",
    dayType: "training",
    title: "Sesja testowa",
    goalLabel: "Test",
    intensity: "niska",
    durationMin: 30,
    reason: "Test walidacji zapisanego planu.",
    safetyNote: null,
    whyToday: "Test.",
    sessionType: "Test",
    goalOfSession: "Test.",
    riskManaged: "Test.",
    avoidToday: "Test.",
    mdLabel: null,
    slotLabel: null,
    sections: sections([]),
    secondSession: null,
    ...overrides,
  };
}

function fullSprint(date: string): SessionDay {
  return session(date, {
    title: "Sprint i przyspieszenie",
    sessionType: "Szybkość",
    intensity: "wysoka",
    sections: sections([
      {
        name: "Sprinty z pozycji startowej",
        prescription: "4 × 20 m",
      },
    ]),
  });
}

function speedMicrodose(date: string): SessionDay {
  return session(date, {
    title: "Wejście w prędkość",
    sessionType: "Ekspozycja szybkościowa",
    intensity: "umiarkowana",
    sections: sections([
      {
        name: "Kontrolowane przyspieszenia",
        prescription: "3 × 10 m na 85%",
      },
    ]),
  });
}

function restDay(date: string): SessionDay {
  return session(date, {
    dayType: "rest",
    title: "Dzień wolny",
    sessionType: "Dzień wolny",
    intensity: "niska",
    durationMin: 0,
    sections: sections([]),
  });
}

describe("validatePersistedPlan", () => {
  it("blokuje główną szybkość i drugi sprint tego samego dnia", () => {
    const day = fullSprint("2026-08-06");

    day.title = "Dziś: szybkość";

    day.secondSession = speedMicrodose("2026-08-06");

    day.secondSession.title = "Sprint — wejście w prędkość";

    const result = validatePersistedPlan([day], profile(), ENGINE_VERSION);

    expect(result.valid).toBe(false);

    expect(result.issues.some((issue) => issue.code === "duplicate-speed-same-day")).toBe(true);
  });
  it("odrzuca pusty plan", () => {
    const result = validatePersistedPlan([], profile(), ENGINE_VERSION);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "missing-plan")).toBe(true);
  });

  it("oznacza zapisaną sesję szybkościową z pracą z piłką do regeneracji", () => {
    const day = fullSprint("2026-08-03");
    day.sections.main[0] = {
      name: "Sprint po podaniu",
      exerciseId: "dribble_to_sprint_transition",
      prescription: "4 × 20 m",
    };

    const result = validatePersistedPlan([day], profile(), ENGINE_VERSION);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "invalid-speed-content")).toBe(true);
  });

  it("odrzuca plan ze starej wersji generatora", () => {
    const plan = [restDay("2026-08-03")];

    plan[0].generatorVersion = "old-engine";

    const result = validatePersistedPlan(plan, profile(), ENGINE_VERSION);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "stale-generator")).toBe(true);
  });

  it("wykrywa dwa realne bodźce szybkościowe jednego dnia", () => {
    const day = fullSprint("2026-08-03");
    day.secondSession = speedMicrodose("2026-08-03");

    const result = validatePersistedPlan([day], profile(), ENGINE_VERSION);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "duplicate-speed-same-day")).toBe(true);

    expect(persistedPlanNeedsRegeneration([day], profile(), ENGINE_VERSION)).toBe(true);
  });

  it("wykrywa realną szybkość dzień po dniu", () => {
    const plan = [fullSprint("2026-08-03"), speedMicrodose("2026-08-04")];

    const result = validatePersistedPlan(plan, profile(), ENGINE_VERSION);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "adjacent-speed-days")).toBe(true);
  });

  it("wykrywa trening klubowy w złym dniu", () => {
    const club = session("2026-08-03", {
      dayType: "club",
      title: "Trening klubowy",
      sessionType: "Klub",
    });

    const result = validatePersistedPlan(
      [club],
      profile({
        clubTrainingDays: [2],
      }),
      ENGINE_VERSION,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "club-day-mismatch")).toBe(true);
  });

  it("akceptuje aktualny i bezpieczny plan", () => {
    const plan = [
      fullSprint("2026-08-03"),
      restDay("2026-08-04"),
      session("2026-08-05", {
        title: "Technika z piłką",
        sessionType: "Piłka",
      }),
    ];

    const result = validatePersistedPlan(plan, profile(), ENGINE_VERSION);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);

    expect(persistedPlanNeedsRegeneration(plan, profile(), ENGINE_VERSION)).toBe(false);
  });
});
