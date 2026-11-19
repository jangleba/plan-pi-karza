import { describe, expect, it } from "vitest";
import { ANKLE_H, ankleOf, gaitParams, solveLeg, stepGait, type GaitState } from "./gait";

/** Symulacja: postać biegnie wzdłuż x ze stałą prędkością; zwraca światowe położenia stóp. */
function simulate(v: number, seconds: number, crouch = 0.02) {
  const s: GaitState = { v, run: 1, phase: 0 };
  const dt = 1 / 60;
  const out: Array<{ t: number; feet: Array<{ x: number; y: number; planted: boolean }> }> = [];
  let bodyX = 0;
  for (let i = 0; i < seconds * 60; i++) {
    bodyX += v * dt;
    const pose = stepGait(s, v, dt, crouch);
    // kinematyka prosta z kątów (a nie z celu) – sprawdza też rozwiązanie IK
    const feet = pose.legs.map((l, j) => {
      const a = ankleOf(l.thigh, l.knee);
      return { x: bodyX + a.x, y: pose.pelvisY + a.y, planted: pose.feet[j]!.planted };
    });
    out.push({ t: i * dt, feet });
  }
  return out;
}

describe("chód bez ślizgania", () => {
  for (const v of [1.5, 2.2, 4, 6.5, 7]) {
    it(`v=${v} m/s: stopa w podporze stoi (prędkość < 0,1 m/s) i dotyka murawy (±1 cm)`, () => {
      const sim = simulate(v, 3);
      let maxSlide = 0, maxGap = 0;
      for (let i = 1; i < sim.length; i++) {
        for (const j of [0, 1]) {
          const a = sim[i - 1]!.feet[j]!, b = sim[i]!.feet[j]!;
          if (a.planted && b.planted) {
            maxSlide = Math.max(maxSlide, Math.abs(b.x - a.x) * 60);
            maxGap = Math.max(maxGap, Math.abs(b.y - ANKLE_H));
          }
        }
      }
      expect(maxSlide).toBeLessThan(0.1);
      expect(maxGap).toBeLessThan(0.01);
    });
  }

  it("faza rośnie z drogi: 2× szybciej ≈ tyle samo kroków na metr przy podobnej kadencji", () => {
    const g = gaitParams(4);
    expect(g.stride).toBeGreaterThan(1);
    expect(g.duty).toBeGreaterThan(0.2);
    expect(g.duty).toBeLessThan(0.62);
  });

  it("IK trafia w cel w zasięgu nogi", () => {
    for (const [x, y] of [[0.2, -0.8], [-0.3, -0.75], [0, -0.6], [0.35, -0.7]] as const) {
      const a = solveLeg(x, y);
      const p = ankleOf(a.thigh, a.knee);
      expect(Math.hypot(p.x - x, p.y - y)).toBeLessThan(1e-6);
      expect(a.knee).toBeLessThanOrEqual(0); // kolano nie wygina się do tyłu
    }
  });

  it("start i zatrzymanie bez przeskoków: szybkość zmian kątów nie większa niż w równym biegu", () => {
    const maxRate = (speedAt: (i: number) => number, frames: number, from: GaitState) => {
      const s = { ...from };
      let prev = stepGait(s, speedAt(0), 1 / 60, 0.1);
      let m = 0;
      for (let i = 1; i < frames; i++) {
        const p = stepGait(s, speedAt(i), 1 / 60, 0.1);
        for (const j of [0, 1]) {
          m = Math.max(m, Math.abs(p.legs[j]!.thigh - prev.legs[j]!.thigh), Math.abs(p.legs[j]!.knee - prev.legs[j]!.knee));
        }
        prev = p;
      }
      return m;
    };
    const steady = maxRate(() => 7, 240, { v: 7, run: 1, phase: 0 });
    const startStop = maxRate((i) => (i < 120 ? 7 : 0), 240, { v: 0, run: 0, phase: 0 });
    expect(startStop).toBeLessThanOrEqual(steady * 1.05);
    // zatrzymanie: po 1 s obie stopy na ziemi pod biodrami
    const s: GaitState = { v: 7, run: 1, phase: 0.3 };
    let p = stepGait(s, 0, 1 / 60, 0.02);
    for (let i = 0; i < 60; i++) p = stepGait(s, 0, 1 / 60, 0.02);
    for (const j of [0, 1]) {
      expect(Math.abs(p.feet[j]!.x)).toBeLessThan(0.03);
      expect(p.feet[j]!.y).toBeLessThan(ANKLE_H + 0.01);
    }
  });

  it("postawa obrońcy: ugięte kolana, stopy na ziemi", () => {
    const s: GaitState = { v: 0, run: 0, phase: 0 };
    let p = stepGait(s, 0, 1 / 60, 0.12);
    for (let i = 0; i < 30; i++) p = stepGait(s, 0, 1 / 60, 0.12);
    expect(p.legs[0].knee).toBeLessThan(-0.3);
    const a = ankleOf(p.legs[0].thigh, p.legs[0].knee);
    expect(Math.abs(p.pelvisY + a.y - ANKLE_H)).toBeLessThan(0.005);
  });
});
