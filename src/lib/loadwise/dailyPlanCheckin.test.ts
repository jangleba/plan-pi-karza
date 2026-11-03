import { describe, expect, it } from "vitest";
import { sessionFixture, sectionFixture } from "@/components/loadwise/session/testFixtures";
import type { SessionDay } from "./types";
import {
  buildLighterSession,
  buildUnavailableSession,
  clearDailyPlanCheckin,
  promoteSecondSession,
  readDailyPlanCheckin,
  saveDailyPlanCheckin,
  withoutSecondSession,
} from "./dailyPlanCheckin";

function session(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    date: "2026-09-20",
    dayName: "Niedziela",
    dayType: "training",
    type: "strength_power",
    title: "Siła",
    goalLabel: "Siła",
    intensity: "wysoka",
    durationMin: 60,
    reason: "Plan tygodnia",
    safetyNote: null,
    whyToday: "Dzień siłowy",
    sessionType: "Siła",
    goalOfSession: "Rozwój siły",
    riskManaged: "Kontrolowana objętość",
    avoidToday: "",
    mdLabel: null,
    slotLabel: "Sesja 1",
    sections: {
      warmup: [],
      main: [{ name: "Przysiad", prescription: "4 × 8" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
    ...overrides,
  };
}

describe("daily plan check-in", () => {
  it("zapisuje datę oraz niezależne decyzje dla obu sesji", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const now = new Date("2026-09-20T08:00:00.000Z");

    saveDailyPlanCheckin("user-1", "2026-09-20", "lighter", "remove", storage, now);

    expect(readDailyPlanCheckin("user-1", "2026-09-20", storage)).toEqual({
      date: "2026-09-20",
      primaryAction: "lighter",
      secondAction: "remove",
      completedAt: now.toISOString(),
    });
    expect(readDailyPlanCheckin("user-1", "2026-09-21", storage)).toBeNull();
  });

  it("unieważnia check-in po przebudowie planu", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    saveDailyPlanCheckin("user-1", "2026-09-20", "keep", null, storage);

    clearDailyPlanCheckin("user-1", "2026-09-20", storage);

    expect(readDailyPlanCheckin("user-1", "2026-09-20", storage)).toBeNull();
  });

  it("buduje lżejszy wariant i zachowuje drugą sesję do osobnej decyzji", () => {
    const result = buildLighterSession(session({ secondSession: session({ title: "Technika" }) }));

    expect(result.durationMin).toBe(45);
    expect(result.intensity).toBe("wysoka");
    expect(result.sections.main[0].prescription).toBe("3 × 8");
    expect(result.secondSession?.title).toBe("Technika");
    expect(result.loadLabelOverride).toBe("Lżejszy wariant");
  });

  it("nie zmienia jednostki klubowej, tylko oznacza mniejszy udział", () => {
    const result = buildLighterSession(session({ dayType: "club", externalCommitment: true }));

    expect(result.durationMin).toBe(60);
    expect(result.loadLabelOverride).toBe("Ogranicz obciążenie");
  });

  it("zamienia niedostępną sesję na dzień bez treningu", () => {
    const result = buildUnavailableSession(session());

    expect(result.isUnavailable).toBe(true);
    expect(result.dayType).toBe("rest");
    expect(result.durationMin).toBe(0);
    expect(result.sections.main).toEqual([]);
  });

  it("usuwa wyłącznie drugi slot", () => {
    const original = session({
      secondSession: session({ title: "Technika" }),
    });
    const result = withoutSecondSession(original);

    expect(result.title).toBe("Siła");
    expect(result.secondSession).toBeNull();
    expect(result.slotLabel).toBeNull();
  });

  it("promuje drugą sesję, gdy pierwsza jest niedostępna", () => {
    const original = session({
      dayDbId: "day-1",
      secondSession: session({ title: "Technika", slotLabel: "Sesja 2" }),
    });
    const result = promoteSecondSession(original);

    expect(result.title).toBe("Technika");
    expect(result.dayDbId).toBe("day-1");
    expect(result.date).toBe(original.date);
    expect(result.secondSession).toBeNull();
    expect(result.slotLabel).toBeNull();
  });
});

it("zmniejsza liczbę serii, zachowując powtórzenia, ciężar, przerwę i przygotowanie", () => {
  const warmup = sectionFixture("warmup", [{ id: "w", name: "Przygotowanie", duration: "8 min" }]);
  const source = sessionFixture({
    type: "strength_power",
    sessionType: "Siła",
    intensity: "wysoka",
    structuredSections: [
      warmup,
      sectionFixture("main", [
        {
          id: "s",
          name: "Przysiad",
          sets: "4",
          reps: "6",
          rir: "3",
          tempo: "3-1-1",
          loadTarget: "60 kg",
          restAfterExercise: "180 s",
          displayPrescription: "4 × 6",
        },
      ]),
    ],
  });
  const result = buildLighterSession(source),
    exercise = result.structuredSections![1].blocks[0].exercises[0];
  expect(exercise.sets).toBe("3");
  expect(exercise.reps).toBe("6");
  expect(exercise.rir).toBe("3");
  expect(exercise.loadTarget).toBe("60 kg");
  expect(exercise.restAfterExercise).toBe("180 s");
  expect(exercise.displayPrescription).toBe("3 × 6");
  expect(result.structuredSections![0]).toEqual(warmup);
  expect(result.intensity).toBe("wysoka");
  expect(buildLighterSession(result)).toEqual(result);
});
it("zmniejsza liczbę sprintów bez skracania dystansu i przerwy", () => {
  const source = sessionFixture({
    type: "sprint_acceleration",
    sessionType: "Sprint",
    intensity: "wysoka",
    structuredSections: [
      sectionFixture("main", [
        {
          id: "s",
          name: "Sprint",
          sets: "1",
          reps: "6 × 20 m",
          restAfterExercise: "180 s",
          displayPrescription: "6 × 20 m",
        },
      ]),
    ],
  });
  const result = buildLighterSession(source),
    exercise = result.structuredSections![0].blocks[0].exercises[0];
  expect(exercise.reps).toBe("4 × 20 m");
  expect(exercise.displayPrescription).toBe("4 × 20 m");
  expect(exercise.restAfterExercise).toBe("180 s");
  expect(result.intensity).toBe("wysoka");
});
it("nie ogłasza zmniejszenia przy niejednoznacznej dawce ani wykonanej sesji", () => {
  expect(() =>
    buildLighterSession(
      sessionFixture({
        sections: {
          warmup: [],
          main: [{ name: "Technika", prescription: "Według wskazówek trenera" }],
          accessory: [],
          footballTransfer: [],
          cooldown: [],
        },
      }),
    ),
  ).toThrow("jednoznacznie");
  expect(() => buildLighterSession(sessionFixture({ executionProtected: true }))).toThrow(
    "Rozpoczęta",
  );
});
it("wybór lżej przechowuje tylko decyzję treningową, bez wnioskowania o zdrowiu", () => {
  const saved = saveDailyPlanCheckin(
    "user",
    "2026-11-02",
    "lighter",
    null,
    null,
    new Date("2026-11-02T08:00:00Z"),
  );
  expect(Object.keys(saved).sort()).toEqual([
    "completedAt",
    "date",
    "primaryAction",
    "secondAction",
  ]);
});

it("zakres sprintów zmniejsza przez liczbę odcinków, nie dystans odcinka", () => {
  const source = sessionFixture({
    type: "sprint_acceleration",
    sessionType: "Sprint",
    structuredSections: [
      sectionFixture("main", [
        {
          id: "s",
          name: "Sprint",
          sets: "1",
          reps: "6–8 × 20 m",
          displayPrescription: "6–8 × 20 m",
        },
      ]),
    ],
  });
  const result = buildLighterSession(source);
  expect(result.structuredSections![0].blocks[0].exercises[0].reps).toBe("4–6 × 20 m");
});
it("nie skraca pojedynczego sprintu, gdy nie ma liczby odcinków", () => {
  const source = sessionFixture({
    type: "sprint_acceleration",
    sessionType: "Sprint",
    structuredSections: [
      sectionFixture("main", [
        {
          id: "s",
          name: "Sprint",
          sets: "1",
          reps: "20 m",
          duration: "5 s",
          displayPrescription: "20 m",
        },
      ]),
    ],
  });
  expect(() => buildLighterSession(source)).toThrow("jednoznacznie");
});
