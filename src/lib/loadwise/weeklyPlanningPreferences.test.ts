import { expect, it } from "vitest";
import { buildProfile } from "./store/model";
import type { PlanInputsSnapshot } from "./types";
import {
  automaticWeeklyTargets,
  defaultWeeklyTargets,
  isAutomaticSprintTarget,
  savedWeeklyPlanningPreferences,
  shouldTryExtraSprint,
} from "./weeklyPlanningPreferences";

const profile = buildProfile({ full_name: "Test" }, { age: 21, main_goal: "endurance" }, null)!;
const snapshot = (value: unknown) => value as PlanInputsSnapshot;

it("moves old sprint quotas to automatic while retaining the other saved choices without aliasing", () => {
  expect(savedWeeklyPlanningPreferences(undefined, profile)).toBeNull();
  expect(savedWeeklyPlanningPreferences(snapshot({}), profile)).toBeNull();
  const saved = snapshot({
    weeklyTargets: { strength: 2, speed: 2, endurance: 1 },
    fillRestDays: true,
    minFullRestDays: 1,
  });
  const preferences = savedWeeklyPlanningPreferences(saved, profile)!;
  expect(preferences).toEqual({
    weeklyTargets: { strength: 2, speed: "auto", endurance: 1 },
    fillRestDays: true,
    minFullRestDays: 1,
  });
  preferences.weeklyTargets.endurance = 2;
  expect(saved.weeklyTargets!.speed).toBe(2);
  expect(saved.weeklyTargets!.endurance).toBe(1);
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
    weeklyTargets: { strength: 2, speed: "auto", endurance: 2 },
    fillRestDays: true,
    minFullRestDays: 1,
  });
});

it("uses automatic sprint frequency for fresh and resumed active preferences", () => {
  expect(defaultWeeklyTargets(profile)).toEqual({ strength: 2, speed: "auto", endurance: 2 });
  for (const speed of ["auto", 1, 2] as const) {
    const saved = snapshot({ weeklyTargets: { strength: 2, speed, endurance: 1 } });
    expect(savedWeeklyPlanningPreferences(saved, profile)?.weeklyTargets.speed).toBe("auto");
    expect(saved.weeklyTargets?.speed).toBe(speed);
  }
  const targets = { strength: 2, speed: 2, endurance: 1 } as const;
  expect(automaticWeeklyTargets(targets)).toEqual({ ...targets, speed: "auto" });
  expect(targets.speed).toBe(2);
});

it("tries a second exposure only for a useful speed intention, with legacy numeric API compatibility", () => {
  expect(isAutomaticSprintTarget(undefined)).toBe(true);
  expect(isAutomaticSprintTarget("auto")).toBe(true);
  expect(isAutomaticSprintTarget(1)).toBe(false);
  expect(shouldTryExtraSprint(profile, "auto")).toBe(false);
  expect(shouldTryExtraSprint({ ...profile, goal: "speed" }, "auto")).toBe(true);
  expect(shouldTryExtraSprint({ ...profile, goal: "agility" }, undefined)).toBe(true);
  expect(shouldTryExtraSprint({ ...profile, secondaryLimiter: "speed" }, "auto")).toBe(true);
  expect(
    shouldTryExtraSprint({ ...profile, goal: "speed", secondaryLimiter: "fatigue" }, "auto"),
  ).toBe(false);
  expect(shouldTryExtraSprint({ ...profile, goal: "speed" }, 1)).toBe(false);
  expect(shouldTryExtraSprint(profile, 2)).toBe(true);
});
