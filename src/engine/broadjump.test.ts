import { describe, expect, it } from "vitest";
import { calibrate, jumpDistanceCm, jumpErrorCm } from "./broadjump";

describe("skok w dal z nagrania", () => {
  it("skala z wzrostu: odległość od telefonu nie zmienia wyniku", () => {
    // zawodnik 180 cm: blisko kamery 600 px, daleko 300 px; ten sam skok 2,40 m
    const near = calibrate(180, 100, 700);
    const far = calibrate(180, 100, 400);
    expect(near.cmPerPx).toBeCloseTo(0.3, 9);
    expect(far.cmPerPx).toBeCloseTo(0.6, 9);
    expect(jumpDistanceCm(200, 1000, near)).toBeCloseTo(240, 6); // 800 px blisko
    expect(jumpDistanceCm(200, 600, far)).toBeCloseTo(240, 6); // 400 px daleko
  });
  it("kierunek skoku nie ma znaczenia", () => {
    const cal = calibrate(175, 0, 500);
    expect(jumpDistanceCm(900, 100, cal)).toBeCloseTo(jumpDistanceCm(100, 900, cal), 9);
  });
  it("odrzuca nierealny wzrost i zbyt małego zawodnika w kadrze", () => {
    expect(() => calibrate(90, 0, 500)).toThrow(/Wzrost/);
    expect(() => calibrate(260, 0, 500)).toThrow(/Wzrost/);
    expect(() => calibrate(175, 400, 450)).toThrow(/większy/);
    expect(() => calibrate(175, 500, 100)).toThrow(/większy/); // głowa poniżej podłoża
  });
  it("szacunek błędu: rząd kilku cm, rośnie z dystansem i maleje przy większym zawodniku w kadrze", () => {
    const big = calibrate(180, 0, 700);
    const small = calibrate(180, 0, 300);
    const e = jumpErrorCm(240, big);
    expect(e).toBeGreaterThan(2);
    expect(e).toBeLessThan(6);
    expect(jumpErrorCm(240, small)).toBeGreaterThan(e);
    expect(jumpErrorCm(300, big)).toBeGreaterThan(jumpErrorCm(150, big));
  });
});
