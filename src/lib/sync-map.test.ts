import { describe, expect, it } from "vitest";
import { checkInToRow, parseProfile, rowToCheckIn, rowsToWeightLog, weightLogToRows } from "./sync-map";

describe("mapowanie danych do bazy", () => {
  it("dziennik kg: tam i z powrotem", () => {
    const log = {
      "back-squat": { kg: 100, reps: 3, date: "2026-11-18", next: 102.5 },
      "bench-press": { kg: 80, reps: 4, date: "2026-11-18" },
    };
    const rows = weightLogToRows(log);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.exercise_id === "bench-press")!.next_kg).toBeNull();
    expect(rowsToWeightLog(rows)).toEqual(log);
  });
  it("kg z bazy jako tekst (numeric) trafia jako liczba", () => {
    const log = rowsToWeightLog([{ exercise_id: "a", kg: "82.5" as unknown as number, reps: 5, logged_on: "2026-11-18", next_kg: "85" as unknown as number }]);
    expect(log.a).toEqual({ kg: 82.5, reps: 5, date: "2026-11-18", next: 85 });
  });
  it("check-in tam i z powrotem", () => {
    const c = { recovery: 2, feeling: 1, less: true } as const;
    expect(rowToCheckIn(checkInToRow("2026-11-18", c))).toEqual(c);
  });
  it("check-in w chmurze: kolumna recovery, śmieci z bazy są bezpieczne", () => {
    expect(checkInToRow("2026-11-18", { recovery: 1, feeling: 2, less: false })).toEqual({ day: "2026-11-18", recovery: 1, feeling: 2, less: false });
    expect(rowToCheckIn({ recovery: 9, feeling: 2, less: false })).toEqual({ recovery: 3, feeling: 2, less: false });
  });
  it("odrzuca uszkodzony profil z bazy", () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile({ age: 20 })).toBeNull();
    expect(parseProfile({ age: 20, weightKg: 70, matchWeekdays: [5] })).not.toBeNull();
  });
});
