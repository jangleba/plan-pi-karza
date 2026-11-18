import { describe, expect, it } from "vitest";
import { estimateFps, flightTimeFromFrames, frameMs, snapFps, splitsFromFrames } from "./video";

describe("pomiar z wideo", () => {
  it("czas lotu z klatek: 120 klatek/s, 60 klatek lotu = 0,5 s", () => {
    expect(flightTimeFromFrames(100, 160, 120)).toBeCloseTo(0.5, 5);
  });
  it("odrzuca lądowanie przed odbiciem", () => {
    expect(() => flightTimeFromFrames(100, 100, 120)).toThrow();
  });
  it("splity sprintu od startu", () => {
    const s = splitsFromFrames(10, [226, 382, 538], 120);
    expect(s[0]).toBeCloseTo(1.8, 5);
    expect(s[2]).toBeCloseTo(4.4, 5);
  });
  it("splity muszą rosnąć", () => {
    expect(() => splitsFromFrames(10, [200, 150], 120)).toThrow();
  });
  it("fps ze znaczników zaokrąglonych do 1 ms: 120 klatek/s, nie 125", () => {
    const t = Array.from({ length: 16 }, (_, i) => Math.round((i / 120) * 1000) / 1000);
    expect(snapFps(estimateFps(t)!)).toBe(120);
  });
  it("za mało klatek: brak fps", () => {
    expect(estimateFps([0, 0.01])).toBeNull();
  });
  it("długość klatki", () => {
    expect(frameMs(120)).toBeCloseTo(8.33, 1);
    expect(frameMs(30)).toBeCloseTo(33.3, 1);
  });
});
