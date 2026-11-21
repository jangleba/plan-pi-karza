import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "./history";
import { KIND_PL, adherence, byKind, inRange, insights, nutritionSummary, recentAdherence, records, streak, weeklyByKind, type Metric, type NutritionDay } from "./progress2";

const TODAY = "2026-11-19"; // czwartek; bieżący tydzień od 2026-11-16
const ev = (date: string, type: HistoryEvent["type"], key: string, value: number): HistoryEvent => ({ date, type, key, value });
const done = (date: string, kind: string) => ev(date, "session", kind, 1);

describe("zakres dat", () => {
  const pts = [{ date: "2026-08-01", value: 1 }, { date: "2026-09-30", value: 2 }, { date: "2026-11-15", value: 3 }];
  it("4 tygodnie / 12 tygodni / wszystko", () => {
    expect(inRange(pts, "4w", TODAY).map((p) => p.value)).toEqual([3]);
    expect(inRange(pts, "12w", TODAY).map((p) => p.value)).toEqual([2, 3]);
    expect(inRange(pts, "all", TODAY)).toHaveLength(3);
  });
});

describe("realizacja planu", () => {
  // tydzień 2026-11-02: 4 zaplanowane, 3 zrobione; tydzień 11-09: 3 zaplanowane, 3 zrobione
  const planned = [
    { date: "2026-11-02", kind: "strength" }, { date: "2026-11-03", kind: "sprint" }, { date: "2026-11-04", kind: "strength" }, { date: "2026-11-05", kind: "run" },
    { date: "2026-11-09", kind: "strength" }, { date: "2026-11-10", kind: "sprint" }, { date: "2026-11-12", kind: "run" },
    { date: "2026-11-16", kind: "strength" }, { date: "2026-11-19", kind: "run" }, { date: "2026-11-21", kind: "sprint" },
  ];
  const events = [done("2026-11-02", "strength"), done("2026-11-03", "sprint"), done("2026-11-05", "run"), done("2026-11-09", "strength"), done("2026-11-10", "sprint"), done("2026-11-12", "run"), done("2026-11-16", "strength")];
  const a = adherence(planned, events, TODAY);

  it("stany komórek: wykonane, pominięte, jeszcze przed nami", () => {
    expect(a.cells.get("2026-11-02")!.state).toBe("done");
    expect(a.cells.get("2026-11-04")!.state).toBe("missed");
    expect(a.cells.get("2026-11-19")!.state).toBe("planned"); // dziś, jeszcze nie zrobione – nie jest pominięte
    expect(a.cells.get("2026-11-21")!.state).toBe("planned");
  });

  it("tygodnie: plan i wykonanie; przyszłość nie liczy się do oceny", () => {
    expect(a.weeks).toEqual([
      { week: "2026-11-02", planned: 4, done: 3 },
      { week: "2026-11-09", planned: 3, done: 3 },
      { week: "2026-11-16", planned: 2, done: 1 }, // 16.11 zrobione, 19.11 (dziś) jeszcze nie – liczy się, 21.11 nie
    ]);
  });

  it("seria: tydzień ≥ 80% wydłuża, niższy przerywa; bieżący tydzień pominięty", () => {
    expect(streak(a.weeks, TODAY)).toBe(1); // 11-09: 100% (tak), 11-02: 75% (przerywa)
    expect(streak([{ week: "2026-11-02", planned: 4, done: 4 }, { week: "2026-11-09", planned: 0, done: 0 }, { week: "2026-10-26", planned: 3, done: 3 }], TODAY)).toBe(2);
  });

  it("realizacja z ostatnich pełnych tygodni i podział na rodzaje", () => {
    expect(recentAdherence(a.weeks, TODAY)).toEqual({ planned: 7, done: 6, pct: 86 });
    const k = byKind(a.cells, TODAY, 28);
    expect(k.find((x) => x.kind === "strength")).toEqual({ kind: "strength", planned: 4, done: 3 });
    expect(recentAdherence([], TODAY)).toBeNull();
  });

  it("sesje w tygodniach danego rodzaju (z zerami, bez bieżącego tygodnia)", () => {
    expect(weeklyByKind(events, "strength", TODAY)).toEqual([{ date: "2026-11-02", value: 1 }, { date: "2026-11-09", value: 1 }]);
    expect(weeklyByKind([], "strength", TODAY)).toEqual([]);
  });
});

const M: Metric[] = [
  { type: "strength", key: "back-squat", title: "Back squat 1RM", unit: " kg", better: "higher", group: "strength" },
  { type: "lab", key: "sprint-10", title: "Sprint 10 m", unit: " s", better: "lower", group: "speed", dec: 2 },
  { type: "mas", key: "mas", title: "MAS", unit: " km/h", better: "higher", group: "run" },
];

describe("rekordy", () => {
  it("najlepsza wartość (więcej/mniej = lepiej), nowy rekord tylko po wcześniejszym pomiarze i niedawno", () => {
    const events = [
      ev("2026-09-01", "strength", "back-squat", 80), ev("2026-11-10", "strength", "back-squat", 90),
      ev("2026-09-01", "lab", "sprint-10", 1.9), ev("2026-10-01", "lab", "sprint-10", 1.85), ev("2026-11-12", "lab", "sprint-10", 1.88),
      ev("2026-11-17", "mas", "mas", 17),
    ];
    const r = records(events, M, TODAY);
    const by = Object.fromEntries(r.map((x) => [x.metric.key, x]));
    expect(by["back-squat"]).toMatchObject({ value: 90, date: "2026-11-10", isNew: true, first: false });
    expect(by["sprint-10"]).toMatchObject({ value: 1.85, date: "2026-10-01", isNew: false }); // najlepszy czas, ale dawno
    expect(by["mas"]).toMatchObject({ first: true, isNew: false }); // pierwszy pomiar to nie rekord
    expect(r[0]!.metric.key).toBe("back-squat"); // nowe na początku
  });
  it("brak danych → brak rekordów", () => expect(records([], M, TODAY)).toEqual([]));
});

describe("odżywianie", () => {
  const d = (date: string, logged: boolean, carb: number, protein: number, waterMl: number): NutritionDay => ({ date, logged, carb, protein, waterMl, target: { carb: 400, protein: 130, waterMl: 2800 } });
  it("liczy tylko dni z wpisami, próg 85%", () => {
    const s = nutritionSummary([d("a", true, 400, 100, 2800), d("b", true, 330, 130, 1000), d("c", false, 0, 0, 0), d("d", true, 341, 110, 2400)]);
    expect(s).toMatchObject({ total: 4, logged: 3, carbOk: 2, proteinOk: 1, waterOk: 2 });
    expect(s.avgCarbPct).toBe(Math.round(((400 + 330 + 341) / 3 / 400) * 100));
  });
  it("bez wpisów → null zamiast zera", () => expect(nutritionSummary([d("a", false, 0, 0, 0)]).avgCarbPct).toBeNull());
});

describe("wnioski", () => {
  const a = { pct: 86, planned: 7, done: 6 };
  it("nowy rekord, największa zmiana, realizacja z najczęściej pomijanym rodzajem – maks. 3 zdania, same fakty", () => {
    const events = [
      ev("2026-10-05", "strength", "back-squat", 80), ev("2026-11-10", "strength", "back-squat", 90),
      ev("2026-10-05", "lab", "sprint-10", 1.95), ev("2026-11-12", "lab", "sprint-10", 1.85),
    ];
    const out = insights({ events, metrics: M, today: TODAY, adherence: a, kinds: [{ kind: "sprint", planned: 4, done: 1 }], nutrition: null });
    expect(out).toHaveLength(3);
    expect(out[0]).toBe("Nowy rekord: Sprint 10 m 1,85 s (12.11)."); // najświeższy z nowych rekordów
    expect(out[1]).toBe("Back squat 1RM: +12,5% w 5 tyg."); // największa zmiana inna niż rekord z pierwszego zdania
    expect(out[2]).toBe("Zrealizowane 6 z 7 zaplanowanych sesji (86%) w ostatnich 4 tygodniach; najczęściej pomijane: sprint (3 z 4).");
  });
  it("bez danych nic nie zgaduje", () => {
    expect(insights({ events: [], metrics: M, today: TODAY, adherence: null, kinds: [], nutrition: null })).toEqual([]);
  });
  it("etykiety rodzajów sesji po polsku", () => expect(KIND_PL["strength"]).toBe("Siła"));
});

describe("regeneracja zamiast sesji (check-in)", () => {
  const planned = [{ date: "2026-11-16", kind: "strength" }, { date: "2026-11-17", kind: "sprint" }, { date: "2026-11-18", kind: "run" }];
  it("liczy się jako zrobiona i jest oznaczona; brak zdarzenia = pominięta", () => {
    const ev = [
      { date: "2026-11-16", type: "session" as const, key: "strength", value: 1, viaRest: true },
      { date: "2026-11-17", type: "session" as const, key: "sprint", value: 1 },
    ];
    const a = adherence(planned, ev, "2026-11-20");
    expect(a.cells.get("2026-11-16")).toMatchObject({ state: "done", viaRest: true });
    expect(a.cells.get("2026-11-17")).toMatchObject({ state: "done" });
    expect(a.cells.get("2026-11-17")!.viaRest).toBeUndefined();
    expect(a.cells.get("2026-11-18")!.state).toBe("missed");
    expect(a.weeks[0]).toMatchObject({ planned: 3, done: 2 });
  });
});

