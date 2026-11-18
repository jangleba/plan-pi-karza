import { describe, expect, it } from "vitest";
import { series, sessionsPerWeek, trend, type HistoryEvent } from "./history";

const ev = (date: string, type: HistoryEvent["type"], key: string, value: number): HistoryEvent => ({ date, type, key, value });

describe("historia i trend", () => {
  it("seria: ostatnia wartość dnia, rosnąco po dacie", () => {
    const e = [ev("2026-11-20", "strength", "back-squat", 110), ev("2026-11-18", "strength", "back-squat", 100), ev("2026-11-20", "strength", "back-squat", 112), ev("2026-11-18", "strength", "bench-press", 80)];
    expect(series(e, "strength", "back-squat")).toEqual([{ date: "2026-11-18", value: 100 }, { date: "2026-11-20", value: 112 }]);
  });
  it("trend: kolory wg zmiany", () => {
    expect(trend([100, 100, 100, 103])!.tone).toBe("green");
    expect(trend([100, 100, 100, 100.4])!.tone).toBe("neutral");
    expect(trend([100, 100, 100, 97])!.tone).toBe("orange");
    expect(trend([100, 100, 100, 90])!.tone).toBe("red");
  });
  it("trend dla metryk „im mniej, tym lepiej”: krótszy czas to zielony", () => {
    expect(trend([4.5, 4.5, 4.5, 4.3], "lower")!.tone).toBe("green");
    expect(trend([4.5, 4.5, 4.5, 4.8], "lower")!.tone).toBe("red");
  });
  it("za mało danych: brak trendu", () => {
    expect(trend([100])).toBeNull();
  });
  it("sesje na tydzień", () => {
    const e = [ev("2026-11-16", "session", "strength", 1), ev("2026-11-18", "session", "run", 1), ev("2026-11-24", "session", "sprint", 1)];
    expect(sessionsPerWeek(e)).toEqual([{ date: "2026-11-16", value: 2 }, { date: "2026-11-23", value: 1 }]);
  });
});
