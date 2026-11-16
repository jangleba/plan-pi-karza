import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import { buildRunning } from "./exercises";
import { generateTrainingPlan, placeRecipeOnDate, validateTrainingPlan } from "./planner";
import { fitSprintToBudget } from "./sprintRecipe";
import { weeklyTargetCoverage } from "./weeklyTargets";
import type { EngineOptions, EngineSession } from "./model";

const profile: Profile = {
  name: "Pre-match sprint",
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
  equipment: ["barbell", "rack", "dumbbell", "trap_bar", "band", "bench", "ball"],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "inseason",
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
const options: EngineOptions = {
  startDate: "2026-11-16",
  weeks: 1,
  minutesPerSession: 75,
};
const matchProfile: Profile = {
  ...profile,
  clubTrainingDays: [3, 5],
  matchDate: "2026-11-22",
  matchDates: ["2026-11-22"],
};
const main = (recipe: EngineSession) => recipe.exercises.find((e) => e.dose.speedStage === "main")!;

function place(p: Profile, date: string, recipe: EngineSession, budget = 75) {
  const request = { ...options, minutesPerSession: budget };
  const empty = generateTrainingPlan({ ...p, painInjury: true }, request).plan;
  return placeRecipeOnDate(empty, date, recipe, p, request);
}

describe("sprint on the actual MD-2 date", () => {
  it.each([
    { level: "advanced" as const, age: 21, sets: 3 },
    { level: "beginner" as const, age: 15, sets: 2 },
  ])("reuses the reduced template for $level without changing phase or load gates", (athlete) => {
    const p = { ...profile, ...athlete, goal: "power", equipment: ["sled"] } as Profile;
    const reduced = buildRunning(p, "speed", "development", { preMatch: true })!;
    expect(reduced.phase).toBe("development");
    expect(reduced.highLower).toBe(true);
    expect(reduced.sprintGoal).toBe("acceleration");
    expect(main(reduced).dose).toMatchObject({
      sets: athlete.sets,
      distanceM: 10,
      runOutM: 10,
      restSeconds: 90,
    });
    expect(reduced.exercises.filter((e) => e.dose.circuit).map((e) => e.dose.sets)).toEqual([
      2, 2, 2,
    ]);
    expect(
      reduced.exercises.some((e) => ["resisted", "addition"].includes(e.dose.speedStage ?? "")),
    ).toBe(false);
    expect(reduced.plyometricContacts).toBeUndefined();
  });

  it("keeps the requested week coverage and rest while reducing Friday's sprint", () => {
    const request: EngineOptions = {
      ...options,
      weeklyTargets: { strength: 2, speed: 2, endurance: 1 },
      fillRestDays: true,
      minFullRestDays: 1,
    };
    const result = generateTrainingPlan(matchProfile, request);
    const coverage = weeklyTargetCoverage(result.plan, request.weeklyTargets!)[0];
    expect(coverage.planned).toEqual({ strength: 2, speed: 1, endurance: 1 });
    expect(coverage.fullRestDays).toBe(1);
    const friday = result.plan.find((d) => d.date === "2026-11-20")!;
    expect(friday.dayType).toBe("club");
    const sprint = friday.secondSession!.engineV2!;
    const full = buildRunning(profile, "speed", "development")!;
    expect(sprint.sprintVariant?.mainVariantId).toBe("accel_free");
    expect(sprint.phase).toBe(full.phase);
    expect(sprint.highLower).toBe(true);
    expect(sprint.minutes).toBeLessThan(full.minutes);
    expect(sprint.sprintMetres).toBeLessThan(full.sprintMetres);
    expect(main(sprint).dose).toMatchObject({ sets: 3, distanceM: 10 });
    expect(sprint.sprintVariant?.why.join(" ")).toContain("MD-2");
    expect(validateTrainingPlan(result.plan, matchProfile, request)).toEqual([]);
    expect(result.issues.some((i) => i.code === "UNMET_GOAL_TARGET" && i.target === "speed")).toBe(
      true,
    );
  });

  it.each(["max_velocity", "planned_cod"] as const)(
    "does not preserve a full %s dose or forbidden forced variant on MD-2",
    (sprintFocus) => {
      const p: Profile = {
        ...matchProfile,
        trainingMethodPreferences: { spaceLengthM: 60, sprintFocus },
      };
      const full = buildRunning(p, "speed", "development")!;
      expect(full.sprintGoal).toBe(sprintFocus);
      const out = place(p, "2026-11-20", full);
      if ("blocked" in out) throw new Error(out.blocked.message);
      expect(out.session.engineV2!.sprintGoal).toBe("acceleration");
      expect(out.session.engineV2!.sprintVariant?.mainVariantId).not.toBe(
        full.sprintVariant?.mainVariantId,
      );
      expect(main(out.session.engineV2!).dose).toMatchObject({ sets: 3, distanceM: 10 });
      expect(out.session.engineV2!.highLower).toBe(true);
    },
  );

  it("preserves an allowed forced simple start and fits the reduced dose for the date", () => {
    const full = buildRunning(profile, "speed", "development", {
      force: {
        goal: "acceleration",
        mainVariantId: "accel_falling",
        drillSetId: "ds_start_basic",
        addition: null,
        why: [],
      },
    })!;
    const reduced = buildRunning(profile, "speed", full.phase, {
      force: full.sprintVariant,
      preMatch: true,
    })!;
    const out = place(matchProfile, "2026-11-20", full, reduced.minutes);
    if ("blocked" in out) throw new Error(out.blocked.message);
    expect(out.session.engineV2!.sprintVariant?.mainVariantId).toBe("accel_falling");
    expect(out.session.engineV2!.minutes).toBeLessThanOrEqual(reduced.minutes);
    expect(main(out.session.engineV2!).dose).toMatchObject({ sets: 3, distanceM: 10 });
  });

  it.each([30, 45, 75])("keeps the existing no-match fit at a %i minute budget", (budget) => {
    const full = buildRunning(profile, "speed", "development")!;
    const expected = fitSprintToBudget(full, budget)!;
    const out = place(profile, "2026-11-20", full, budget);
    if ("blocked" in out) throw new Error(out.blocked.message);
    expect(out.session.engineV2).toEqual(expected);
  });

  it("does not apply the pre-match reduction two days after a match", () => {
    const p = { ...profile, matchDate: "2026-11-18", matchDates: ["2026-11-18"] };
    const full = buildRunning(profile, "speed", "development")!;
    const out = place(p, "2026-11-20", full);
    if ("blocked" in out) throw new Error(out.blocked.message);
    expect(out.session.engineV2).toEqual(fitSprintToBudget(full, 75));
  });

  it("still blocks a sprint on MD-1 through the shared match buffer", () => {
    const reduced = buildRunning(profile, "speed", "development", { preMatch: true })!;
    expect(place(matchProfile, "2026-11-21", reduced)).toMatchObject({
      blocked: { code: "MATCH_BUFFER" },
    });
  });
});
