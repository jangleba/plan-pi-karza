import { expect, it } from "vitest";
import { groupSessionResults, resultSetLabel, type SessionResultRow } from "./sessionResults";
const row = (overrides: Partial<SessionResultRow> = {}): SessionResultRow => ({
  exercise_key: "goblet_squat",
  exercise_name: "Przysiad goblet",
  set_number: 1,
  weight_kg: 20,
  reps: 8,
  rir: 3,
  metric_kind: null,
  metric_value: null,
  performed_at: "2026-11-07T12:00:00Z",
  ...overrides,
});
it("does not confuse completion markers with measured sets and keeps the latest edit", () => {
  const r = groupSessionResults([
    row(),
    row({ weight_kg: 22.5, performed_at: "2026-11-07T13:00:00Z" }),
    row({ exercise_key: "done:v1:squat", metric_kind: "completion", metric_value: 1 }),
  ]);
  expect(r.marked).toBe(1);
  expect(r.groups).toHaveLength(1);
  expect(r.groups[0].sets).toHaveLength(1);
  expect(r.groups[0].sets[0].weight_kg).toBe(22.5);
});
it("retains timing provenance and never turns a partial timer into a full interval", () => {
  expect(
    resultSetLabel(row({ weight_kg: null, metric_kind: "sprint_manual", metric_value: 2.1 })),
  ).toContain("Wpis ręczny");
  expect(
    resultSetLabel(row({ weight_kg: null, metric_kind: "sprint_video:abc", metric_value: 2.1 })),
  ).toContain("Film Lab");
  expect(
    resultSetLabel(row({ weight_kg: null, metric_kind: "run_clock_partial", metric_value: 20 })),
  ).toContain("część odcinka");
});

it("shows bodyweight repetitions without inventing seconds or kilograms", () => {
  expect(resultSetLabel(row({ weight_kg: null, reps: 12, rir: 2 }))).toBe("12 powtórzeń · zapas 2");
});
