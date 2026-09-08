import { describe, expect, it } from "vitest";
import {
  buildRunningSessionPrescription,
  calculateFieldMasKmh,
  deriveRunningEngineState,
  fieldMasFromActivity,
  isFieldMasCurrent,
  nextRunningProgressionLevel,
  paceRangeFromMas,
} from "./engine";
import type { RunningIntervalResult } from "./types";

const result = (pace: number, completed = true): RunningIntervalResult => ({
  stepId: crypto.randomUUID(), kind: "work", label: "Odcinek", repeatIndex: 1, repeatTotal: 4,
  targetMode: "time", targetValue: 180, targetLabel: "3:00", durationSec: 180,
  distanceM: 180_000 / pace, paceSecPerKm: pace, completed,
});

describe("silnik biegowy", () => {
  it("liczy terenowe MAS z testu 5-minutowego", () => {
    expect(calculateFieldMasKmh(1_250, 300)).toBe(15);
    expect(calculateFieldMasKmh(200, 300)).toBeNull();
  });

  it("przelicza procent MAS na czytelny zakres min/km", () => {
    expect(paceRangeFromMas(15, 90, 95)).toMatchObject({
      fastestSecPerKm: 253,
      slowestSecPerKm: 267,
      label: "4:13–4:27/km",
    });
  });

  it("przed pierwszym testem planuje test, a pozostałe biegi pozostawia łatwe", () => {
    expect(buildRunningSessionPrescription({ date: "2026-09-05", sessionIndex: 0 }).method).toBe("field_mas_test");
    expect(buildRunningSessionPrescription({ date: "2026-09-05", sessionIndex: 1 }).method).toBe("easy_aerobic");
    expect(buildRunningSessionPrescription({
      date: "2026-09-05",
      sessionIndex: 8,
      scheduleFieldMasTest: true,
    }).method).toBe("field_mas_test");
  });

  it("lekki kontekst nigdy nie uruchamia testu ani mocnych interwałów", () => {
    const light = buildRunningSessionPrescription({
      fieldMasKmh: 15,
      fieldMasTestedAt: "2026-09-01",
      date: "2026-09-05",
      sessionIndex: 0,
      scheduleFieldMasTest: true,
      forceLight: true,
    });
    expect(light.method).toBe("easy_aerobic");
    expect(light.intensity).toBe("niska");
    expect(light.main[0].prescription).toContain("/km");
  });

  it("po ważnym teście tworzy indywidualne tempo, a po 28 dniach ponawia test", () => {
    const current = buildRunningSessionPrescription({
      fieldMasKmh: 15, fieldMasTestedAt: "2026-08-20", date: "2026-09-05", sessionIndex: 0,
    });
    expect(current.method).toBe("extensive_intervals");
    expect(current.main[0].prescription).toContain("/km");
    expect(isFieldMasCurrent("2026-08-01", "2026-09-05")).toBe(false);
    expect(buildRunningSessionPrescription({
      fieldMasKmh: 15, fieldMasTestedAt: "2026-08-01", date: "2026-09-05", sessionIndex: 0,
    }).method).toBe("field_mas_test");
  });

  it("wyciąga wynik MAS z dokładnego kroku testowego", () => {
    expect(fieldMasFromActivity({ distanceM: 3_000, durationSec: 1_200, intervalResults: [{ ...result(240), durationSec: 300, distanceM: 1_250 }] })).toBe(15);
  });

  it("zmienia poziom progresji tylko po dobrym lub wyraźnie słabym wykonaniu", () => {
    expect(nextRunningProgressionLevel({ currentLevel: 1, rpe: 7, results: [result(250), result(252), result(255), result(253)] })).toBe(2);
    expect(nextRunningProgressionLevel({ currentLevel: 2, rpe: 9, results: [result(250), result(320)] })).toBe(1);
    expect(nextRunningProgressionLevel({ currentLevel: 2, rpe: 8, results: [result(250), result(255)] })).toBe(2);
  });

  it("odtwarza MAS i progresję z historii bez nowych kolumn bazy", () => {
    const testActivity = {
      id: "run-1", userId: "user-1", sessionId: "test-session", date: "2026-09-01",
      startedAt: "2026-09-01T10:00:00Z", endedAt: "2026-09-01T10:05:00Z",
      durationSec: 300, distanceM: 1_500, avgPaceSecPerKm: 200,
      route: [], splits: [], source: "gps" as const,
      createdAt: "2026-09-01T10:05:00Z", updatedAt: "2026-09-01T10:05:00Z",
      intervalResults: [{ ...result(200), durationSec: 300, distanceM: 1_500 }],
    };
    const trainingActivity = {
      ...testActivity,
      id: "run-2", sessionId: "training-session", date: "2026-09-05",
      startedAt: "2026-09-05T10:00:00Z", endedAt: "2026-09-05T10:12:00Z",
      durationSec: 720,
      intervalResults: [result(212), result(213), result(214), result(215)],
    };

    expect(deriveRunningEngineState([trainingActivity, testActivity], { "training-session": 7 }))
      .toMatchObject({
        fieldMasKmh: 18,
        fieldMasTestedAt: "2026-09-01",
        runningProgressionLevel: 1,
        runningProgressionUpdatedAt: "2026-09-05",
      });
  });
});
