import { describe, expect, it } from "vitest";
import { HALF, placeDrill } from "./halfPitch";
import { POSITION_DRILLS, TECHNIQUE_DRILLS } from "./technique";

describe("ćwiczenia na połowie boiska", () => {
  const all = [...POSITION_DRILLS, ...TECHNIQUE_DRILLS];
  it("każde ćwiczenie mieści się w całości na połowie boiska", () => {
    for (const d of all) {
      const { box } = placeDrill(d);
      expect(box.x0, d.id).toBeGreaterThanOrEqual(0);
      expect(box.y0, d.id).toBeGreaterThanOrEqual(0);
      expect(box.x1, d.id).toBeLessThanOrEqual(HALF.w);
      expect(box.y1, d.id).toBeLessThanOrEqual(HALF.h);
    }
  });
  it("ćwiczenia z bramką: środek bramki ćwiczenia trafia w środek bramki boiska, pole jest przed bramką", () => {
    const withGoal = all.filter((d) => d.goals?.length);
    expect(withGoal.length).toBeGreaterThanOrEqual(4);
    for (const d of withGoal) {
      const p = placeDrill(d), g = d.goals![0]!;
      const m = p.map({ x: g.x, y: g.y });
      expect(m.x, d.id).toBeCloseTo(HALF.goalX, 6);
      expect(m.y, d.id).toBeCloseTo(g.y, 6);
      expect(p.box.y0, d.id).toBe(0); // zaczyna się na linii bramkowej
    }
  });
  it("ćwiczenia bez bramki: wyśrodkowane w poprzek i poza polem karnym tam, gdzie się da", () => {
    for (const d of all.filter((x) => !x.goals?.length)) {
      const { box } = placeDrill(d);
      expect((box.x0 + box.x1) / 2, d.id).toBeCloseTo(HALF.w / 2, 6);
      expect(box.y0, d.id).toBeGreaterThan(HALF.boxD); // za polem karnym
    }
  });
  it("odwzorowanie jest przesunięciem: odległości i kąty się nie zmieniają", () => {
    const d = all[0]!, p = placeDrill(d);
    const a = p.map({ x: 1, y: 2 }), b = p.map({ x: 4, y: 6 });
    expect(b.x - a.x).toBeCloseTo(3, 9);
    expect(b.y - a.y).toBeCloseTo(4, 9);
  });
});
