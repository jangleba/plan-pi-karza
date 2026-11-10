import { describe, expect, it } from "vitest";
import { sessionFixture, sectionFixture } from "@/components/loadwise/session/testFixtures";
import type { SessionDay } from "./types";
import {
  buildCannotTodayDay,
  buildUnavailableSession,
  clearDailyPlanCheckin,
  readDailyPlanCheckin,
  restorePlannedDay,
  sameDayPlan,
  saveDailyPlanCheckin,
} from "./dailyPlanCheckin";
import { reduceDailySessionDose } from "./dailyDose";
import { buildTimeVariants } from "./dailyTimeBudget";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function strengthDay(overrides: Partial<SessionDay> = {}): SessionDay {
  return sessionFixture({
    type: "strength_power",
    sessionType: "Siła",
    title: "Siła",
    intensity: "wysoka",
    durationMin: 60,
    structuredSections: [
      sectionFixture("warmup", [{ id: "w", name: "Przygotowanie", duration: "8 min" }]),
      sectionFixture("main", [
        {
          id: "s",
          name: "Przysiad",
          sets: "4",
          reps: "6",
          rir: "3",
          loadTarget: "60 kg",
          restAfterExercise: "180 s",
          displayPrescription: "4 × 6",
        },
        {
          id: "r",
          name: "Martwy ciąg rumuński",
          sets: "3",
          reps: "8",
          restAfterExercise: "120 s",
          displayPrescription: "3 × 8",
        },
      ]),
      sectionFixture("accessory", [
        {
          id: "a",
          name: "Plank",
          sets: "3",
          duration: "40 s",
          restAfterExercise: "60 s",
        },
      ]),
      sectionFixture("cooldown", [{ id: "c", name: "Rozluźnienie", duration: "5 min" }]),
    ],
    ...overrides,
  });
}

describe("codzienny check-in: tylko trzy decyzje", () => {
  it("zapisuje wyłącznie decyzję treningową i ewentualny czas — bez danych o zdrowiu", () => {
    const storage = memoryStorage();
    const now = new Date("2026-11-10T08:00:00.000Z");
    const saved = saveDailyPlanCheckin("u", "2026-11-10", "less_time", 30, storage, now);
    expect(Object.keys(saved).sort()).toEqual(["action", "completedAt", "date", "minutes"]);
    expect(readDailyPlanCheckin("u", "2026-11-10", storage)).toEqual({
      date: "2026-11-10",
      action: "less_time",
      minutes: 30,
      completedAt: now.toISOString(),
    });
    expect(readDailyPlanCheckin("u", "2026-11-11", storage)).toBeNull();
    expect(saveDailyPlanCheckin("u", "2026-11-10", "train", 45, storage).minutes).toBeNull();
  });

  it("odrzuca dawny zapis z innymi opcjami i unieważnia check-in po przebudowie", () => {
    const storage = memoryStorage();
    storage.setItem(
      "ballwise:daily-plan-checkin:v3:u:2026-11-10",
      JSON.stringify({ date: "2026-11-10", action: "lighter", completedAt: "x" }),
    );
    expect(readDailyPlanCheckin("u", "2026-11-10", storage)).toBeNull();
    saveDailyPlanCheckin("u", "2026-11-10", "train", null, storage);
    clearDailyPlanCheckin("u", "2026-11-10", storage);
    expect(readDailyPlanCheckin("u", "2026-11-10", storage)).toBeNull();
  });
});

describe("„Mam mniej czasu”", () => {
  it("skraca tylko pracę: rozgrzewka, ciężar, powtórzenia i pełne przerwy zostają", () => {
    const day = strengthDay();
    const variants = buildTimeVariants(day);
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      const sections = variant.day.structuredSections!;
      expect(sections[0]).toEqual(day.structuredSections![0]);
      expect(sections.at(-1)).toEqual(day.structuredSections!.at(-1));
      const squat = sections
        .flatMap((section) => section.blocks)
        .flatMap((block) => block.exercises)
        .find((exercise) => exercise.id === "s")!;
      expect(squat.reps).toBe("6");
      expect(squat.loadTarget).toBe("60 kg");
      expect(squat.restAfterExercise).toBe("180 s");
      expect(variant.day.intensity).toBe("wysoka");
      expect(variant.minutes).toBeLessThanOrEqual(day.durationMin - 5);
    }
  });

  it("pokazuje tylko różne, faktycznie krótsze warianty", () => {
    const variants = buildTimeVariants(strengthDay());
    const minutes = variants.map((variant) => variant.minutes);
    expect(new Set(minutes).size).toBe(minutes.length);
    expect([...minutes].sort((a, b) => b - a)).toEqual(minutes);
  });

  it("ponowne zastosowanie tej samej decyzji nie skraca dalej (liczone od planu bazowego)", () => {
    const day = strengthDay();
    const first = buildTimeVariants(day)[0];
    const again = buildTimeVariants(first.day).find((variant) => variant.id === first.id)!;
    expect(sameDayPlan(again.day, first.day)).toBe(true);
    expect(again.minutes).toBe(first.minutes);
    expect(restorePlannedDay(first.day).structuredSections).toEqual(day.structuredSections);
  });

  it("nie skraca treningu klubowego ani rozpoczętej sesji", () => {
    expect(buildTimeVariants(strengthDay({ dayType: "club", externalCommitment: true }))).toEqual(
      [],
    );
    expect(buildTimeVariants(strengthDay({ executionProtected: true }))).toEqual([]);
  });

  it("przy dwóch sesjach uwzględnia obie i nie zmienia rozpoczętej pierwszej", () => {
    const second = strengthDay({ dbId: "second", title: "Druga sesja", slotLabel: "Sesja 2" });
    const day = strengthDay({ dbId: "first", secondSession: second });
    const variants = buildTimeVariants(day, (session) => session.dbId === "first");
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants)
      expect(variant.day.structuredSections).toEqual(day.structuredSections);
    expect(variants.some((variant) => variant.day.secondSession === null)).toBe(true);
  });
});

it("bieg ciągły: krótszy czas pracy jest spójny w zegarze, opisie i zapisie", () => {
  const run = sessionFixture({
    type: "endurance_running",
    sessionType: "Wytrzymałość",
    intensity: "niska",
    durationMin: 35,
    sections: {
      warmup: [],
      main: [{ name: "Łatwy bieg tlenowy", exerciseId: "easy_run", prescription: "1, 1200 s" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    structuredSections: [
      sectionFixture("warmup", [{ id: "w", name: "Marsz A", reps: "2 × 10 m" }]),
      sectionFixture("main", [
        {
          id: "run",
          exerciseId: "easy_run",
          name: "Łatwy bieg tlenowy",
          sets: "1",
          duration: "1200 s",
          methodExecution: {
            methodId: "M15",
            mode: "continuous",
            rounds: 1,
            repetitions: 1,
            workSeconds: 1200,
            restSeconds: 0,
            roundRestSeconds: 0,
            intensityLabel: "spokojnie",
            stopRule: "",
            focus: "",
            assessment: "athlete_or_coach",
          },
        },
      ]),
    ],
  });
  const variant = buildTimeVariants(run)[0];
  expect(variant).toBeDefined();
  const exercise = variant.day.structuredSections![1].blocks[0].exercises[0];
  const seconds = Number(exercise.duration!.match(/\d+/)![0]);
  expect(seconds).toBeLessThan(1200);
  expect(exercise.methodExecution?.workSeconds).toBe(seconds);
  expect(variant.day.sections.main[0].prescription).toBe(`1, ${seconds} s`);
  expect(variant.day.structuredSections![0]).toEqual(run.structuredSections![0]);
});

describe("„Dziś nie mogę”", () => {
  it("dotyczy tylko dzisiejszego dnia i nie przenosi pracy na kolejny dzień", () => {
    const day = strengthDay({ dbId: "today" });
    const result = buildCannotTodayDay(day);
    expect(result.isUnavailable).toBe(true);
    expect(result.date).toBe(day.date);
    expect(result.durationMin).toBe(0);
    expect(result.checkinBaseSession?.structuredSections).toEqual(day.structuredSections);
    expect(result.riskManaged).toMatch(/nie jest automatycznie przenoszona/);
  });

  it("nie zmienia rozpoczętej sesji; usuwa tylko nierozpoczętą drugą", () => {
    const second = strengthDay({ dbId: "second", title: "Technika" });
    const started = strengthDay({ dbId: "first", secondSession: second });
    const completions = {
      first: { completed: false, status: "started" as const, rpe: null, notes: "" },
    };
    const result = buildCannotTodayDay(started, completions);
    expect(result.dbId).toBe("first");
    expect(result.structuredSections).toEqual(started.structuredSections);
    expect(result.secondSession).toBeNull();
    const onlyStarted = strengthDay({ dbId: "first" });
    expect(buildCannotTodayDay(onlyStarted, completions)).toBe(onlyStarted);
  });

  it("zamienia niedostępną sesję na dzień bez treningu", () => {
    const result = buildUnavailableSession(strengthDay());
    expect(result.dayType).toBe("rest");
    expect(result.sections.main).toEqual([]);
  });
});

// Dose primitive used by „Mam mniej czasu” (fewer sets/intervals only).
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
  const result = reduceDailySessionDose(source),
    exercise = result.structuredSections![1].blocks[0].exercises[0];
  expect(exercise.sets).toBe("3");
  expect(exercise.reps).toBe("6");
  expect(exercise.rir).toBe("3");
  expect(exercise.loadTarget).toBe("60 kg");
  expect(exercise.restAfterExercise).toBe("180 s");
  expect(exercise.displayPrescription).toBe("3 × 6");
  expect(result.structuredSections![0]).toEqual(warmup);
  expect(result.intensity).toBe("wysoka");
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
  const exercise = reduceDailySessionDose(source).structuredSections![0].blocks[0].exercises[0];
  expect(exercise.reps).toBe("4 × 20 m");
  expect(exercise.displayPrescription).toBe("4 × 20 m");
  expect(exercise.restAfterExercise).toBe("180 s");
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
  expect(reduceDailySessionDose(source).structuredSections![0].blocks[0].exercises[0].reps).toBe(
    "4–6 × 20 m",
  );
});

it("nie ogłasza zmniejszenia przy niejednoznacznej dawce ani pojedynczym sprincie", () => {
  expect(() =>
    reduceDailySessionDose(
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
  const single = sessionFixture({
    type: "sprint_acceleration",
    sessionType: "Sprint",
    structuredSections: [
      sectionFixture("main", [
        { id: "s", name: "Sprint", sets: "1", reps: "20 m", duration: "5 s" },
      ]),
    ],
  });
  expect(() => reduceDailySessionDose(single)).toThrow("jednoznacznie");
  expect(buildTimeVariants(single)).toEqual([]);
});
