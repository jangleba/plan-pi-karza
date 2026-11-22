import { describe, expect, it } from "vitest";
import { activeMs, emptyClock, pauseClock, resumeClock, startClock } from "./runClock";
import { buildPhases, durationText, paceTargetRange, runScreen } from "./runView";
import { gpsState } from "./gps";
import { addPoint, emptyTrack } from "./track";
import { compactRoute, coloredRuns, sanitizeRuns, segmentLines, segmentPaces } from "./routeMap";
import { calcMas } from "./mas";
import { runSession } from "./run";

describe("zegar biegu", () => {
  it("nie liczy czasu pauzy, także trwającej", () => {
    let c = startClock(1000);
    expect(activeMs(c, 11_000)).toBe(10_000);
    c = pauseClock(c, 11_000);
    expect(activeMs(c, 60_000)).toBe(10_000);
    c = resumeClock(c, 41_000);
    expect(activeMs(c, 46_000)).toBe(15_000);
  });
  it("czas z dawnej chwili (znacznik GPS) uwzględnia pauzę", () => {
    let c = pauseClock(startClock(0), 10_000);
    c = resumeClock(c, 30_000);
    expect(activeMs(c, 20_000)).toBe(10_000); // w trakcie pauzy
    expect(activeMs(c, 35_000)).toBe(15_000);
  });
  it("brak startu = 0", () => { expect(activeMs(emptyClock(), 5000)).toBe(0); });
});

describe("ekran interwałów", () => {
  const mas = calcMas(1500);
  const s = runSession(mas, "volume", "intermediate"); // 4 × (3 min pracy + 2 min przerwy)
  const ph = buildPhases(s);
  it("numeruje odcinki pracy, nie wszystkie fazy", () => {
    const at = (sec: number) => runScreen(ph, sec);
    expect(at(10).workNo).toBe(1);
    expect(at(10).workTotal).toBe(4);
    const second = at(180 + 120 + 5); // druga praca
    expect(second.kind).toBe("work"); expect(second.workNo).toBe(2);
    const rest = at(185);
    expect(rest.kind).toBe("rest"); expect(rest.workNo).toBe(1);
    expect(rest.next).toContain("odcinek 2 z 4");
  });
  it("po ostatniej fazie plan jest ukończony, a liczba odcinków się nie zmienia", () => {
    const total = ph.reduce((a, p) => a + p.seconds, 0);
    const done = runScreen(ph, total + 5);
    expect(done.kind).toBe("complete"); expect(done.left).toBe(0); expect(done.workNo).toBe(4);
    expect(runScreen(ph, total - 5).next).toContain("ostatnia");
  });
  it("bieg ciągły ma jedną fazę bez „następnie”", () => {
    const c = buildPhases(runSession(mas, "deload", "beginner"));
    const r = runScreen(c, 100);
    expect(r.kind).toBe("continuous"); expect(r.next).toBeNull();
    expect(runScreen(c, 20 * 60 + 1).kind).toBe("complete");
  });
  it("tempo docelowe i czas trwania", () => {
    expect(paceTargetRange("4:17/km")).toBe("4:09–4:25 /km");
    expect(paceTargetRange("brak")).toBeNull();
    expect(durationText(90)).toBe("90 s"); expect(durationText(180)).toBe("3 min"); expect(durationText(150)).toBe("2:30 min");
  });
  it("blok bieżącej fazy wyznacza tempo (indeks bloku)", () => {
    expect(runScreen(ph, 10).blockIndex).toBe(0);
  });
});

describe("stan GPS", () => {
  const now = 100_000;
  it("aktywny tylko po świeżym, dokładnym odczycie", () => {
    expect(gpsState({ fix: null, now, error: null })).toBe("searching");
    expect(gpsState({ fix: { at: now - 2000, acc: 8 }, now, error: null })).toBe("active");
    expect(gpsState({ fix: { at: now - 2000, acc: 60 }, now, error: null })).toBe("weak");
    expect(gpsState({ fix: { at: now - 20_000, acc: 8 }, now, error: null })).toBe("stale");
    expect(gpsState({ fix: null, now, error: "denied" })).toBe("denied");
    expect(gpsState({ fix: null, now, error: "unavailable" })).toBe("unavailable");
  });
});

describe("odcinki zapisu (pauza, utrata GPS)", () => {
  // ~11 m na 0,0001° szerokości
  const p = (lat: number, tS: number, seg = 0) => ({ lat, lon: 21, t: tS * 1000, acc: 5, seg });
  it("po pauzie nie dolicza dystansu przez lukę", () => {
    let s = emptyTrack();
    s = addPoint(s, p(52.0, 0)); s = addPoint(s, p(52.0004, 10)); // ~44 m
    const d1 = s.distanceM;
    s = addPoint(s, p(52.0100, 12, 1)); // 1,1 km dalej, ale po pauzie (nowy odcinek)
    expect(s.distanceM).toBeCloseTo(d1, 5);
    s = addPoint(s, p(52.0104, 22, 1));
    expect(s.distanceM).toBeGreaterThan(d1 + 30);
    expect(s.distanceM).toBeLessThan(d1 + 60);
    expect(s.points.map((x) => x.seg)).toEqual([0, 0, 1, 1]);
  });
  it("długa utrata sygnału też tworzy nowy odcinek, a kolejny punkt zostaje w nim", () => {
    let s = emptyTrack();
    s = addPoint(s, p(52.0, 0)); s = addPoint(s, p(52.0004, 10));
    s = addPoint(s, p(52.0020, 70)); // 60 s luki
    s = addPoint(s, p(52.0024, 80));
    expect(s.points.map((x) => x.seg)).toEqual([0, 0, 1, 1]);
    expect(s.distanceM).toBeLessThan(100);
  });
  it("trasa: linie bez łączenia odcinków, tempo i zapis z numerem odcinka", () => {
    let s = emptyTrack();
    for (let i = 0; i < 4; i++) s = addPoint(s, p(52 + i * 0.0003, i * 8));
    for (let i = 0; i < 4; i++) s = addPoint(s, p(52.01 + i * 0.0003, 40 + i * 8, 1));
    const route = compactRoute(s.points).map(([lat, lon, t, seg]) => ({ lat: lat!, lon: lon!, t: t!, s: seg! }));
    expect(segmentLines(route)).toHaveLength(2);
    expect(coloredRuns(route).every((r) => r.line.length >= 2)).toBe(true);
    expect(coloredRuns(route).every((r) => r.line.every(([la]) => la < 52.005) || r.line.every(([la]) => la > 52.005))).toBe(true); // żadna linia nie łączy odcinków
    expect(segmentPaces(route)[3]).toBeNull();
    const back = sanitizeRuns([{ date: "2026-11-22", distanceM: 100, elapsedMs: 1000, splits: [], route: route.map((q) => [q.lat, q.lon, q.t, q.s]) }])[0]!.route;
    expect(back.map((q) => q.s)).toEqual(route.map((q) => q.s));
  });
  it("stare zapisy bez numeru odcinka nadal się odczytują", () => {
    const r = sanitizeRuns([{ date: "2026-01-01", distanceM: 1, elapsedMs: 1, splits: [], route: [[52, 21, 5], [52.001, 21]] }])[0]!.route;
    expect(r[0]!.s).toBeUndefined(); expect(r).toHaveLength(2);
  });
});
