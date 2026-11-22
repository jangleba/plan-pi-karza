import { describe, expect, it } from "vitest";
import { ARROW_COLOR, ARROW_LEGEND, ARROW_NAME, arrowsInOrder, drillStart, equipmentLine, mirrorDrill, withVariant, type Drill } from "./drill";
import { buildTimeline, stateAt } from "./drillAnim";

const base: Drill = {
  id: "t", title: "T", group: "finish", field: { width: 24, height: 22, kind: "half" },
  cones: [{ x: 6, y: 14 }], goals: [{ x: 12, y: 1, width: 7 }], rebounders: [{ x: 4, y: 15, angle: 20 }],
  arrows: [
    { style: "shot", points: [{ x: 10, y: 12 }, { x: 9, y: 1 }], step: 2 },
    { style: "pass", points: [{ x: 10, y: 18 }, { x: 4, y: 15 }], step: 1 },
  ],
  variants: [{ id: "B", title: "B", arrows: [{ style: "run", points: [{ x: 20, y: 18 }, { x: 18, y: 10 }], step: 1 }], tip: "wariant B" }],
  goal: "g", dose: "d", points: [], source: "s",
};

describe("model ćwiczenia z diagramem", () => {
  it("sześć rodzajów strzałek ma nazwę, skrót i kolor; podanie po ziemi i górą mają ten sam kolor", () => {
    const kinds = ["pass", "lob", "dribble", "run", "touch", "shot"] as const;
    for (const k of kinds) { expect(ARROW_LEGEND[k]).toBeTruthy(); expect(ARROW_NAME[k]).toBeTruthy(); expect(ARROW_COLOR[k]).toMatch(/^#[0-9a-f]{6}$/); }
    expect(ARROW_COLOR.pass).toBe(ARROW_COLOR.lob);
    expect(new Set(["pass", "dribble", "run", "touch", "shot"].map((k) => ARROW_COLOR[k as "pass"])).size).toBe(5);
  });
  it("kolejność kroków i miejsce startu", () => {
    expect(arrowsInOrder(base).map((a) => a.style)).toEqual(["pass", "shot"]);
    expect(drillStart(base)).toEqual({ x: 10, y: 18 });
    expect(drillStart({ ...base, start: { x: 1, y: 2 } })).toEqual({ x: 1, y: 2 });
  });
  it("lustro odbija w poziomie wszystko: strzałki, stożki, sprzęt (z kątem) i warianty; dwukrotne lustro to oryginał", () => {
    const m = mirrorDrill(base);
    expect(m.arrows[0]!.points[0]).toEqual({ x: 14, y: 12 });
    expect(m.cones[0]).toMatchObject({ x: 18, y: 14 });
    expect(m.goals![0]).toMatchObject({ x: 12 });
    expect(m.rebounders![0]).toMatchObject({ x: 20, y: 15, angle: -20 });
    expect(m.variants![0]!.arrows[0]!.points[0]).toEqual({ x: 4, y: 18 });
    expect(mirrorDrill(m)).toEqual(base);
    expect(base.arrows[0]!.points[0]).toEqual({ x: 10, y: 12 }); // oryginał bez zmian
  });
  it("wariant B podmienia strzałki i podpis, A i brak wariantu zostawiają ćwiczenie", () => {
    expect(withVariant(base, "A")).toBe(base);
    const b = withVariant(base, "B");
    expect(b.arrows).toHaveLength(1);
    expect(b.tip).toBe("wariant B");
    expect(b.cones).toBe(base.cones);
    expect(withVariant({ ...base, variants: undefined }, "B")).toEqual({ ...base, variants: undefined });
  });
  it("animacja: pierwszy kontakt i podanie górą ruszają piłkę, a zawodnik stoi", () => {
    const d: Drill = { ...base, arrows: [
      { style: "run", points: [{ x: 2, y: 20 }, { x: 8, y: 14 }], step: 1 },
      { style: "touch", points: [{ x: 8, y: 14 }, { x: 8.8, y: 13 }], step: 2 },
      { style: "lob", points: [{ x: 8.8, y: 13 }, { x: 18, y: 8 }], step: 3 },
    ] };
    const tl = buildTimeline(d);
    const mid = stateAt(d, tl, (tl.segs[1]!.t0 + tl.segs[1]!.t1) / 2);
    expect(mid.player.x).toBeCloseTo(8, 6); // zawodnik na końcu biegu
    expect(mid.ball).not.toBeNull();
    const end = stateAt(d, tl, tl.segs[2]!.t1 + 0.01);
    expect(end.ball!.x).toBeCloseTo(18, 6);
    expect(end.player.x).toBeCloseTo(8, 6);
  });
});

describe("opis sprzętu", () => {
  it("odmienia „stożek” i wymienia rebounder, bramkę i piłki", () => {
    const mk = (n: number): Drill => ({ ...base, cones: Array.from({ length: n }, (_, i) => ({ x: i, y: 0 })) });
    expect(equipmentLine(mk(1))).toBe("rebounder · 1 stożek · bramka · piłki");
    expect(equipmentLine(mk(2))).toContain("2 stożki");
    expect(equipmentLine(mk(5))).toContain("5 stożków");
    expect(equipmentLine({ ...base, rebounders: undefined, goals: undefined, cones: [] })).toBe("piłki");
  });
});


import { ALL_DRILLS } from "./technique";
import { withVariant as withV } from "./drill";

describe("ćwiczenia z grupy „Wykończenie i strzały” w nowym modelu", () => {
  const finish = ALL_DRILLS.filter((d) => d.group === "finish" && !d.id.startsWith("tech2."));
  it("są cztery, każde ma wariant B, opis ustawienia sprzętu, podpowiedź i nazwę wariantu A", () => {
    expect(finish).toHaveLength(4);
    for (const d of finish) {
      expect(d.variants?.some((v) => v.id === "B"), d.id).toBe(true);
      expect(d.titleA, d.id).toBeTruthy();
      expect(d.setup, d.id).toMatch(/\d/); // konkretne odległości
      expect(d.tip, d.id).toBeTruthy();
    }
  });
  it("każdy krok w obu wariantach ma opis, kroki są kolejne od 1, a wszystkie punkty mieszczą się w polu ćwiczenia", () => {
    for (const d of finish) for (const id of ["A", "B"] as const) {
      const e = withV(d, id);
      const arrows = arrowsInOrder(e);
      expect(arrows.map((a) => a.step), `${d.id} ${id}`).toEqual(arrows.map((_, i) => i + 1));
      for (const a of arrows) {
        expect(a.note, `${d.id} ${id} krok ${a.step}`).toBeTruthy();
        for (const p of a.points) {
          expect(p.x, `${d.id} ${id} x`).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(e.field.width);
          expect(p.y, `${d.id} ${id} y`).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(e.field.height);
        }
      }
      expect(arrows.at(-1)!.style, `${d.id} ${id} kończy się strzałem`).toBe("shot");
      for (const r of e.rebounders ?? []) { expect(r.x).toBeGreaterThan(0); expect(r.x).toBeLessThan(e.field.width); }
    }
  });
  it("ćwiczenia ze ścianką mają rebounder, a lustro zamienia ich stronę", () => {
    for (const id of ["run-in-finish", "wall-one-touch-shot"]) {
      const d = ALL_DRILLS.find((x) => x.id === id)!;
      expect(d.rebounders?.length, id).toBeGreaterThan(0);
      expect(mirrorDrill(d).rebounders![0]!.x).toBeCloseTo(d.field.width - d.rebounders![0]!.x, 6);
    }
  });
});
