import { describe, expect, it } from "vitest";
import { rowsToStrengthSets, type StrengthSetRow } from "./strengthSets";
import type { SessionCompletion } from "./types";

const row = (patch: Partial<StrengthSetRow> = {}): StrengthSetRow => ({
  session_id: "s1",
  exercise_key: "squat",
  weight_kg: 80,
  reps: 6,
  metric_kind: null,
  performed_at: "2026-10-27T10:00:00Z",
  ...patch,
});
const done = (patch: Partial<SessionCompletion> = {}): Record<string, SessionCompletion> => ({
  s1: { completed: true, status: "completed", rpe: 7, notes: "", ...patch },
});

describe("rowsToStrengthSets", () => {
  it("keeps weighted sets of completed sessions and parses numeric strings", () => {
    expect(rowsToStrengthSets([row({ weight_kg: "82.5" })], done())).toEqual([
      { exerciseKey: "squat", date: "2026-10-27", weightKg: 82.5, reps: 6 },
    ]);
  });
  it("drops sets of unfinished or unknown sessions, timers and sets without weight or reps", () => {
    expect(rowsToStrengthSets([row()], {})).toEqual([]);
    expect(rowsToStrengthSets([row()], done({ completed: false, status: "started" }))).toEqual([]);
    expect(rowsToStrengthSets([row({ metric_kind: "hold_seconds" })], done())).toEqual([]);
    expect(rowsToStrengthSets([row({ weight_kg: null })], done())).toEqual([]);
    expect(rowsToStrengthSets([row({ reps: null })], done())).toEqual([]);
    expect(rowsToStrengthSets([row({ session_id: null })], done())).toEqual([]);
  });
  it("leaves out sets from a lighter (deload) session so a reduced load is not a decline", () => {
    const snapshot = { date: "2026-10-27", engineV2: { phase: "deload" } } as never;
    expect(rowsToStrengthSets([row()], done({ executionSnapshot: snapshot }))).toEqual([]);
  });
  it("dates a set by its pinned session, not by when it was uploaded", () => {
    const snapshot = { date: "2026-10-26", engineV2: { phase: "development" } } as never;
    expect(
      rowsToStrengthSets(
        [row({ performed_at: "2026-10-29T08:00:00Z" })],
        done({ executionSnapshot: snapshot }),
      )[0].date,
    ).toBe("2026-10-26");
  });
});
