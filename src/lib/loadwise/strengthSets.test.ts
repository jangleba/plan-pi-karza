import { describe, expect, it } from "vitest";
import { rowsToStrengthSets, type StrengthSetRow } from "./strengthSets";
import { strengthChanges } from "./cycleReview";
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

it("compares only identical tempo prescriptions from immutable execution snapshots", () => {
  const snapshot = (date: string, tempo: string) => ({
    date,
    engineV2: { phase: "development" },
    structuredSections: [
      {
        type: "main",
        blocks: [
          {
            exercises: [
              { id: "rdl", exerciseId: "rdl", name: "RDL", sets: "3", reps: "6", rir: "2", tempo },
            ],
          },
        ],
      },
    ],
  });
  const summary = (tempo: string) => {
    const c = {
      s1: {
        completed: true,
        status: "completed",
        rpe: 7,
        notes: "",
        executionSnapshot: snapshot("2026-11-02", "4-0-2"),
      },
      s2: {
        completed: true,
        status: "completed",
        rpe: 7,
        notes: "",
        executionSnapshot: snapshot("2026-11-09", tempo),
      },
    } as unknown as Record<string, SessionCompletion>;
    return strengthChanges(
      rowsToStrengthSets(
        [
          row({ exercise_key: "rdl", weight_kg: 40 }),
          row({ session_id: "s2", exercise_key: "rdl", weight_kg: 50 }),
        ],
        c,
      ),
      "2026-11-01",
      "2026-11-14",
    );
  };
  expect(summary("1-0-1").improved).toBe(0);
  expect(summary("4-0-2").improved).toBe(1);
  expect(
    strengthChanges(
      [
        { exerciseKey: "unknown", date: "2026-11-02", weightKg: 40, reps: 6 },
        { exerciseKey: "unknown", date: "2026-11-09", weightKg: 50, reps: 6 },
      ],
      "2026-11-01",
      "2026-11-14",
    ).improved,
  ).toBe(0);
});
