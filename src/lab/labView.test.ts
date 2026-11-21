import { describe, expect, it } from "vitest";
import { deltaText, fmtValue, labCycle, statusText, summarizeTest } from "./labView";
import { LAB_TESTS } from "../engine";
import type { HistoryEvent } from "../engine";

const T = (k: string) => LAB_TESTS.find((t) => t.key === k)!;
const ev = (key: string, date: string, value: number, method?: HistoryEvent["method"]): HistoryEvent => ({ date, type: "lab", key, value, ...(method ? { method } : {}) });
const TODAY = "2026-11-21";

describe("podsumowanie testu Lab", () => {
  it("bez wyników: do zrobienia, bez wartości", () => {
    const s = summarizeTest([], T("cmj"), TODAY);
    expect(s.last).toBeUndefined();
    expect(s.due).toBe(true);
    expect(statusText(s)).toBe("Do zrobienia");
  });
  it("skok (im więcej, tym lepiej): wzrost to poprawa, spadek to gorzej, najlepszy to maksimum", () => {
    const up = summarizeTest([ev("cmj", "2026-10-01", 30), ev("cmj", "2026-11-10", 33.2)], T("cmj"), TODAY);
    expect(up.improved).toBe(true);
    expect(up.delta).toBeCloseTo(3.2, 9);
    expect(deltaText("cmj", up)).toBe("+3,2 cm");
    const down = summarizeTest([ev("cmj", "2026-10-01", 34), ev("cmj", "2026-11-10", 31)], T("cmj"), TODAY);
    expect(down.improved).toBe(false);
    expect(down.best).toBe(34);
  });
  it("sprint (im mniej, tym lepiej): krótszy czas to poprawa; główny wynik to 10 m", () => {
    const s = summarizeTest([ev("sprint-10", "2026-10-01", 2.1), ev("sprint-20", "2026-10-01", 3.5), ev("sprint-10", "2026-11-10", 2.06)], T("sprint"), TODAY);
    expect(s.improved).toBe(true);
    expect(s.best).toBe(2.06);
    expect(deltaText("sprint", s)).toBe("−0,04 s");
    expect(s.points).toHaveLength(2);
  });
  it("jeden wynik: brak porównania; bez zmiany: pusty znacznik", () => {
    const one = summarizeTest([ev("broad-jump", "2026-11-10", 240)], T("broad-jump"), TODAY);
    expect(one.improved).toBeNull();
    expect(deltaText("broad-jump", one)).toBe("");
    const same = summarizeTest([ev("broad-jump", "2026-10-10", 240), ev("broad-jump", "2026-11-10", 240)], T("broad-jump"), TODAY);
    expect(same.improved).toBeNull();
    expect(deltaText("broad-jump", same)).toBe("bez zmiany");
  });
  it("oszacowanie z nagrania jest oznaczone jako przybliżone", () => {
    expect(summarizeTest([ev("cmj", "2026-11-10", 30, "video_estimate")], T("cmj"), TODAY).last!.approx).toBe(true);
    expect(summarizeTest([ev("cmj", "2026-11-10", 30, "manual_entry")], T("cmj"), TODAY).last!.approx).toBe(false);
  });
  it("termin powtórki: po 35 dniach czas na powtórkę, wcześniej odliczanie", () => {
    const fresh = summarizeTest([ev("cmj", "2026-11-11", 30)], T("cmj"), TODAY); // 10 dni temu
    expect(fresh.due).toBe(false);
    expect(fresh.dueInDays).toBe(25);
    expect(statusText(fresh)).toBe("Za 25 dni");
    const old = summarizeTest([ev("cmj", "2026-10-01", 30)], T("cmj"), TODAY);
    expect(old.due).toBe(true);
    expect(statusText(old)).toBe("Czas na powtórkę");
    expect(statusText(summarizeTest([ev("cmj", "2026-10-18", 30)], T("cmj"), TODAY))).toBe("Za 1 dzień");
  });
  it("sprint liczy termin od dowolnego splitu, nie tylko 10 m", () => {
    const s = summarizeTest([ev("sprint-10", "2026-09-01", 2.1), ev("sprint-30", "2026-11-15", 4.6)], T("sprint"), TODAY);
    expect(s.due).toBe(false);
  });
});

describe("cykl Lab i formatowanie", () => {
  it("cykl: ile testów aktualnych, które zaległe, co najbliżej", () => {
    const s = LAB_TESTS.map((t) => summarizeTest(t.key === "cmj" ? [ev("cmj", "2026-11-11", 30)] : [], t, TODAY));
    const c = labCycle(s);
    expect(c.total).toBe(3);
    expect(c.current).toBe(1);
    expect(c.due).toEqual(["broad-jump", "sprint"]);
    expect(c.next).toEqual({ key: "cmj", inDays: 25 });
    expect(labCycle(s.filter((x) => x.key === "cmj")).due).toEqual([]);
  });
  it("formatowanie: przecinek, sprint z 2 miejscami, bez zbędnego „,0”", () => {
    expect(fmtValue("sprint", 2.1)).toBe("2,10");
    expect(fmtValue("sprint-10", 2.064)).toBe("2,06");
    expect(fmtValue("cmj", 33)).toBe("33");
    expect(fmtValue("cmj", 33.25)).toBe("33,3");
    expect(fmtValue("broad-jump", 238)).toBe("238");
  });
});
