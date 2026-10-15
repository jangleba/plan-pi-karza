import { describe, expect, it } from "vitest";
import { buildRunningSessionPrescription, nextRunningProgressionLevel } from "./engine";
import { deriveRunningIntervalProtocol } from "./intervals";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { RunningIntervalResult } from "./types";
function result(index: number, repeatTotal = 4): RunningIntervalResult {
  return {
    stepId: `work-${index}`,
    kind: "work",
    label: "Odcinek",
    repeatIndex: index,
    repeatTotal,
    targetMode: "time",
    targetValue: 180,
    targetLabel: "3:00",
    durationSec: 180,
    distanceM: 720,
    paceSecPerKm: 250,
    completed: true,
  };
}
describe("progresja oparta na rzeczywistym wykonaniu", () => {
  it("kolejne poziomy nie cofają objętości i zwiększają jeden parametr", () => {
    const work = [0, 1, 2, 3].map((progressionLevel) => {
      const prescription = buildRunningSessionPrescription({
        fieldMasKmh: 15,
        fieldMasTestedAt: "2026-10-10",
        date: "2026-10-15",
        sessionIndex: 0,
        progressionLevel,
      });
      const protocol = deriveRunningIntervalProtocol(
        sessionFixture({
          sections: {
            warmup: [],
            main: prescription.main,
            accessory: [],
            footballTransfer: [],
            cooldown: [],
          },
        }),
      );
      return protocol!.steps
        .filter((s) => s.kind === "work")
        .reduce((sum, s) => sum + s.target.value!, 0);
    });
    expect(work).toEqual([720, 840, 960, 1080]);
  });
  it("brak RPE i brak tempa nie zwiększają dawki", () => {
    const results = [1, 2, 3, 4].map((i) => result(i));
    expect(nextRunningProgressionLevel({ currentLevel: 1, rpe: null, results })).toBe(1);
    expect(
      nextRunningProgressionLevel({
        currentLevel: 1,
        rpe: 6,
        results: results.map((r) => ({ ...r, paceSecPerKm: null })),
      }),
    ).toBe(1);
  });
  it("dwa zapisane odcinki z sześciu nie są pełnym wykonaniem", () => {
    expect(
      nextRunningProgressionLevel({
        currentLevel: 2,
        rpe: 6,
        results: [result(1, 6), result(2, 6)],
      }),
    ).toBe(1);
  });
  it("zbyt wcześnie zakończone odcinki nie zwiększają poziomu", () => {
    expect(
      nextRunningProgressionLevel({
        currentLevel: 2,
        rpe: 6,
        results: [1, 2, 3, 4].map((i) => ({ ...result(i), durationSec: 60 })),
      }),
    ).toBe(1);
  });
});

describe("rozpoznawanie biegania bez piłki", () => {
  it("zapis bez piłki uruchamia odcinki, a rzeczywisty blok z piłką pozostaje wyłączony", () => {
    const make = (name: string) =>
      sessionFixture({
        sections: {
          warmup: [],
          main: [{ name, prescription: "4 × 3 min bieg, przerwa 2 min trucht" }],
          accessory: [],
          footballTransfer: [],
          cooldown: [],
        },
      });
    expect(
      deriveRunningIntervalProtocol(make("Interwały tlenowe bez piłki"))?.steps.filter(
        (s) => s.kind === "work",
      ),
    ).toHaveLength(4);
    expect(deriveRunningIntervalProtocol(make("Interwały z piłką"))).toBeNull();
  });
});
