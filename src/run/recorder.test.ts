// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let rec: typeof import("./recorder");
const T0 = new Date("2026-11-22T10:00:00Z").getTime();
const fix = (lat: number, sec: number) => ({ lat, lon: 21, acc: 5, timestamp: T0 + sec * 1000 });

beforeEach(async () => {
  localStorage.clear();
  vi.useFakeTimers(); vi.setSystemTime(T0);
  vi.resetModules();
  vi.stubGlobal("navigator", { ...navigator, geolocation: { watchPosition: () => 1, clearWatch: () => {} } });
  rec = await import("./recorder");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const at = (sec: number) => vi.setSystemTime(T0 + sec * 1000);

describe("rejestrator biegu", () => {
  it("nie liczy czasu ani dystansu z pauzy i zaczyna nowy odcinek po wznowieniu", () => {
    rec.start("Test");
    rec._debugEmit(fix(52.0, 0)); at(10); rec._debugEmit(fix(52.0004, 10)); // ~44 m
    const d1 = rec.getSnapshot().track.distanceM;
    at(10); rec.pause();
    at(70); // minuta pauzy
    rec.resume();
    expect(rec.elapsedMs(rec.getSnapshot(), T0 + 70_000)).toBe(10_000);
    at(72); rec._debugEmit(fix(52.02, 72)); // daleko, ale po pauzie
    expect(rec.getSnapshot().track.distanceM).toBeCloseTo(d1, 5);
    at(82); rec._debugEmit(fix(52.0204, 82));
    const s = rec.getSnapshot();
    expect(s.track.points.map((p) => p.seg)).toEqual([0, 0, 1, 1]);
    expect(s.track.distanceM).toBeGreaterThan(d1 + 30);
    expect(s.track.distanceM).toBeLessThan(d1 + 60);
    // czas punktu po wznowieniu = czas aktywny, nie zegarowy
    expect(s.track.points[2]!.t).toBe(12_000);
  });

  it("zakończenie zapisuje ostateczny czas i jest odporne na ponowne wywołanie", async () => {
    rec.start("Test"); at(30);
    await rec.finish();
    const a = rec.getSnapshot();
    expect(a.status).toBe("done"); expect(a.finalMs).toBe(30_000);
    at(90); await rec.finish();
    expect(rec.getSnapshot().finalMs).toBe(30_000);
    expect(rec.elapsedMs(rec.getSnapshot(), T0 + 500_000)).toBe(30_000);
  });

  it("po przerwaniu procesu wraca jako pauza od ostatniej potwierdzonej chwili, bez dopisywania brakującego czasu", async () => {
    rec.start("Test");
    rec._debugEmit(fix(52.0, 0)); at(20); rec._debugEmit(fix(52.0004, 20));
    at(25); vi.advanceTimersByTime(5000); // tętno zapisu
    expect(rec.hasSavedRun()).toBe(true);
    // „zabicie” procesu: nowy moduł, godzinę później
    vi.resetModules(); at(3600 + 25);
    const rec2 = await import("./recorder");
    expect(rec2.restore()).toBe(true);
    const s = rec2.getSnapshot();
    expect(s.status).toBe("paused");
    expect(s.interruptedAt).not.toBeNull();
    expect(s.track.points).toHaveLength(2);
    const el = rec2.elapsedMs(s, T0 + (3600 + 25) * 1000);
    expect(el).toBeGreaterThanOrEqual(20_000); expect(el).toBeLessThanOrEqual(30_000); // nie ~1 h
    rec2.resume(); at(3600 + 30); rec2._debugEmit(fix(52.01, 3600 + 30));
    expect(rec2.getSnapshot().track.points.at(-1)!.seg).toBe(1);
  });

  it("reset po zapisie czyści zapis roboczy", () => {
    rec.start("Test"); at(5);
    expect(rec.hasSavedRun()).toBe(true);
    rec.reset();
    expect(rec.hasSavedRun()).toBe(false);
    expect(rec.getSnapshot().status).toBe("idle");
  });

  it("odczyt o słabej dokładności nie dopisuje punktu, ale zostaje jako ostatni odczyt", () => {
    rec.start("Test");
    rec._debugEmit({ lat: 52, lon: 21, acc: 80, timestamp: T0 + 1000 });
    expect(rec.getSnapshot().track.points).toHaveLength(0);
    expect(rec.getSnapshot().fix?.acc).toBe(80);
    expect(rec.gpsOf(rec.getSnapshot(), T0 + 2000)).toBe("weak");
  });
});
