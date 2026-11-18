import { describe, expect, it } from "vitest";
import { detectFlight, heightErrorCm } from "./jumpdetect";
import { jumpHeightFromFlightTime } from "./lab";

/** Symulacja: stoi 1,5 s, przysiad (stopy na ziemi), lot `flight` s, stoi dalej. Stopy na y=0.9. */
function simulate(fps: number, flight: number, opts: { noise?: number; scale?: number; drop?: number[] } = {}) {
  const { noise = 0.001, scale = 1, drop = [] } = opts;
  const g = 9.81, v = (g * flight) / 2;
  const out: Array<number | null> = [];
  const takeoffT = 2.0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let i = 0; i < fps * 4; i++) {
    const t = i / fps;
    let h = 0;
    if (t >= takeoffT && t < takeoffT + flight) { const tt = t - takeoffT; h = v * tt - (g * tt * tt) / 2; }
    // h w metrach; skala = jak duża jest osoba w kadrze (ok. 0,3 kadru na 1 m przy 1)
    out.push(0.9 - h * 0.3 * scale + rnd() * noise);
  }
  for (const d of drop) out[d] = null;
  return { out, takeoffFrame: Math.ceil(takeoffT * fps), fps };
}

describe("wykrywanie lotu CMJ", () => {
  it("240 kl./s: czas lotu 0,5 s wykryty z dokładnością do 2 klatek", () => {
    const { out, fps } = simulate(240, 0.5);
    const r = detectFlight(out, fps)!;
    expect(Math.abs(r.flightS - 0.5)).toBeLessThan(2 / fps);
    expect(r.confidence).toBeGreaterThan(0.8);
  });
  it("60 kl./s: błąd czasu lotu w granicach 2 klatek (ok. 33 ms)", () => {
    const { out, fps } = simulate(60, 0.55);
    const r = detectFlight(out, fps)!;
    expect(Math.abs(r.flightS - 0.55)).toBeLessThan(2 / fps);
  });
  it("odległość od telefonu (mniejsza sylwetka w kadrze) nie zmienia czasu lotu", () => {
    const near = detectFlight(simulate(120, 0.5, { scale: 1.5 }).out, 120)!;
    const far = detectFlight(simulate(120, 0.5, { scale: 0.5 }).out, 120)!;
    expect(Math.abs(near.flightS - far.flightS)).toBeLessThan(2 / 120);
  });
  it("pojedyncza zgubiona klatka w locie nie psuje wyniku", () => {
    const { out, takeoffFrame, fps } = simulate(120, 0.5, { drop: [] });
    out[takeoffFrame + 20] = null;
    const r = detectFlight(out, fps)!;
    expect(Math.abs(r.flightS - 0.5)).toBeLessThan(2 / fps);
  });
  it("brak skoku: brak wyniku", () => {
    const flat = Array.from({ length: 240 }, () => 0.9);
    expect(detectFlight(flat, 60)).toBeNull();
  });
  it("niepewność wysokości przy 60 kl./s ok. 2 cm na klatkę, przy 240 ok. 0,5 cm", () => {
    expect(heightErrorCm(0.5, 60)).toBeCloseTo(2.04, 1);
    expect(heightErrorCm(0.5, 240)).toBeCloseTo(0.51, 1);
    expect(jumpHeightFromFlightTime(0.5)).toBeCloseTo(30.7, 0);
  });
});
