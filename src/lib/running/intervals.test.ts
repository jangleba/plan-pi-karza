import { describe, expect, it } from "vitest";
import type { SessionDay } from "@/lib/loadwise/types";
import {
  buildIntervalResult,
  deriveRunningIntervalProtocol,
  intervalRemainingLabel,
  intervalStepProgress,
  sanitizeIntervalResults,
} from "./intervals";

function session(main: SessionDay["sections"]["main"]): SessionDay {
  return {
    date: "2026-09-03",
    dayName: "Czwartek",
    dayType: "training",
    title: "Baza tlenowa i tempo",
    goalLabel: "Wytrzymałość",
    intensity: "wysoka",
    durationMin: 50,
    reason: "test",
    safetyNote: null,
    whyToday: "test",
    sessionType: "Wydolność",
    goalOfSession: "Interwały",
    riskManaged: "test",
    avoidToday: "test",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main, accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
  };
}

describe("prowadzenie interwałowe", () => {
  it("rozpisuje odcinki czasowe i przerwy", () => {
    const protocol = deriveRunningIntervalProtocol(
      session([
        {
          name: "Interwały ekstensywne",
          prescription: "4 × 3 min bieg, przerwa 2 min",
          rest: "2 min",
          cue: "Równe tempo",
        },
      ]),
    )!;
    expect(protocol.summary).toBe("4 × 3:00 / 2:00");
    expect(protocol.steps).toHaveLength(7);
    expect(protocol.steps[0].target).toMatchObject({ mode: "time", value: 180 });
    expect(protocol.steps[1].target).toMatchObject({ mode: "time", value: 120 });
  });

  it("dla krótkich sprintów wymaga ręcznego potwierdzenia dystansu", () => {
    const protocol = deriveRunningIntervalProtocol(
      session([
        {
          name: "Powtarzalne sprinty",
          prescription: "6 × 20–25 m, przerwa 30–40 s",
          rest: "30–40 s aktywnej przerwy",
        },
      ]),
    )!;
    expect(protocol.steps[0].target).toMatchObject({
      mode: "distance",
      value: 20,
      autoAdvance: false,
    });
    expect(protocol.steps[1].target).toMatchObject({ mode: "time", value: 30, autoAdvance: true });
  });

  it("pomija interwał z piłką i nie tworzy protokołu dla biegu ciągłego", () => {
    expect(
      deriveRunningIntervalProtocol(
        session([
          {
            name: "Powtarzalny wysiłek z piłką",
            prescription: "4 × 45 s prowadzenie / 45 s trucht",
          },
        ]),
      ),
    ).toBeNull();
    expect(
      deriveRunningIntervalProtocol(
        session([
          {
            name: "Ciągły bieg tlenowy",
            prescription: "18 min, tętno tlenowe",
          },
        ]),
      ),
    ).toBeNull();
  });

  it("liczy postęp, pozostały cel i wynik odcinka", () => {
    const step = deriveRunningIntervalProtocol(
      session([
        {
          name: "Tempo ekstensywne",
          prescription: "6 × 100 m, trucht powrót",
          rest: "trucht 100 m",
        },
      ]),
    )!.steps[0];
    expect(intervalStepProgress(step, 0, 25)).toBe(0.25);
    expect(intervalRemainingLabel(step, 0, 25)).toBe("75 m");
    const result = buildIntervalResult({ step, durationSec: 20, distanceM: 100, completed: true });
    expect(result.paceSecPerKm).toBe(200);
    expect(sanitizeIntervalResults([result, { broken: true }])).toEqual([result]);
  });

  it("odczytuje zakres tempa z instrukcji i zapisuje go w wyniku", () => {
    const protocol = deriveRunningIntervalProtocol(
      session([{ name: "Interwały", prescription: "4 × 3 min bieg, przerwa 2 min trucht, tempo 4:13–4:27/km" }]),
    )!;
    expect(protocol.steps[0].target.paceTarget).toEqual({
      fastestSecPerKm: 253,
      slowestSecPerKm: 267,
      label: "4:13–4:27/km",
    });
    expect(buildIntervalResult({ step: protocol.steps[0], durationSec: 180, distanceM: 700, completed: true }))
      .toMatchObject({ targetPaceFastestSecPerKm: 253, targetPaceSlowestSecPerKm: 267 });
  });
});
