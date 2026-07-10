import { describe, it, expect } from "vitest";
import {
  flightTimeToHeightCm,
  reactiveStrengthIndex,
  averageSpeed,
  jointAngleDeg,
  interpolateCrossingTime,
  withinPlausibleRange,
} from "./physics";

describe("physics", () => {
  it("liczy wysokość skoku z czasu lotu (Flight Time Method)", () => {
    // t=0.5s → h = 9.81*0.25/8 = 0.3066 m ≈ 30.7 cm
    expect(flightTimeToHeightCm(0.5)).toBeCloseTo(30.7, 1);
    expect(flightTimeToHeightCm(0)).toBe(0);
    expect(flightTimeToHeightCm(-1)).toBe(0);
  });

  it("liczy RSI = wysokość(m)/czas kontaktu(s)", () => {
    expect(reactiveStrengthIndex(0.3, 0.2)).toBeCloseTo(1.5, 2);
    expect(reactiveStrengthIndex(0.3, 0)).toBe(0);
  });

  it("liczy prędkość średnią sprintu", () => {
    const s = averageSpeed(20, 3.2);
    expect(s.ms).toBeCloseTo(6.25, 2);
    expect(s.kmh).toBeCloseTo(22.5, 1);
    expect(averageSpeed(20, 0).ms).toBe(0);
  });

  it("liczy kąt w stawie z trzech punktów", () => {
    const a = { x: 0, y: 1 };
    const b = { x: 0, y: 0 };
    const c = { x: 1, y: 0 };
    expect(jointAngleDeg(a, b, c)).toBeCloseTo(90, 1);
  });

  it("interpoluje moment przekroczenia progu", () => {
    // od 0.9 do 0.5 między t=1 a t=2, próg 0.7 → t=1.5
    expect(interpolateCrossingTime(1, 0.9, 2, 0.5, 0.7)).toBeCloseTo(1.5, 3);
  });

  it("weryfikuje zakres fizyczny", () => {
    expect(withinPlausibleRange(30, 5, 90)).toBe(true);
    expect(withinPlausibleRange(200, 5, 90)).toBe(false);
    expect(withinPlausibleRange(NaN, 5, 90)).toBe(false);
  });
});
