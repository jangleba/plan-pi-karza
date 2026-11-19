import { describe, expect, it } from "vitest";
import { CAM_FOLLOW, SPEED_MAX, TURN_MAX, angDiff, drive, turnTo, type Drive } from "./control";

const B = { minX: -1e3, maxX: 1e3, minY: -1e3, maxY: 1e3 };
const fresh = (): Drive => ({ x: 0, y: 0, heading: 0, speed: 0, cam: 0 });
const run = (s: Drive, stick: { r: number; f: number }, sec: number) => { for (let i = 0; i < sec * 60; i++) drive(s, stick, 1 / 60, B); return s; };

describe("sterowanie jak w samochodzie", () => {
  it("do przodu: biegnie wzdłuż kierunku do prędkości maksymalnej, bez zmiany kierunku", () => {
    const s = run(fresh(), { r: 0, f: 1 }, 2);
    expect(s.speed).toBeGreaterThan(SPEED_MAX * 0.98);
    expect(s.heading).toBe(0);
    expect(s.y).toBeCloseTo(0, 6);
    expect(s.x).toBeGreaterThan(8);
  });

  it("w bok w miejscu: obraca się w prawo ze stałą prędkością kątową i nie przesuwa", () => {
    const s = run(fresh(), { r: 1, f: 0 }, 1);
    expect(s.heading).toBeCloseTo(TURN_MAX, 1);
    expect(Math.hypot(s.x, s.y)).toBeLessThan(1e-6);
    // lewo = przeciwnie
    expect(run(fresh(), { r: -1, f: 0 }, 1).heading).toBeCloseTo(-TURN_MAX, 1);
  });

  it("brak biegania w kółko: trzymanie joysticka w bok daje stałą prędkość kątową, kamera ją dogania i nie ucieka", () => {
    const s = fresh();
    const rates: number[] = [];
    let prev = 0;
    for (let i = 0; i < 180; i++) { drive(s, { r: 1, f: 0 }, 1 / 60, B); rates.push((s.heading - prev) * 60); prev = s.heading; }
    // prędkość kątowa stała (nie rośnie z obrotem kamery)
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(1e-6);
    // kamera za kierunkiem z opóźnieniem ≈ prędkość kątowa / CAM_FOLLOW
    const lag = s.heading - s.cam;
    expect(lag).toBeGreaterThan(0.1);
    expect(lag).toBeCloseTo(TURN_MAX / CAM_FOLLOW, 0);
  });

  it("łuk: do przodu + w prawo skręca w prawo i przesuwa się po łuku", () => {
    const s = run(fresh(), { r: 0.6, f: 1 }, 2);
    expect(s.heading).toBeGreaterThan(1);
    expect(s.y).toBeGreaterThan(2);
    expect(s.speed).toBeGreaterThan(5);
  });

  it("po skręcie „do przodu” biegnie w nowym kierunku (kamera i kierunek zgodne)", () => {
    const s = run(fresh(), { r: 1, f: 0 }, 0.46); // ok. 90°
    run(s, { r: 0, f: 0 }, 0.6); // kamera dogania
    expect(Math.abs(angDiff(s.heading, s.cam))).toBeLessThan(0.05);
    const x0 = s.x, y0 = s.y;
    run(s, { r: 0, f: 1 }, 1);
    const dx = s.x - x0, dy = s.y - y0;
    expect(Math.atan2(dy, dx)).toBeCloseTo(s.heading, 2);
  });

  it("joystick do tyłu zatrzymuje (bez cofania)", () => {
    const s = run(fresh(), { r: 0, f: 1 }, 2);
    run(s, { r: 0, f: -1 }, 1.5);
    expect(s.speed).toBeLessThan(0.1);
  });

  it("martwa strefa: drobne wychylenie nie obraca", () => {
    expect(run(fresh(), { r: 0.08, f: 0 }, 2).heading).toBe(0);
  });

  it("kamera dogania kierunek najkrótszym łukiem przez ±π (bez obrotu o prawie 360°)", () => {
    const s: Drive = { ...fresh(), heading: -3.1, cam: 3.1 };
    for (let i = 0; i < 20; i++) drive(s, { r: 0, f: 0 }, 1 / 60, B);
    expect(Math.abs(s.cam)).toBeGreaterThan(3.0); // nadal blisko ±π, a nie przez 0
    expect(angDiff(s.heading, s.cam)).toBeLessThan(0.1 + Math.abs(angDiff(-3.1, 3.1)));
  });

  it("turnTo: obrót do celu przed kopnięciem i wyhamowanie", () => {
    const s = run(fresh(), { r: 0, f: 1 }, 1);
    for (let i = 0; i < 30; i++) turnTo(s, 1.2, 1 / 60);
    expect(Math.abs(angDiff(1.2, s.heading))).toBeLessThan(0.05);
    expect(s.speed).toBeLessThan(0.3);
  });

  it("granice boiska", () => {
    const s = fresh();
    for (let i = 0; i < 600; i++) drive(s, { r: 0, f: 1 }, 1 / 60, { minX: 0, maxX: 5, minY: -1, maxY: 1 });
    expect(s.x).toBe(5);
  });
});
