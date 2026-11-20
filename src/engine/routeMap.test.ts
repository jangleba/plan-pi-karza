import { describe, expect, it } from "vitest";
import { bearing, coloredRuns, compactRoute, decimate, headingOf, paceColor, paceRange, routeBounds, sanitizeRuns, segmentPaces, type RoutePoint } from "./routeMap";
import type { GeoPoint } from "./track";

const LAT0 = 52, LON0 = 21;
/** Bieg na północ: prędkość zmienia się w czasie (funkcja t → m/s). */
function run(seconds: number, speed: (t: number) => number): RoutePoint[] {
  const pts: RoutePoint[] = []; let m = 0;
  for (let t = 0; t <= seconds; t++) { pts.push({ lat: LAT0 + m / 111_195, lon: LON0, t }); m += speed(t); }
  return pts;
}

describe("tempo odcinków trasy", () => {
  it("stała prędkość 4 m/s daje tempo 4:10/km na wszystkich odcinkach", () => {
    const p = segmentPaces(run(120, () => 4));
    expect(p).toHaveLength(120);
    for (const v of p) expect(v).toBeCloseTo(250, -1);
  });
  it("zmiana prędkości jest widoczna: druga połowa szybsza", () => {
    const p = segmentPaces(run(120, (t) => (t < 60 ? 3 : 5)));
    expect(p[20]!).toBeGreaterThan(p[100]!);
    expect(p[20]!).toBeCloseTo(333, -1);
    expect(p[100]!).toBeCloseTo(200, -1);
  });
  it("brak czasu albo bieg w miejscu daje null, a nie błędne tempo", () => {
    expect(segmentPaces([{ lat: LAT0, lon: LON0 }, { lat: LAT0 + 0.0001, lon: LON0 }])).toEqual([null]);
    expect(segmentPaces(run(30, () => 0)).every((x) => x === null)).toBe(true);
    expect(segmentPaces([])).toEqual([]);
  });
});

describe("kolory tempa", () => {
  it("szybko zielone, wolno czerwone, środek żółty; null szary", () => {
    const r = { lo: 200, hi: 400 };
    expect(paceColor(200, r)).toBe("#2e9e62");
    expect(paceColor(400, r)).toBe("#e0554f");
    expect(paceColor(300, r)).toBe("#f0b429");
    expect(paceColor(100, r)).toBe("#2e9e62");
    expect(paceColor(null, r)).toBe("#8a94a6");
    expect(paceColor(300, null)).toBe("#8a94a6");
  });
  it("zakres odporny na skoki, z minimalną rozpiętością", () => {
    const base = Array.from({ length: 100 }, (_, i) => 300 + (i % 10));
    const r = paceRange([...base, 5, 5000])!;
    expect(r.lo).toBeGreaterThan(290);
    expect(r.hi).toBeLessThan(330);
    const flat = paceRange([300, 300, 300])!;
    expect(flat.hi - flat.lo).toBeGreaterThanOrEqual(20);
    expect(paceRange([null, 300])).toBeNull();
  });
  it("kolorowe odcinki łączą sąsiednie w tym samym kolorze", () => {
    const runs = coloredRuns(run(200, (t) => (t < 100 ? 3 : 5)));
    expect(runs.length).toBeLessThan(40);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs[0]!.color).not.toBe(runs[runs.length - 1]!.color);
    expect(runs.reduce((s, r) => s + r.line.length - 1, 0)).toBe(200);
  });
});

describe("kierunek i granice", () => {
  const o = { lat: LAT0, lon: LON0 };
  it("kierunki świata", () => {
    expect(bearing(o, { lat: LAT0 + 0.01, lon: LON0 })).toBeCloseTo(0, 0);
    expect(bearing(o, { lat: LAT0, lon: LON0 + 0.01 })).toBeCloseTo(90, 0);
    expect(bearing(o, { lat: LAT0 - 0.01, lon: LON0 })).toBeCloseTo(180, 0);
    expect(bearing(o, { lat: LAT0, lon: LON0 - 0.01 })).toBeCloseTo(270, 0);
  });
  it("kierunek biegu z ostatnich punktów, null gdy stoi", () => {
    expect(headingOf(run(20, () => 4))).toBeCloseTo(0, 0);
    expect(headingOf(run(20, () => 0))).toBeNull();
    expect(headingOf([o])).toBeNull();
  });
  it("granice trasy", () => {
    expect(routeBounds([])).toBeNull();
    expect(routeBounds([{ lat: 52, lon: 21 }, { lat: 52.1, lon: 20.9 }])).toEqual({ south: 52, north: 52.1, west: 20.9, east: 21 });
  });
});

describe("zapis i odczyt biegów", () => {
  const gp = (i: number): GeoPoint => ({ lat: LAT0 + i * 1e-5, lon: LON0, t: i * 1000, acc: 5 });
  it("trasa do zapisu: trójki [lat, lon, t(s)], przerzedzona do limitu z pierwszym i ostatnim punktem", () => {
    const pts = Array.from({ length: 3000 }, (_, i) => gp(i));
    const c = compactRoute(pts, 500);
    expect(c).toHaveLength(500);
    expect(c[0]).toEqual([LAT0, LON0, 0]);
    expect(c[499]![2]).toBe(2999);
    expect(compactRoute(pts.slice(0, 10))).toHaveLength(10);
  });
  it("odczyt: stare punkty bez czasu, nowe z czasem; uszkodzone wpisy i punkty są pomijane", () => {
    const runs = sanitizeRuns([
      { date: "2026-11-01", distanceM: 5000, elapsedMs: 1500000, splits: [300, "x", 305], route: [[52, 21], [52.001, 21, 30], [999, 1, 2], "zły", [52, "x"]] },
      { date: "zła", distanceM: 1, elapsedMs: 1 }, null, 5, { date: "2026-11-02", distanceM: -5, elapsedMs: 1 },
      { date: "2026-11-03", distanceM: 1000, elapsedMs: 300000 },
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.route).toEqual([{ lat: 52, lon: 21 }, { lat: 52.001, lon: 21, t: 30 }]);
    expect(runs[0]!.splits).toEqual([300, 305]);
    expect(runs[1]!.route).toEqual([]);
    expect(sanitizeRuns("x")).toEqual([]);
  });
  it("przerzedzanie do rysowania zachowuje końce", () => {
    const a = Array.from({ length: 1000 }, (_, i) => i);
    const d = decimate(a, 100);
    expect(d).toHaveLength(100); expect(d[0]).toBe(0); expect(d[99]).toBe(999);
    expect(decimate([1, 2, 3], 100)).toEqual([1, 2, 3]);
  });
});
