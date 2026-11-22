import { beforeEach, describe, expect, it } from "vitest";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;

import { FOCUS_LABEL, ambitionCardHidden, cycleAt, cycleRegularity, dismissAmbitionCard, loadAmbition, milestones, nextMilestone, parseAmbition, previousCycle, saveAmbition, summarizeCycle } from "./ambition";
import { adherence, type Metric } from "./progress2";
import type { HistoryEvent } from "./history";
import { setScope } from "../lib/store";

beforeEach(() => { mem.clear(); setScope({ kind: "guest" }); });

const ses = (date: string, key = "strength", extra: Partial<HistoryEvent> = {}): HistoryEvent => ({ date, type: "session", key, value: 1, ...extra });
const lab = (date: string, key: string, value: number): HistoryEvent => ({ date, type: "lab", key, value });

describe("ambicja zawodnika", () => {
  it("odrzuca nieznane ligi i cele, ogranicza do dwóch celów, pusty zapis to null", () => {
    expect(parseAmbition(null)).toBeNull();
    expect(parseAmbition({ league: "Liga Mistrzów", focus: ["ufo"] })).toBeNull();
    expect(parseAmbition({ league: "IV liga", focus: ["jump", "sprint", "strength", "jump"], setAt: "2026-11-21" })).toEqual({ league: "IV liga", focus: ["jump", "sprint"], setAt: "2026-11-21" });
    expect(parseAmbition({ focus: ["regularity"] })).toEqual({ focus: ["regularity"], setAt: "" });
    expect(parseAmbition({ vision: "leader", dream: "pro", setAt: "x" })).toEqual({ focus: [], vision: "leader", dream: "pro", setAt: "x" });
    expect(parseAmbition({ vision: "ufo", dream: "xyz" })).toBeNull();
  });
  it("zapis i odczyt lokalny; „nie teraz” chowa kartę na 14 dni", () => {
    expect(loadAmbition()).toBeNull();
    saveAmbition({ league: "A-klasa", focus: ["sprint"], setAt: "2026-11-21" });
    expect(loadAmbition()).toMatchObject({ league: "A-klasa", focus: ["sprint"] });
    dismissAmbitionCard("2026-11-21");
    expect(ambitionCardHidden("2026-12-01")).toBe(true);
    expect(ambitionCardHidden("2026-12-06")).toBe(false);
  });
  it("etykiety celów są po polsku", () => { expect(FOCUS_LABEL.jump).toBe("Skok"); });
});

describe("cykl 5 tygodni", () => {
  it("granice cyklu liczone od poniedziałku tygodnia startu", () => {
    // start w środę 2026-09-02 → poniedziałek 2026-08-31
    const c0 = cycleAt("2026-09-02", "2026-09-10");
    expect(c0).toMatchObject({ index: 0, start: "2026-08-31", end: "2026-10-04", weekNo: 2 });
    const c1 = cycleAt("2026-09-02", "2026-10-05");
    expect(c1).toMatchObject({ index: 1, start: "2026-10-05", weekNo: 1 });
    expect(cycleAt("2026-09-02", "2026-10-04")).toMatchObject({ index: 0, weekNo: 5, daysLeft: 0 });
    expect(previousCycle(c1)).toMatchObject({ index: 0, start: "2026-08-31", end: "2026-10-04" });
    expect(previousCycle(c0)).toBeNull();
  });
});

describe("regularność w cyklu", () => {
  const planned = [
    { date: "2026-11-02", kind: "strength" }, { date: "2026-11-04", kind: "sprint" }, { date: "2026-11-06", kind: "run" }, { date: "2026-11-21", kind: "strength" },
  ];
  it("liczy wykonane z zaplanowanych do dziś, regenerację z check-inu jako zrobioną; dzisiejsza niewykonana nie jest pominięta", () => {
    const ev = [ses("2026-11-02", "strength", { viaRest: true }), ses("2026-11-04", "sprint")];
    const r = cycleRegularity(planned, ev, { start: "2026-11-02", end: "2026-12-06" }, "2026-11-21");
    expect(r).toEqual({ planned: 3, done: 2, viaRest: 1, pct: 67 });
  });
  it("bez zaplanowanych sesji: pct = null", () => {
    expect(cycleRegularity([], [], { start: "2026-11-02", end: "2026-12-06" }, "2026-11-21").pct).toBeNull();
  });
});

describe("kamienie milowe", () => {
  it("bez danych nic nie jest zdobyte, najbliższy to pierwsza sesja", () => {
    const m = milestones([], [], "2026-11-21");
    expect(m.every((x) => !x.done)).toBe(true);
    expect(nextMilestone(m)?.id).toBe("first-session");
  });
  it("seria 4 tygodni z 80%+, Lab i liczba sesji z datami zdobycia", () => {
    const weeks = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"].map((week) => ({ week, planned: 3, done: 3 }));
    const ev = [ses("2026-10-05"), lab("2026-10-07", "cmj", 30), lab("2026-10-07", "broad-jump", 220), lab("2026-10-07", "sprint-10", 2.1), lab("2026-11-10", "cmj", 32)];
    const m = Object.fromEntries(milestones(ev, weeks, "2026-11-21").map((x) => [x.id, x]));
    expect(m["first-session"]).toMatchObject({ done: true, achievedOn: "2026-10-05" });
    expect(m["week-80"]).toMatchObject({ done: true, achievedOn: "2026-10-11" });
    expect(m["streak-4"]).toMatchObject({ done: true, value: 4, achievedOn: "2026-11-01" });
    expect(m["lab-all"]).toMatchObject({ done: true, value: 3, achievedOn: "2026-10-07" });
    expect(m["lab-repeat"]).toMatchObject({ done: true, achievedOn: "2026-11-10" });
    expect(m["sessions-20"]).toMatchObject({ done: false, value: 1, target: 20 });
  });
  it("seria przerwana słabym tygodniem nie liczy się do 4", () => {
    const weeks = [["2026-10-05", 3], ["2026-10-12", 3], ["2026-10-19", 0], ["2026-10-26", 3]].map(([week, done]) => ({ week: week as string, planned: 3, done: done as number }));
    const m = milestones([ses("2026-10-05")], weeks, "2026-11-21").find((x) => x.id === "streak-4")!;
    expect(m.done).toBe(false);
    expect(m.value).toBe(2);
  });
});

describe("podsumowanie cyklu", () => {
  const cycle = { index: 0, start: "2026-10-05", end: "2026-11-08", weekNo: 5, daysLeft: 0 };
  const metrics: Metric[] = [
    { type: "lab", key: "cmj", title: "CMJ", unit: " cm", better: "higher", group: "speed" },
    { type: "lab", key: "sprint-10", title: "Sprint 10 m", unit: " s", better: "lower", group: "speed", dec: 2 },
  ];
  it("zmiany Laba względem wcześniejszego wyniku, rekordy w cyklu i kamienie zdobyte w cyklu", () => {
    const planned = [{ date: "2026-10-06", kind: "strength" }, { date: "2026-10-08", kind: "sprint" }];
    const ev = [ses("2026-10-06"), lab("2026-09-20", "cmj", 30), lab("2026-10-20", "cmj", 33), lab("2026-09-20", "sprint-10", 2.1), lab("2026-10-20", "sprint-10", 2.15)];
    const weeks = adherence(planned, ev, "2026-11-21").weeks;
    const s = summarizeCycle(cycle, planned, ev, metrics, weeks, "2026-11-21");
    expect(s.regularity).toMatchObject({ planned: 2, done: 1 });
    const cmj = s.lab.find((l) => l.metric.key === "cmj")!;
    expect(cmj).toMatchObject({ from: 30, to: 33, improved: true });
    expect(s.lab.find((l) => l.metric.key === "sprint-10")).toMatchObject({ improved: false }); // wolniej = gorzej
    expect(s.records.map((r) => r.metric.key)).toEqual(["cmj"]);
    expect(s.milestones.map((m) => m.id)).toContain("first-session");
  });
  it("brak wyników w cyklu: puste listy", () => {
    const s = summarizeCycle(cycle, [], [], metrics, [], "2026-11-21");
    expect(s.lab).toEqual([]);
    expect(s.records).toEqual([]);
  });
});
