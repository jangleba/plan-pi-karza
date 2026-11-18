import { describe, expect, it } from "vitest";
import type { Profile, Readiness, SessionDay } from "../types";
import { weekday, type EngineOptions, type WeeklyTargets } from "./model";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { weeklyTargetCoverage } from "./weeklyTargets";

const profile: Profile = {
  name: "Planning test",
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
const targets: WeeklyTargets = { strength: 2, speed: 2, endurance: 1 };
const options: EngineOptions = { startDate: "2026-11-02", weeks: 1, minutesPerSession: 75 };
const sessions = (plan: SessionDay[]) =>
  plan.flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])]);
const roles = (plan: SessionDay[], role: "speed" | "endurance" | "skills" | "mobility") =>
  sessions(plan).filter((s) => s.engineV2?.roles.includes(role));

describe("explicit weekly requests and light free-day tasks", () => {
  it.each([
    { weeklyTargets: null },
    { weeklyTargets: { strength: 2, speed: 3, endurance: 1 } },
    { fillRestDays: "false" },
    { fillRestDays: null },
    { minFullRestDays: null },
  ])("rejects malformed stored scheduling preferences: %j", (invalid) => {
    expect(() =>
      generateTrainingPlan(profile, { ...options, ...invalid } as EngineOptions),
    ).toThrow();
  });

  it("keeps automatic endurance policy until a request explicitly sets one run", () => {
    const automatic = generateTrainingPlan(profile, options);
    const explicit = generateTrainingPlan(profile, { ...options, weeklyTargets: targets });
    expect(roles(automatic.plan, "endurance")).toHaveLength(2);
    expect(roles(explicit.plan, "endurance")).toHaveLength(1);
    expect(automatic.plan[0].planInputs).not.toHaveProperty("weeklyTargets");
    expect(explicit.plan[0].planInputs?.weeklyTargets).toEqual(targets);
  });

  it("places a second sprint through the same final calendar and load gates", () => {
    const request = { ...options, weeklyTargets: targets, minFullRestDays: 1 as const };
    const result = generateTrainingPlan(profile, request);
    expect(weeklyTargetCoverage(result.plan, targets)[0].planned).toEqual(targets);
    expect(validateTrainingPlan(result.plan, profile, request)).toEqual([]);
    expect(roles(result.plan, "speed")).toHaveLength(2);
    expect(
      new Set(roles(result.plan, "speed").map((s) => s.engineV2?.sprintVariant?.mainVariantId))
        .size,
    ).toBe(2);
    expect(result.issues.filter((i) => i.code === "UNMET_GOAL_TARGET")).toEqual([]);
  });

  it("automatically keeps one main sprint for an endurance-priority week without requesting a second", () => {
    const request: EngineOptions = {
      ...options,
      sessionDurationMode: "full",
      weeklyTargets: { ...targets, speed: "auto" },
      minFullRestDays: 1,
    };
    const result = generateTrainingPlan(profile, request);
    expect(roles(result.plan, "speed")).toHaveLength(1);
    expect(roles(result.plan, "endurance")).toHaveLength(1);
    expect(
      weeklyTargetCoverage(result.plan, request.weeklyTargets!)[0].fullRestDays,
    ).toBeGreaterThanOrEqual(1);
    expect(
      result.issues.filter(
        (i) =>
          i.target === "speed" && ["UNMET_WEEKLY_TARGET", "UNMET_GOAL_TARGET"].includes(i.code),
      ),
    ).toEqual([]);
    expect(validateTrainingPlan(result.plan, profile, request)).toEqual([]);
  });

  it("explains zero automatic sprints in an unavailable week without inventing a numeric sprint deficit", () => {
    const unavailable = { ...profile, unavailableDays: [1, 2, 3, 4, 5, 6, 7] };
    const request: EngineOptions = {
      ...options,
      sessionDurationMode: "full",
      weeklyTargets: { ...targets, speed: "auto" },
      minFullRestDays: 1,
    };
    const result = generateTrainingPlan(unavailable, request);
    expect(roles(result.plan, "speed")).toEqual([]);
    const context = result.issues.find(
      (i) => i.code === "AUTO_SPRINT_CONTEXT" && i.target === "speed",
    );
    expect(context?.message).toMatch(/dostępn/i);
    expect(context?.cause).toBe("calendar");
    expect(
      result.issues.filter(
        (i) =>
          i.target === "speed" && ["UNMET_WEEKLY_TARGET", "UNMET_GOAL_TARGET"].includes(i.code),
      ),
    ).toEqual([]);
    expect(validateTrainingPlan(result.plan, unavailable, request)).toEqual([]);
  });

  it("fills unused days with genuine light support and preserves one whole rest day", () => {
    const request = {
      ...options,
      weeklyTargets: { ...targets, speed: 1 as const },
      fillRestDays: true,
      minFullRestDays: 1 as const,
    };
    const result = generateTrainingPlan(profile, request);
    const coverage = weeklyTargetCoverage(result.plan, request.weeklyTargets)[0];
    expect(coverage.fullRestDays).toBe(1);
    expect(coverage.planned).toEqual(request.weeklyTargets);
    const light = sessions(result.plan).filter((s) =>
      s.engineV2?.roles.some((r) => r === "skills" || r === "mobility" || r === "recovery"),
    );
    expect(light.length).toBeGreaterThan(0);
    expect(light.every((s) => !s.engineV2!.highLower && s.engineV2!.sprintMetres === 0)).toBe(true);
    expect(validateTrainingPlan(result.plan, profile, request)).toEqual([]);
    expect(result.plan[0].planInputs).toMatchObject({ fillRestDays: true, minFullRestDays: 1 });
  });

  it("keeps unavailable, readiness-stop and execution-protected rest days unchanged", () => {
    const request = { ...options, weeklyTargets: { ...targets, speed: 1 as const } };
    const baseline = generateTrainingPlan(profile, request).plan;
    const rests = baseline.filter((d) => d.dayType === "rest");
    expect(rests.length).toBeGreaterThanOrEqual(3);
    const locked = structuredClone(rests[0]);
    locked.executionProtected = true;
    const stopped = rests[2].date;
    const readiness = { jointPain: 2 } as Readiness;
    const nextProfile = { ...profile, unavailableDays: [weekday(rests[1].date)] };
    const result = generateTrainingPlan(nextProfile, {
      ...request,
      fillRestDays: true,
      minFullRestDays: 0,
      lockedDays: [locked],
      readiness: { [stopped]: readiness },
    });
    expect(result.plan.find((d) => d.date === locked.date)).toMatchObject({
      dayType: "rest",
      executionProtected: true,
      secondSession: null,
      sections: locked.sections,
    });
    expect(result.plan.find((d) => d.date === rests[1].date)).toMatchObject({
      dayType: "rest",
      isUnavailable: true,
      secondSession: null,
    });
    expect(result.plan.find((d) => d.date === stopped)?.engineV2).toBeUndefined();
    expect(result.plan.find((d) => d.date === stopped)?.secondSession).toBeNull();
  });

  it("uses mobility without inventing ball access and never fills a pain stop", () => {
    const noBall = { ...profile, equipment: profile.equipment.filter((e) => e !== "ball") };
    const result = generateTrainingPlan(noBall, { ...options, fillRestDays: true });
    expect(roles(result.plan, "skills")).toEqual([]);
    expect(roles(result.plan, "mobility").length).toBeGreaterThan(0);
    expect(weeklyTargetCoverage(result.plan, targets)[0].fullRestDays).toBeGreaterThanOrEqual(1);
    const stopped = generateTrainingPlan(
      { ...noBall, painInjury: true },
      {
        ...options,
        weeklyTargets: targets,
        fillRestDays: true,
      },
    );
    expect(sessions(stopped.plan).some((s) => s.engineV2)).toBe(false);
  });

  it("reports the missing sprint in a constrained match week instead of bypassing gates", () => {
    const matchProfile: Profile = {
      ...profile,
      clubTrainingDays: [3, 5],
      matchDate: "2026-11-08",
      matchDates: ["2026-11-08"],
      seasonPhase: "inseason",
    };
    const request = {
      ...options,
      weeklyTargets: targets,
      fillRestDays: true,
      minFullRestDays: 1 as const,
    };
    const result = generateTrainingPlan(matchProfile, request);
    const coverage = weeklyTargetCoverage(result.plan, targets)[0];
    expect(coverage.planned.speed).toBeLessThan(2);
    expect(coverage.planned.endurance).toBe(1);
    expect(coverage.fullRestDays).toBeGreaterThanOrEqual(1);
    expect(result.plan.filter((d) => d.dayType === "club").map((d) => d.dayOfWeek)).toEqual([3, 5]);
    expect(result.plan.find((d) => d.date === "2026-11-08")?.dayType).toBe("match");
    const issue = result.issues.find((i) => i.code === "UNMET_GOAL_TARGET" && i.target === "speed");
    expect(issue?.message).toContain("z 2 sesji sprintu");
    expect(issue?.reasonCodes?.length).toBeGreaterThan(0);
    expect(validateTrainingPlan(result.plan, matchProfile, request)).toEqual([]);
  });

  it("reports impossible full rest without deleting club or match commitments", () => {
    const busy = { ...profile, clubTrainingDays: [1, 2, 3, 4, 5, 6, 7] };
    const result = generateTrainingPlan(busy, {
      ...options,
      minFullRestDays: 1,
      fillRestDays: true,
    });
    expect(result.plan.every((d) => d.dayType === "club")).toBe(true);
    expect(result.issues.some((i) => i.code === "UNMET_REST_TARGET")).toBe(true);
  });

  it("reserves full rest before the four baseline tasks and keeps the primary goal", () => {
    const busy: Profile = {
      ...profile,
      clubTrainingDays: [2, 4, 6],
      doubleSessionsAllowed: "no",
    };
    const withoutReserve = generateTrainingPlan(busy, options);
    expect(weeklyTargetCoverage(withoutReserve.plan, targets)[0].fullRestDays).toBe(0);
    const request = { ...options, minFullRestDays: 1 as const };
    const result = generateTrainingPlan(busy, request);
    expect(weeklyTargetCoverage(result.plan, targets)[0].fullRestDays).toBe(1);
    expect(result.plan.filter((d) => d.dayType === "club")).toHaveLength(3);
    expect(result.issues.some((i) => i.code === "UNMET_REST_TARGET")).toBe(false);
    expect(roles(result.plan, "endurance")).toHaveLength(1);
    expect(
      result.issues.some((i) => i.code === "AUTO_SPRINT_CONTEXT" && i.target === "speed"),
    ).toBe(true);
    expect(
      result.issues.some((i) => i.code === "UNMET_WEEKLY_TARGET" && i.target === "speed"),
    ).toBe(false);
    expect(result.issues.some((i) => i.message.includes("pełny dzień odpoczynku"))).toBe(true);
    expect(validateTrainingPlan(result.plan, busy, request)).toEqual([]);

    const doubles = { ...busy, doubleSessionsAllowed: "yes_if_safe" as const };
    const withDoubles = generateTrainingPlan(doubles, request);
    expect(weeklyTargetCoverage(withDoubles.plan, targets)[0].fullRestDays).toBe(1);
    expect(roles(withDoubles.plan, "endurance").length).toBeGreaterThan(0);
    expect(withDoubles.issues.some((i) => i.code === "UNMET_REST_TARGET")).toBe(false);
    expect(validateTrainingPlan(withDoubles.plan, doubles, request)).toEqual([]);
  });

  it("keeps the last full rest day instead of scheduling optional match activation", () => {
    const busy: Profile = {
      ...profile,
      clubTrainingDays: [2, 3, 4, 5],
      matchDate: "2026-11-08",
      matchDates: ["2026-11-08"],
      seasonPhase: "inseason",
    };
    const result = generateTrainingPlan(busy, {
      ...options,
      weeklyTargets: targets,
      minFullRestDays: 1,
      fillRestDays: true,
    });
    expect(weeklyTargetCoverage(result.plan, targets)[0].fullRestDays).toBe(1);
    expect(result.plan.find((d) => d.date === "2026-11-07")?.dayType).toBe("rest");
    expect(result.issues.some((i) => i.code === "UNMET_ACTIVATION")).toBe(true);
    expect(result.issues.some((i) => i.code === "UNMET_REST_TARGET")).toBe(false);
  });

  it("inherits saved preferences only when the caller omits their properties", () => {
    const saved = generateTrainingPlan(profile, {
      ...options,
      weeklyTargets: targets,
      fillRestDays: true,
      minFullRestDays: 1,
    }).plan;
    const inherited = generateTrainingPlan(profile, { ...options, previousPlan: saved });
    expect(inherited.plan[0].planInputs).toMatchObject({
      weeklyTargets: { ...targets, speed: "auto" },
      fillRestDays: true,
      minFullRestDays: 1,
    });
    expect(roles(inherited.plan, "endurance")).toHaveLength(1);
    expect(roles(inherited.plan, "speed")).toHaveLength(1);
    expect(saved[0].planInputs?.weeklyTargets).toEqual(targets);
    const explicitLegacy = generateTrainingPlan(profile, {
      ...options,
      previousPlan: saved,
      weeklyTargets: targets,
    });
    expect(explicitLegacy.plan[0].planInputs?.weeklyTargets).toEqual(targets);
    expect(roles(explicitLegacy.plan, "speed")).toHaveLength(2);
    const reset = generateTrainingPlan(profile, {
      ...options,
      previousPlan: saved,
      weeklyTargets: undefined,
      fillRestDays: undefined,
      minFullRestDays: undefined,
    });
    expect(reset.plan[0].planInputs).not.toHaveProperty("weeklyTargets");
    expect(reset.plan[0].planInputs).not.toHaveProperty("fillRestDays");
    expect(reset.plan[0].planInputs).not.toHaveProperty("minFullRestDays");
    expect(roles(reset.plan, "endurance")).toHaveLength(2);
  });

  it("keeps all option-free output unchanged when optional properties are undefined", () => {
    expect(
      generateTrainingPlan(profile, {
        ...options,
        weeklyTargets: undefined,
        fillRestDays: undefined,
        minFullRestDays: undefined,
      }),
    ).toEqual(generateTrainingPlan(profile, options));
  });
});
