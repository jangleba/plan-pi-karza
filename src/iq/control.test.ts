import { describe, expect, it } from "vitest";
import { ACCEL, SPEED_MAX, angDiff, drive, newDrive, turnTo, type Drive } from "./control";

const B = { minX: -1e3, maxX: 1e3, minY: -1e3, maxY: 1e3 };
const run = (s: Drive, stick: { r: number; f: number }, sec: number, dt = 1 / 60) => { for (let i = 0; i < Math.round(sec / dt); i++) drive(s, stick, dt, B); return s; };

describe("sterowanie: kierunek joysticka = kierunek biegu na ekranie", () => {
  it("do przodu: w 0,25 s prawie pełna prędkość wzdłuż osi ataku, bez zmiany kierunku", () => {
    const s = run(newDrive(0, 0), { r: 0, f: 1 }, 0.25);
    expect(s.speed).toBeGreaterThan(SPEED_MAX * 0.9);
    expect(s.y).toBeCloseTo(0, 9);
    expect(s.x).toBeGreaterThan(0.5);
    expect(Math.abs(s.heading)).toBeLessThan(1e-9);
  });

  it("w prawo: biegnie w prawo od razu (bez wstępnego skręcania), patrzy w prawo, kamera stoi", () => {
    const s = run(newDrive(0, 0), { r: 1, f: 0 }, 0.3);
    expect(s.y).toBeGreaterThan(0.5);
    expect(Math.abs(s.x)).toBeLessThan(1e-9);
    expect(Math.abs(angDiff(Math.PI / 2, s.heading))).toBeLessThan(0.05); // patrzy w prawo (+y)
    expect(s.cam).toBe(0);
    // w lewo: przeciwnie
    expect(run(newDrive(0, 0), { r: -1, f: 0 }, 0.3).y).toBeLessThan(-0.5);
  });

  it("po skosie biegnie dokładnie pod kątem wychylenia i nie szybciej niż po osi (kierunek zgodny z joystickiem)", () => {
    const s = run(newDrive(0, 0), { r: 1, f: 1 }, 1);
    expect(s.speed).toBeLessThanOrEqual(SPEED_MAX + 1e-9);
    expect(Math.atan2(s.vy, s.vx)).toBeCloseTo(Math.PI / 4, 3);
    expect(Math.atan2(s.y, s.x)).toBeCloseTo(Math.PI / 4, 1);
  });

  it("prędkość zależy od wychylenia: połowa wychylenia ≈ połowa prędkości (po martwej strefie)", () => {
    const half = run(newDrive(0, 0), { r: 0, f: 0.54 }, 1).speed;
    expect(half).toBeGreaterThan(SPEED_MAX * 0.4);
    expect(half).toBeLessThan(SPEED_MAX * 0.6);
    expect(run(newDrive(0, 0), { r: 0, f: 0.05 }, 1).speed).toBe(0); // martwa strefa
  });

  it("zmiana kierunku jest natychmiastowa i płynna: z biegu do przodu w bok w 0,3 s", () => {
    const s = run(newDrive(0, 0), { r: 0, f: 1 }, 1);
    run(s, { r: 1, f: 0 }, 0.3);
    expect(Math.atan2(s.vy, s.vx)).toBeGreaterThan(Math.PI / 4); // już wyraźnie w prawo
    expect(s.speed).toBeGreaterThan(SPEED_MAX * 0.7);
    run(s, { r: 1, f: 0 }, 0.4);
    expect(Math.atan2(s.vy, s.vx)).toBeGreaterThan(Math.PI / 2 - 0.05);
  });

  it("puszczenie joysticka: zatrzymanie w ok. 0,15 s, kierunek zostaje (celowanie podania)", () => {
    const s = run(newDrive(0, 0), { r: 1, f: 0 }, 1);
    const h = s.heading;
    run(s, { r: 0, f: 0 }, 0.15);
    expect(s.speed).toBeLessThan(0.1);
    expect(s.heading).toBeCloseTo(h, 6);
  });

  it("wynik nie zależy od liczby klatek na sekundę (30, 60, 120 kl./s)", () => {
    const at = (dt: number) => run(newDrive(0, 0), { r: 0.6, f: 0.9 }, 1.2, dt);
    const a = at(1 / 30), b = at(1 / 60), c = at(1 / 120);
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeLessThan(0.15);
    expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeLessThan(0.08);
  });

  it("rozpęd 0 → pełna prędkość trwa ok. 0,17 s (stała ACCEL)", () => {
    expect(SPEED_MAX / ACCEL).toBeLessThan(0.2);
  });

  it("granice boiska zatrzymują zawodnika bez drgań", () => {
    const s = newDrive(0, 0);
    for (let i = 0; i < 120; i++) drive(s, { r: 0, f: 1 }, 1 / 60, { minX: -5, maxX: 3, minY: -5, maxY: 5 });
    expect(s.x).toBeCloseTo(3, 9);
    expect(s.vx).toBe(0);
  });

  it("przed zamachem zawodnik staje i obraca się do celu", () => {
    const s = run(newDrive(0, 0), { r: 0, f: 1 }, 1);
    for (let i = 0; i < 60; i++) turnTo(s, Math.PI / 2, 1 / 60);
    expect(Math.abs(angDiff(Math.PI / 2, s.heading))).toBeLessThan(0.01);
    expect(s.speed).toBeLessThan(0.05);
  });
});
