import { describe, expect, it } from "vitest";
import { ACUTE_HIGH, ACUTE_MODERATE, loadNote, loadOf, loadSummary, normalizeExtras, weekExtraLoad, withExtraLoad, type ExtraActivity } from "./extra";
import { adaptSession, readinessScore, strainOf, type CheckIn } from "./adapt";
import type { HistoryEvent } from "./history";

const ok: CheckIn = { recovery: 3, feeling: 3, less: false };
const ex = (date: string, kind: ExtraActivity["kind"], minutes: number, effort: ExtraActivity["effort"], id = `${date}${kind}`): ExtraActivity => ({ id, date, kind, minutes, effort });
const T = "2026-11-22";

describe("własna jednostka: obciążenie", () => {
  it("minuty × wysiłek × waga rodzaju; sauna i spacer liczą się mało", () => {
    expect(loadOf(ex(T, "run", 60, "medium"))).toBe(300);
    expect(loadOf(ex(T, "football", 70, "hard"))).toBe(560);
    expect(loadOf(ex(T, "sauna", 30, "easy"))).toBe(23);
    expect(loadOf(ex(T, "walk", 60, "easy"))).toBe(90);
    expect(loadOf(ex(T, "bike", 120, "medium"))).toBe(480);
  });

  it("czas ponad 240 min jest obcinany", () => { expect(loadOf(ex(T, "run", 999, "easy"))).toBe(240 * 3); });

  it("spacer, sauna i basen nie ruszają planu", () => {
    const e = [ex(T, "walk", 90, "easy"), ex(T, "sauna", 30, "easy"), ex(T, "swim", 40, "easy")];
    const r = withExtraLoad(ok, e, [], T);
    expect(r.adjusted).toBe(false);
    expect(r.checkIn).toEqual(ok);
  });

  it("wczoraj ciężka jednostka obniża regenerację o 1 i skraca sesję; samopoczucie bez zmian", () => {
    const e = [ex("2026-11-21", "football", 90, "hard")]; // 90×8 = 720; po dobie ×0,6 = 432 → próg 450 niewiele...
    const s = loadSummary(e, [], T);
    expect(s.acute).toBe(432);
    expect(s.level).toBe("low");
    const e2 = [ex("2026-11-21", "football", 120, "hard")]; // 960 × 0,6 = 576
    const r = withExtraLoad(ok, e2, [], T);
    expect(r.summary.level).toBe("moderate");
    expect(r.checkIn).toEqual({ recovery: 2, feeling: 3, less: false });
    expect(r.adjusted).toBe(true);
    expect(readinessScore(r.checkIn)).toBeLessThan(readinessScore(ok));
    expect(strainOf(r.checkIn)).toBe("light");
  });

  it("dwa ciężkie dni z rzędu: duże obciążenie → regeneracja 1, „dziś mniej” i wyraźnie lżej", () => {
    const e = [ex(T, "run", 90, "hard"), ex("2026-11-21", "football", 90, "hard")]; // 720 + 720×0,6
    const r = withExtraLoad(ok, e, [], T);
    expect(r.summary.acute).toBeGreaterThanOrEqual(ACUTE_HIGH);
    expect(r.checkIn).toEqual({ recovery: 1, feeling: 3, less: true });
    expect(loadNote(r.summary)).toMatch(/bardzo ciężkie/);
  });

  it("regeneracja nie spada poniżej 1, a już słaby check-in zostaje słaby", () => {
    const bad: CheckIn = { recovery: 1, feeling: 1, less: false };
    expect(withExtraLoad(bad, [ex(T, "run", 120, "hard")], [], T).checkIn.recovery).toBe(1);
  });

  it("sesje z aplikacji wykonane wczoraj dokładają się do obciążenia własnego", () => {
    const h: HistoryEvent[] = [{ date: "2026-11-21", type: "session", key: "strength", value: 1 }];
    const e = [ex("2026-11-21", "football", 60, "hard")]; // 480 + 330 = 810 × 0,6 = 486
    expect(loadSummary(e, h, T).acute).toBe(486);
    expect(loadSummary(e, h, T).level).toBe("moderate");
    expect(loadSummary(e, [], T).level).toBe("low");
    // regeneracja zamiast sesji (viaRest) nie liczy się jako obciążenie
    expect(loadSummary([], [{ ...h[0]!, viaRest: true }], T).acute).toBe(0);
  });

  it("jednostka sprzed 3 dni nie wpływa na dziś", () => {
    expect(loadSummary([ex("2026-11-19", "run", 120, "hard")], [], T).acute).toBe(0);
  });

  it("plan staje się lżejszy: mniej serii w sesji siłowej po dużym obciążeniu", () => {
    const r = withExtraLoad(ok, [ex("2026-11-21", "football", 120, "hard")], [], T);
    const t = { name: "Siła", blocks: [{ title: "A", items: [{ exerciseId: "squat", sets: 4, reps: "5" }] }] } as unknown as Parameters<typeof adaptSession>[0];
    const before = adaptSession(t, ok).blocks[0]!.items[0]!.sets;
    const after = adaptSession(t, r.checkIn).blocks[0]!.items[0]!.sets;
    expect(after).toBeLessThan(before);
  });

  it("progi są uporządkowane", () => { expect(ACUTE_MODERATE).toBeLessThan(ACUTE_HIGH); });
});

describe("własna jednostka: zapis i tydzień", () => {
  it("normalizacja pomija błędne wpisy i ogranicza czas", () => {
    const r = normalizeExtras([
      { id: "a", date: T, kind: "run", minutes: 500, effort: "hard" },
      { id: "b", date: "złe", kind: "run", minutes: 30, effort: "easy" },
      { id: "c", date: T, kind: "nieznany", minutes: 30, effort: "easy" },
      { id: "a", date: T, kind: "bike", minutes: 30, effort: "easy" },
      null, 5,
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.minutes).toBe(240);
    expect(normalizeExtras("x")).toEqual([]);
  });

  it("suma tygodnia liczy tylko wpisy od poniedziałku do niedzieli", () => {
    const e = [ex("2026-11-16", "run", 30, "medium"), ex("2026-11-22", "bike", 60, "easy"), ex("2026-11-23", "run", 30, "medium")];
    expect(weekExtraLoad(e, "2026-11-16")).toEqual({ count: 2, minutes: 90, load: 150 + 144 });
  });
});
