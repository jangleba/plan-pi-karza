import { describe, expect, it } from "vitest";
import { COLORS, DEFAULT_OPTS, PACES, drawOne, makeSequence, rng, type StimOpts } from "./stimuli";

const base: StimOpts = { ...DEFAULT_OPTS, durationS: 120 };

describe("sekwencja bodźców", () => {
  it("jest deterministyczna z ziarna i różni się dla innego", () => {
    const a = makeSequence(base, 7), b = makeSequence(base, 7), c = makeSequence(base, 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("odstępy mieszczą się w zakresie tempa, pierwszy bodziec o t = 0, nie wychodzi poza czas", () => {
    for (const p of Object.values(PACES)) {
      const s = makeSequence({ ...base, minGap: p.minGap, maxGap: p.maxGap }, 3);
      expect(s[0]!.at).toBe(0);
      for (let i = 1; i < s.length; i++) {
        const gap = s[i]!.at - s[i - 1]!.at;
        expect(gap).toBeGreaterThanOrEqual(p.minGap - 0.11);
        expect(gap).toBeLessThanOrEqual(p.maxGap + 0.11);
      }
      expect(s.at(-1)!.at).toBeLessThan(120);
      const avg = (p.minGap + p.maxGap) / 2;
      expect(s.length).toBeGreaterThan(120 / (avg + 0.6));
      expect(s.length).toBeLessThan(120 / (avg - 0.6));
    }
  });

  it("nigdy dwa takie same bodźce z rzędu", () => {
    const s = makeSequence({ ...base, kinds: ["arrow"], dirs: 2, minGap: 1, maxGap: 1.5, durationS: 300 }, 5);
    for (let i = 1; i < s.length; i++) expect(s[i]!.dir).not.toBe(s[i - 1]!.dir);
  });

  it("2 kierunki = tylko lewo/prawo; 4 kierunki = wszystkie cztery się pojawiają; kolory ograniczone do wybranej liczby", () => {
    const two = makeSequence({ ...base, kinds: ["arrow"], dirs: 2 }, 1);
    expect(new Set(two.map((s) => s.dir))).toEqual(new Set(["left", "right"]));
    const four = makeSequence({ ...base, kinds: ["arrow"], dirs: 4, durationS: 300 }, 1);
    expect(new Set(four.map((s) => s.dir)).size).toBe(4);
    const col = makeSequence({ ...base, kinds: ["color"], colors: 2, durationS: 300 }, 1);
    expect(new Set(col.map((s) => s.color!.id))).toEqual(new Set(COLORS.slice(0, 2).map((c) => c.id)));
  });

  it("liczby w zakresie 1…max; połączenie ma kolor i kierunek; wybrane rodzaje są respektowane", () => {
    const num = makeSequence({ ...base, kinds: ["number"], maxNumber: 5 }, 2);
    for (const s of num) { expect(s.number).toBeGreaterThanOrEqual(1); expect(s.number).toBeLessThanOrEqual(5); }
    const combo = makeSequence({ ...base, kinds: ["combo"] }, 2);
    for (const s of combo) { expect(s.dir).toBeDefined(); expect(s.color).toBeDefined(); }
    const mix = makeSequence({ ...base, kinds: ["arrow", "number"], durationS: 300 }, 2);
    expect(new Set(mix.map((s) => s.kind))).toEqual(new Set(["arrow", "number"]));
  });

  it("puste rodzaje → domyślne (nie wywala)", () => {
    expect(makeSequence({ ...base, kinds: [] }, 1).length).toBeGreaterThan(5);
  });
});

describe("losowanie", () => {
  it("nie powtarza poprzedniego wyniku; zakresy; strona to lewa/prawa", () => {
    const r = rng(9);
    let prev = null as ReturnType<typeof drawOne> | null;
    for (let i = 0; i < 100; i++) {
      const d = drawOne("number", 4, prev, r);
      expect(d.number).toBeGreaterThanOrEqual(1); expect(d.number).toBeLessThanOrEqual(4);
      if (prev) expect(d.label).not.toBe(prev.label);
      prev = d;
    }
    const sides = new Set(Array.from({ length: 40 }, () => drawOne("side", 2, null, r).label));
    expect(sides).toEqual(new Set(["Lewa", "Prawa"]));
    expect(drawOne("color", 3, null, r).color).toBeDefined();
    expect(drawOne("dir", 2, null, r).dir).toMatch(/left|right/);
  });
  it("wszystkie wyniki pojawiają się z czasem (równomierność z grubsza)", () => {
    const r = rng(1);
    const counts: Record<string, number> = {};
    let prev = null as ReturnType<typeof drawOne> | null;
    for (let i = 0; i < 4000; i++) { prev = drawOne("color", 4, prev, r); counts[prev.label] = (counts[prev.label] ?? 0) + 1; }
    for (const v of Object.values(counts)) { expect(v).toBeGreaterThan(800); expect(v).toBeLessThan(1200); }
  });
});
