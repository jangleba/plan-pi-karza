import { describe, expect, it } from "vitest";
import type {
  ExerciseItem,
  SessionDay,
} from "./types";
import {
  assessDaySpeedLoad,
  assessSpeedLoad,
  estimateSprintMeters,
} from "./speedLoad";

function sections(
  exercises: ExerciseItem[],
): SessionDay["sections"] {
  return {
    warmup: [],
    main: exercises,
    accessory: [],
    footballTransfer: [],
    cooldown: [],
  };
}

function session(
  overrides: Partial<SessionDay> = {},
): SessionDay {
  return {
    date: "2026-08-05",
    dayName: "Środa",
    dayType: "training",
    title: "Sesja testowa",
    goalLabel: "Szybkość",
    intensity: "umiarkowana",
    durationMin: 40,
    reason: "Test kontraktu speed load.",
    safetyNote: null,
    whyToday: "Test.",
    sessionType: "Sesja testowa",
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

describe("assessSpeedLoad", () => {
  it("same skipy są techniką, a nie realnym sprintem", () => {
    const result = assessSpeedLoad(
      session({
        title: "Technika biegu",
        sessionType: "Technika biegu",
        sections: sections([
          {
            name: "Skip A",
            prescription: "2 × 15 m",
          },
          {
            name: "Ankling",
            prescription: "2 × 15 m",
          },
        ]),
      }),
    );

    expect(result.exposure).toBe("technique");
    expect(result.countsAsSpeedExposure).toBe(false);
  });

  it("MD-2 na 85% jest mikrodawką", () => {
    const result = assessSpeedLoad(
      session({
        title: "Ostrość piłkarska MD-2",
        sessionType: "Ekspozycja szybkościowa",
        intensity: "umiarkowana",
        sections: sections([
          {
            name: "Kontrolowane przyspieszenia",
            prescription:
              "4 × 15 m na 85%, pełna przerwa",
          },
        ]),
      }),
    );

    expect(result.exposure).toBe("microdose");
    expect(result.estimatedSprintMeters).toBe(60);
    expect(result.blocksAdjacentSpeedDay).toBe(true);
  });

  it("pełna akceleracja 4 × 20 m jest full mimo 80 m", () => {
    const result = assessSpeedLoad(
      session({
        title: "Sprint i przyspieszenie",
        sessionType: "Akceleracja",
        intensity: "wysoka",
        sections: sections([
          {
            name: "Sprinty z pozycji startowej",
            prescription: "4 × 20 m",
            rest: "2–3 min",
          },
        ]),
      }),
    );

    expect(result.exposure).toBe("full");
    expect(result.estimatedSprintMeters).toBe(80);
    expect(result.requiresFullRecoveryGap).toBe(true);
  });

  it("RSA zawsze jest pełnym speed loadem", () => {
    const result = assessSpeedLoad(
      session({
        title: "Powtarzalne sprinty RSA",
        sessionType: "Wydolność specjalna",
        intensity: "wysoka",
        sections: sections([
          {
            name: "Powtarzalne sprinty",
            prescription:
              "2 × (5 × 20 m), 30 s przerwy",
          },
        ]),
      }),
    );

    expect(result.exposure).toBe("full");
    expect(result.estimatedSprintMeters).toBe(200);
  });

  it("95% ciężaru na siłowni nie jest sprintem", () => {
    const result = assessSpeedLoad(
      session({
        title: "Siła maksymalna",
        sessionType: "Siła",
        intensity: "wysoka",
        sections: sections([
          {
            name: "Przysiad ze sztangą",
            prescription: "4 × 3 na 95% 1RM",
          },
        ]),
      }),
    );

    expect(result.exposure).toBe("none");
    expect(result.countsAsSpeedExposure).toBe(false);
  });

  it("tekst bez sprintów nie tworzy fałszywej ekspozycji", () => {
    const result = assessSpeedLoad(
      session({
        title: "Mobilność",
        sessionType: "Regeneracja",
        goalOfSession:
          "Lekka praca bez sprintów i przyspieszeń.",
        intensity: "niska",
        sections: sections([
          {
            name: "Mobilność bioder",
            prescription: "8 min",
          },
        ]),
      }),
    );

    expect(result.exposure).toBe("none");
  });

  it("wylicza 6 × 20 m jako 120 m", () => {
    const value = estimateSprintMeters(
      session({
        sections: sections([
          {
            name: "Sprinty liniowe",
            prescription: "6 × 20 m",
          },
        ]),
      }),
    );

    expect(value).toBe(120);
  });

  it("wylicza zakres konserwatywnie", () => {
    const value = estimateSprintMeters(
      session({
        sections: sections([
          {
            name: "Sprinty",
            prescription: "6–8 × 20–25 m",
          },
        ]),
      }),
    );

    expect(value).toBe(200);
  });

  it("wykrywa dwie realne ekspozycje jednego dnia", () => {
    const second = session({
      title: "Mikrodawka szybkości",
      sessionType: "Speed exposure",
      intensity: "umiarkowana",
      sections: sections([
        {
          name: "Przyspieszenia",
          prescription: "3 × 10 m na 85%",
        },
      ]),
    });

    const day = session({
      title: "Pełna akceleracja",
      sessionType: "Sprint",
      intensity: "wysoka",
      sections: sections([
        {
          name: "Sprinty",
          prescription: "4 × 20 m",
        },
      ]),
      secondSession: second,
    });

    const result = assessDaySpeedLoad(day);

    expect(result.realExposureCount).toBe(2);
    expect(
      result.hasDuplicateRealSpeedExposures,
    ).toBe(true);
    expect(result.exposure).toBe("full");
  });

  it("dzień niedostępny zawsze ma speed load none", () => {
    const result = assessSpeedLoad(
      session({
        isUnavailable: true,
        dayType: "rest",
        sections: sections([
          {
            name: "Sprinty",
            prescription: "6 × 20 m",
          },
        ]),
      }),
    );

    expect(result.exposure).toBe("none");
  });
});
