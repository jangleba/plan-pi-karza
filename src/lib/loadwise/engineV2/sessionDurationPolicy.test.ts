import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { resyncAdvancedGroups } from "./advancedSessions";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import {
  resolveSessionDurationMode,
  savedSessionDurationMode,
  serializedSessionMinutes,
  sessionTimeBudget,
} from "./sessionDurationPolicy";

const athlete: Profile = {
  name: "Full sessions",
  age: 21,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "machine",
    "band",
    "bench",
    "box",
    "platform",
    "med_ball",
    "gym_throw_zone",
    "kettlebell",
    "gym_jump_lane",
    "trap_bar",
    "nordic_setup",
    "swiss_ball",
    "sliders",
    "fixed_pins",
    "overhead_band_station",
    "low_band_station",
  ],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 48,
  movementCompetence: "high",
  supervisionLevel: "full",
};
const options = {
  startDate: "2026-11-02",
  weeks: 4,
  weeklyTargets: { strength: 2 as const, speed: "auto" as const, endurance: 1 as const },
};
const recipes = (plan: SessionDay[]) =>
  plan
    .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
    .flatMap((session) => (session.engineV2 ? [session.engineV2] : []));

describe("deliberate session duration policy", () => {
  it("defaults to full recipes, with legacy explicit minute limits still honoured", () => {
    expect(resolveSessionDurationMode({})).toBe("full");
    expect(sessionTimeBudget({})).toBe(Infinity);
    expect(resolveSessionDurationMode({ minutesPerSession: 45 })).toBe("limited");
    expect(sessionTimeBudget({ minutesPerSession: 45 })).toBe(45);
    expect(sessionTimeBudget({ sessionDurationMode: "full", minutesPerSession: 45 })).toBe(
      Infinity,
    );
    expect(sessionTimeBudget({ sessionDurationMode: "limited" })).toBe(75);
  });

  it("keeps stored numeric metadata finite and old saved plans in their original mode", () => {
    expect(serializedSessionMinutes({})).toBe(75);
    expect(serializedSessionMinutes({ minutesPerSession: Infinity })).toBe(75);
    expect(serializedSessionMinutes({ minutesPerSession: NaN })).toBe(75);
    const old = [{ planInputs: { minutesPerSession: 45 } }] as SessionDay[];
    const before = structuredClone(old);
    expect(savedSessionDurationMode(old)).toBe("limited");
    expect(old).toEqual(before);
    expect(
      savedSessionDurationMode([
        { planInputs: { sessionDurationMode: "full", minutesPerSession: 75 } } as SessionDay,
      ]),
    ).toBe("full");
  });

  it("keeps complete gym recipes above the old 75-minute cap and serializes only finite metadata", () => {
    const result = generateTrainingPlan(athlete, options);
    const gym = recipes(result.plan).filter((r) =>
      r.roles.some((role) => role.startsWith("strength")),
    );
    expect(gym).toHaveLength(8);
    expect(gym.some((r) => r.minutes > 75)).toBe(true);
    expect(gym.every((r) => !r.strengthTimeOmissions?.length && r.variant !== "compact")).toBe(
      true,
    );
    expect(recipes(result.plan).every((r) => r.sessionDurationMode === "full")).toBe(true);
    expect(result.plan[0].planInputs?.sessionDurationMode).toBe("full");
    expect(result.sessionDurationMode).toBe("full");
    expect(validateTrainingPlan(result.plan, athlete, options)).toEqual([]);
    const restored = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(restored.minutesPerSession).toBe(75);
    expect(Number.isFinite(restored.plan[0].engineTimeBudgetMin)).toBe(true);
  });

  it("only fits gym doses after an explicit limit and accounts for full solo rest after round reductions", () => {
    const full = generateTrainingPlan(athlete, options);
    const limitedOptions = { ...options, minutesPerSession: 40 };
    const limited = generateTrainingPlan(athlete, limitedOptions);
    const gym = recipes(limited.plan).filter((r) =>
      r.roles.some((role) => role.startsWith("strength")),
    );
    expect(gym.length).toBeGreaterThan(0);
    expect(gym.every((r) => r.minutes <= 40 && r.sessionDurationMode === "limited")).toBe(true);
    expect(gym.some((r) => r.variant === "compact" || r.strengthTimeOmissions?.length)).toBe(true);
    for (const recipe of gym.filter((r) => r.organization === "complex"))
      expect(resyncAdvancedGroups(recipe).minutes).toBe(recipe.minutes);
    expect(recipes(full.plan).some((r) => r.minutes > 40)).toBe(true);
    expect(validateTrainingPlan(limited.plan, athlete, limitedOptions)).toEqual([]);
  });

  it("an explicit full choice overrides a stale numeric preference and keeps protected execution snapshots", () => {
    const fullOptions = { ...options, sessionDurationMode: "full" as const, minutesPerSession: 40 };
    const full = generateTrainingPlan(athlete, fullOptions);
    expect(recipes(full.plan).some((r) => r.minutes > 75)).toBe(true);
    expect(recipes(full.plan).every((r) => r.sessionDurationMode === "full")).toBe(true);
    const locked = structuredClone(full.plan.find((day) => day.engineV2)!);
    locked.executionProtected = true;
    const before = structuredClone(locked);
    const next = generateTrainingPlan(athlete, {
      ...options,
      minutesPerSession: 40,
      lockedDays: [locked],
    });
    const kept = next.plan.find((day) => day.date === locked.date)!;
    expect(kept.engineV2).toEqual(before.engineV2);
    expect(kept.structuredSections).toEqual(before.structuredSections);
    expect(locked).toEqual(before);
  });
});
