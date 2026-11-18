import { describe, expect, it } from "vitest";
import { addPoint, averagePace, currentPace, distanceAt, emptyTrack, haversine, intervalTimeline, kmSplits, phaseAt } from "./track";

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
