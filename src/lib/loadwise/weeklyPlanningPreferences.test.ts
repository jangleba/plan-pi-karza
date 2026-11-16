import { expect, it } from "vitest";
import { buildProfile } from "./store/model";
import type { PlanInputsSnapshot } from "./types";
import { savedWeeklyPlanningPreferences } from "./weeklyPlanningPreferences";

const profile = buildProfile({ full_name: "Test" }, { age: 21, main_goal: "endurance" }, null)!;
const snapshot = (value: unknown) => value as PlanInputsSnapshot;

it("keeps old saved plans automatic and restores explicit preferences without aliasing", () => {
  expect(savedWeeklyPlanningPreferences(undefined, profile)).toBeNull();
  expect(savedWeeklyPlanningPreferences(snapshot({}), profile)).toBeNull();
  const saved = snapshot({
    weeklyTargets: { strength: 2, speed: 2, endurance: 1 },
    fillRestDays: true,
    minFullRestDays: 1,
  });
  const preferences = savedWeeklyPlanningPreferences(saved, profile)!;
  expect(preferences).toEqual({
    weeklyTargets: { strength: 2, speed: 2, endurance: 1 },
    fillRestDays: true,
    minFullRestDays: 1,
  });
  preferences.weeklyTargets.speed = 1;
  expect(saved.weeklyTargets!.speed).toBe(2);
});

it.each([
  { weeklyTargets: null },
  { weeklyTargets: { strength: 2, speed: 2, endurance: 1 }, minFullRestDays: null },
  { weeklyTargets: { strength: 2, speed: 3, endurance: 1 } },
  { fillRestDays: "yes" },
  { minFullRestDays: 3 },
])(
  "rejects malformed persisted preferences rather than silently changing the request: %j",
  (saved) => {
    expect(savedWeeklyPlanningPreferences(snapshot(saved), profile)).toBeNull();
  },
);

it("can restore a support-only choice while deriving the session count from the profile", () => {
  expect(savedWeeklyPlanningPreferences(snapshot({ fillRestDays: true }), profile)).toEqual({
    weeklyTargets: { strength: 2, speed: 1, endurance: 2 },
    fillRestDays: true,
    minFullRestDays: 1,
  });
});
