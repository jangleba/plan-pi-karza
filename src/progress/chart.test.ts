import { describe, expect, it } from "vitest";
import { monotonePath, niceTicks, timeFraction } from "./chart";

describe("monotonePath", () => {
  const pts: Array<[number, number]> = [[0, 10], [10, 30], [20, 30], [30, 12], [40, 50]];
  it("zaczyna się w pierwszym punkcie i kończy w ostatnim, przechodzi przez każdy", () => {
    const d = monotonePath(pts);
    expect(d.startsWith("M0.00,10.00")).toBe(true);
    for (const [x, y] of pts.slice(1)) expect(d).toContain(` ${x.toFixed(2)},${y.toFixed(2)}`);
  });
  it("nie wychodzi poza zakres wartości (brak przestrzałów) – punkty kontrolne w granicach sąsiadów", () => {
    const nums = monotonePath(pts).match(/-?\d+\.\d+/g)!.map(Number);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50 + 1e-6);
  });
  it("plateau pozostaje płaskie (dwa równe punkty obok siebie)", () => {
    const d = monotonePath([[0, 0], [10, 20], [20, 20], [30, 40]]);
    const seg = d.split(" C").slice(1)[1]!; // odcinek między 10 a 20
    const ys = seg.match(/-?\d+\.\d+/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(ys.every((y) => Math.abs(y - 20) < 1e-6)).toBe(true);
  });
  it("jeden punkt i pusta lista", () => {
    expect(monotonePath([[5, 5]])).toBe("M5.00,5.00");
    expect(monotonePath([])).toBe("");
  });
});

describe("niceTicks", () => {
  it("okrągłe kroki obejmujące zakres", () => {
    const t = niceTicks(83, 97, 3);
    expect(t[0]!).toBeLessThanOrEqual(83); expect(t.at(-1)!).toBeGreaterThanOrEqual(97);
    expect(t).toEqual([80, 85, 90, 95, 100].filter((v) => v >= t[0]! && v <= t.at(-1)!));
  });
  it("małe wartości (sekundy) i płaski zakres", () => {
    expect(niceTicks(1.82, 1.95, 3).every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6)).toBe(true);
    expect(niceTicks(5, 5)).toHaveLength(3);
  });
});

describe("timeFraction", () => {
  it("0 na początku, 1 na końcu, proporcjonalnie w środku", () => {
    expect(timeFraction("2026-10-01", "2026-10-01", "2026-10-31")).toBe(0);
    expect(timeFraction("2026-10-31", "2026-10-01", "2026-10-31")).toBe(1);
    expect(timeFraction("2026-10-16", "2026-10-01", "2026-10-31")).toBeCloseTo(0.5, 5);
    expect(timeFraction("2026-10-01", "2026-10-01", "2026-10-01")).toBe(0.5);
  });
});
