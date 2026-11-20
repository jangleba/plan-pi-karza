import { describe, expect, it } from "vitest";
import { buildTimeline, pathLength, pointAlong, stateAt } from "./drillAnim";
import { POSITION_DRILLS, TECHNIQUE_DRILLS, drillsFor } from "./technique";
import { DRILL_GROUPS } from "./drill";
import type { Drill } from "./drill";

const base = { id: "t", title: "t", group: "dribble" as const, field: { width: 20, height: 20, kind: "patch" as const }, cones: [], goal: "", dose: "", points: [], source: "" };
const drill: Drill = { ...base, arrows: [
  { style: "pass", points: [{ x: 0, y: 0 }, { x: 0, y: 10 }], step: 2 },
  { style: "dribble", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], step: 1 },
] };

describe("animacja ćwiczenia", () => {
  it("długość i punkt na łamanej", () => {
    const l = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(pathLength(l)).toBe(20);
    expect(pointAlong(l, 0.5)).toEqual({ x: 10, y: 0 });
    expect(pointAlong(l, 0.75)).toEqual({ x: 10, y: 5 });
    expect(pointAlong(l, 2)).toEqual({ x: 10, y: 10 });
  });
  it("kroki idą wg numeru kroku, nie kolejności w tablicy", () => {
    const tl = buildTimeline(drill);
    expect(tl.segs.map((s) => s.style)).toEqual(["dribble", "pass"]);
    expect(tl.segs[1]!.t0).toBeGreaterThan(tl.segs[0]!.t1);
    expect(tl.total).toBeGreaterThan(tl.segs[1]!.t1);
  });
  it("prowadzenie: zawodnik i piłka razem, piłka przed zawodnikiem; podanie: leci piłka, zawodnik stoi", () => {
    const tl = buildTimeline(drill);
    const mid = stateAt(drill, tl, (tl.segs[0]!.t0 + tl.segs[0]!.t1) / 2);
    expect(mid.active).toBe(true);
    expect(mid.player.x).toBeGreaterThan(1);
    expect(mid.ball!.x).toBeGreaterThan(mid.player.x);
    const pass = stateAt(drill, tl, (tl.segs[1]!.t0 + tl.segs[1]!.t1) / 2);
    expect(pass.player).toEqual({ x: 10, y: 0 }); // zawodnik został tam, gdzie skończył prowadzenie
    expect(pass.ball!.y).toBeGreaterThan(0);
    expect(pass.ball!.y).toBeLessThan(10);
  });
  it("pętla: czas poza końcem wraca na początek; pusty szkic nie wywraca", () => {
    const tl = buildTimeline(drill);
    const again = stateAt(drill, tl, tl.total + 0.01);
    expect(again.seg).toBe(0);
    expect(again.player.x).toBeLessThan(0.5);
    const empty = { ...drill, arrows: [] };
    expect(stateAt(empty, buildTimeline(empty), 5)).toMatchObject({ ball: null, seg: -1 });
  });
  it("wszystkie ćwiczenia z biblioteki mają skończoną animację w granicach boiska", () => {
    for (const d of [...POSITION_DRILLS, ...TECHNIQUE_DRILLS]) {
      const tl = buildTimeline(d);
      expect(tl.total, d.id).toBeGreaterThan(0);
      expect(tl.total, d.id).toBeLessThan(40);
      for (let t = 0; t < tl.total; t += 0.25) {
        const s = stateAt(d, tl, t);
        for (const p of [s.player, s.ball]) if (p) { expect(p.x, `${d.id} x`).toBeGreaterThanOrEqual(-1); expect(p.x, `${d.id} x`).toBeLessThanOrEqual(d.field.width + 1); expect(p.y, `${d.id} y`).toBeGreaterThanOrEqual(-1); expect(p.y, `${d.id} y`).toBeLessThanOrEqual(d.field.height + 1); }
      }
    }
  });
});

describe("biblioteka ćwiczeń z piłką", () => {
  const all = [...POSITION_DRILLS, ...TECHNIQUE_DRILLS];
  it("id są unikalne, a każda grupa ma co najmniej trzy ćwiczenia", () => {
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    for (const [g] of DRILL_GROUPS) expect(all.filter((d) => d.group === g).length, g).toBeGreaterThanOrEqual(3);
  });
  it("każde ćwiczenie ma cel, dawkę, wskazówki i źródło; kroki mają opisy i kolejne numery", () => {
    for (const d of all) {
      expect(d.goal && d.dose && d.source, d.id).toBeTruthy();
      expect(d.points.length, d.id).toBeGreaterThanOrEqual(2);
      const steps = d.arrows.map((a) => a.step ?? 0);
      expect(steps, d.id).toEqual(steps.map((_, i) => i + 1));
    }
  });
  it("każdy zawodnik ma prowadzenie i pierwszy kontakt; wykończenie tylko ofensywne pozycje", () => {
    for (const pos of ["bramkarz", "obronca", "pomocnik", "skrzydlowy", "napastnik", undefined] as const)
      for (const g of ["dribble", "touch"] as const) expect(drillsFor(pos).some((d) => d.group === g), `${pos} ${g}`).toBe(true);
    for (const pos of ["pomocnik", "skrzydlowy", "napastnik"] as const) expect(drillsFor(pos).some((d) => d.group === "finish"), pos).toBe(true);
    expect(drillsFor("bramkarz").some((d) => d.group === "finish")).toBe(false);
  });
});
