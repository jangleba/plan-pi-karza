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

import { analyzeJump, type PoseFrame } from "./broadjump";

/** Syntetyczne nagranie: zawodnik 180 cm = 500 px, skok 240 cm w prawo, 30 kl./s. */
function clip(opts: { dist?: number; fps?: number; scale?: number; noise?: boolean; flip?: boolean } = {}): Array<PoseFrame | null> {
  const fps = opts.fps ?? 30, S = 500 * (opts.scale ?? 1), ground = 600, cm = 180 / S;
  const dx = ((opts.dist ?? 240) / cm) * (opts.flip ? -1 : 1);
  const x0 = opts.flip ? 1000 : 250; // linia palców
  const frames: Array<PoseFrame | null> = [];
  for (let i = 0; i < fps * 4; i++) {
    const t = i / fps;
    const inAir = t >= 1.5 && t < 2.0;
    const landed = t >= 2.0;
    const lift = inAir ? 0.2 * S * Math.sin(((t - 1.5) / 0.5) * Math.PI) : 0;
    const xs = landed ? x0 + dx : inAir ? x0 + (dx * (t - 1.5)) / 0.5 : x0;
    const dir = opts.flip ? -1 : 1;
    const jitter = opts.noise ? (i % 3) - 1 : 0;
    const heelY = ground - HEEL_ * S - lift;
    frames.push({
      eyeY: ground - 0.936 * S - lift, heelY, footY: heelY - 0.01 * S,
      heelXs: [xs - dir * 0.2 * S + jitter, xs - dir * 0.2 * S + dir * 8], toeXs: [xs + jitter, xs - dir * 6],
    });
  }
  return frames;
}
const HEEL_ = 0.025;

describe("automatyczny pomiar skoku z punktów sylwetki", () => {
  it("odległość z wzrostu, bez zaznaczania: 240 cm", () => {
    const r = analyzeJump(clip(), 30, 180)!;
    // pięta (xs − 0,2·S) leży 100 px za czubkiem, więc dystans mierzymy od palców do tyłu pięty
    expect(r).not.toBeNull();
    expect(r.cal.cmPerPx).toBeCloseTo(0.36, 2);
    expect(r.distanceCm).toBeCloseTo(240 - 0.2 * 500 * 0.36, 0); // 240 − 36 = 204: pięta zostaje za palcami
    expect(r.takeoffS).toBeCloseTo(1.5, 1);
    expect(r.landingS).toBeCloseTo(2.0, 1);
  });
  it("odległość od telefonu nie zmienia wyniku (zawodnik dwa razy mniejszy w kadrze)", () => {
    const near = analyzeJump(clip({ scale: 1 }), 30, 180)!;
    const far = analyzeJump(clip({ scale: 0.6 }), 30, 180)!;
    expect(far.distanceCm).toBeCloseTo(near.distanceCm, 0);
  });
  it("skok w lewo daje ten sam wynik, drobny szum nie psuje", () => {
    const r = analyzeJump(clip({ flip: true, noise: true }), 30, 180)!;
    const base = analyzeJump(clip(), 30, 180)!;
    expect(r.distanceCm).toBeGreaterThan(base.distanceCm - 4);
    expect(r.distanceCm).toBeLessThan(base.distanceCm + 4);
  });
  it("zwraca null, gdy nie ma skoku, brak sylwetki albo zły wzrost", () => {
    const still = clip().map((f) => ({ ...f!, footY: 590, heelY: 587.5 }));
    expect(analyzeJump(still, 30, 180)).toBeNull();
    expect(analyzeJump(clip().map(() => null), 30, 180)).toBeNull();
    expect(analyzeJump(clip(), 30, 80)).toBeNull();
  });
});
