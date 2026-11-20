import { describe, expect, it } from "vitest";
import { addPoint, averagePace, currentPace, distanceAt, emptyTrack, haversine, intervalTimeline, kmSplits, paceSeries, phaseAt, phaseResults } from "./track";

// punkt co ~1 s, bieg na północ ok. 4 m/s; 1° szer. ≈ 111 195 m
const LAT0 = 52.0, LON = 21.0;
const at = (meters: number, sec: number, acc = 5) => ({ lat: LAT0 + meters / 111_195, lon: LON, t: sec * 1000, acc });

function run(speed: number, seconds: number) {
  let s = emptyTrack();
  for (let i = 0; i <= seconds; i++) s = addPoint(s, at(i * speed, i));
  return s;
}

describe("bieg z GPS", () => {
  it("haversine: 1000 m na północ", () => {
    expect(haversine(at(0, 0), at(1000, 0))).toBeCloseTo(1000, 0);
  });
  it("dystans biegu 4 m/s przez 300 s ≈ 1200 m", () => {
    expect(run(4, 300).distanceM).toBeCloseTo(1200, -1);
  });
  it("odrzuca punkty o słabej dokładności i skoki ponad 11 m/s", () => {
    let s = emptyTrack();
    s = addPoint(s, at(0, 0));
    s = addPoint(s, at(4, 1, 80)); // słaba dokładność
    s = addPoint(s, at(100, 2)); // skok 50 m/s
    s = addPoint(s, at(8, 2));
    expect(s.distanceM).toBeCloseTo(8, 0);
  });
  it("dystans po 5 minutach (test MAS) z interpolacji", () => {
    expect(distanceAt(run(5, 400), 300_000)).toBeCloseTo(1500, -1);
  });
  it("odcinki km: 4 m/s to 250 s na km", () => {
    const sp = kmSplits(run(4, 600));
    expect(sp).toHaveLength(2);
    expect(sp[0]).toBeCloseTo(250, 0);
  });
  it("tempo bieżące i średnie: 4 m/s = 250 s/km", () => {
    const s = run(4, 120);
    expect(currentPace(s, 120_000)!).toBeCloseTo(250, 0);
    expect(averagePace(s.distanceM, 120_000)!).toBeCloseTo(250, 0);
  });
  it("tempo na początku biegu (12 s) liczone z faktycznego czasu, nie z pełnego okna", () => {
    expect(currentPace(run(4, 12), 12_000)!).toBeCloseTo(250, 0);
  });
  it("oś interwałów 15/15 x 3, 2 serie z przerwą 180 s", () => {
    const tl = intervalTimeline({ reps: 3, sets: 2, workS: 15, restS: 15, setRestS: 180 });
    expect(tl.map((p) => p.kind).join(",")).toBe("work,rest,work,rest,work,rest,work,rest,work,rest,work");
    expect(tl[5]!.seconds).toBe(180);
    expect(phaseAt(tl, 0)).toEqual({ index: 0, left: 15 });
    expect(phaseAt(tl, 20)).toEqual({ index: 1, left: 10 });
    expect(phaseAt(tl, 10_000)).toBeNull();
  });
});

describe("kolejne powtórzenia, wyniki odcinków i wykres tempa", () => {
  const tl = intervalTimeline({ reps: 3, sets: 1, workS: 20, restS: 10, setRestS: 0 });
  it("odcinki pracy znają swój numer powtórzenia i serii", () => {
    expect(tl.filter((p) => p.kind === "work").map((p) => [p.rep, p.reps, p.set])).toEqual([[1, 3, 1], [2, 3, 1], [3, 3, 1]]);
    expect(tl.filter((p) => p.kind === "rest").every((p) => p.rep === undefined)).toBe(true);
  });
  it("wyniki liczą dystans i tempo tylko w zakończonych odcinkach pracy", () => {
    const s = run(5, 100); // 5 m/s przez cały czas
    const r = phaseResults(tl, s, 100_000);
    expect(r).toHaveLength(3);
    expect(r[0]!.distanceM).toBeGreaterThan(95);
    expect(r[0]!.distanceM).toBeLessThan(105);
    expect(r[0]!.paceSPerKm).toBeCloseTo(200, -1); // 5 m/s = 3:20/km
    // bieg przerwany w trakcie drugiego odcinka: policzony tylko pierwszy
    expect(phaseResults(tl, s, 40_000)).toHaveLength(1);
  });
  it("wykres tempa: punkty co krok, bez punktów w miejscu", () => {
    const series = paceSeries(run(4, 120), 120_000);
    expect(series.length).toBeGreaterThanOrEqual(7);
    expect(series.every((p) => Math.abs(p.pace - 250) < 15)).toBe(true);
    expect(paceSeries(emptyTrack(), 120_000)).toEqual([]);
  });
});

describe("przerwa w sygnale GPS", () => {
  it("po przerwie dłuższej niż 30 s nie dolicza prostej linii między punktami", () => {
    let s = run(4, 20);
    const before = s.distanceM;
    s = addPoint(s, at(20 * 4 + 400, 80)); // 60 s ciszy, potem punkt 400 m dalej
    expect(s.distanceM).toBeCloseTo(before, 5);
    expect(s.points[s.points.length - 1]!.t).toBe(80_000); // punkt zostaje jako nowy punkt odniesienia
    s = addPoint(s, at(20 * 4 + 400 + 4, 81)); // dalej liczymy normalnie
    expect(s.distanceM).toBeGreaterThan(before);
  });
});
