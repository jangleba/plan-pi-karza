import { expect, it } from "vitest";
import { executionKey, measuredSessionMinutes } from "./sessionExecution";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { resolveExecutionDay } from "./effectivePlan";
import type { Profile, SessionCompletion } from "./types";
const now = Date.parse("2026-11-07T10:30:00Z");
it("uses measured time without falling back to planned duration", () => {
  expect(measuredSessionMinutes(undefined, now)).toBeNull();
  expect(
    measuredSessionMinutes(
      { completed: false, rpe: null, notes: "", startedAt: "2026-11-07T10:00:00Z" },
      now,
    ),
  ).toBe(30);
  expect(
    measuredSessionMinutes(
      { completed: false, rpe: null, notes: "", startedAt: "2026-11-02T10:00:00Z" },
      now,
    ),
  ).toBeNull();
});
it("separates completion keys by movement and real prescription", () => {
  const e = { id: "same", exerciseId: "goblet_squat", name: "Przysiad", sets: "3", reps: "8" };
  expect(executionKey(e)).not.toBe(executionKey({ ...e, reps: "5" }));
  expect(executionKey(e)).not.toBe(executionKey({ ...e, id: "different-instance" }));
  expect(executionKey(e)).toBe(executionKey({ ...e }));
});
const completion: SessionCompletion = {
  completed: true,
  status: "completed",
  rpe: 9,
  notes: "[Monitoring] pain=0;legFatigue=9",
  executionSnapshot: sessionFixture({ date: "2026-11-06" }),
  endedAt: "2026-11-06T20:00:00Z",
};
it("does not derive a hidden hold from an old post-session note and preserves the prescription", () => {
  const p = { healthPersonalizationEnabled: true } as Profile;
  const day = sessionFixture({ date: "2026-11-07", dbId: "today" });
  const result = resolveExecutionDay(day, {
    profile: p,
    completions: {
      x: { ...completion, notes: "[Monitoring] pain=8;legFatigue=0" },
      today: { ...completion, status: "started", completed: false, executionSnapshot: day },
    },
  });
  expect(result.loadLabelOverride).not.toBe("Wstrzymaj trening");
  expect(result.title).toBe(day.title);
  expect(result.sections).toEqual(day.sections);
});
