import { describe, expect, it } from "vitest";
import type { Profile, SessionCompletion, SessionDay } from "../types";
import type { EngineOptions, EngineSession, WeeklyTargets } from "./model";
import { plusDays } from "./model";
import {
  generateTrainingPlan,
  validateTrainingPlan,
  placeRecipeOnDate,
  removeOwnSession,
} from "./planner";
import { buildStrength, buildRunning } from "./exercises";
import { buildEnduranceForDate } from "./endurance";
import { weeklyTargetCoverage } from "./weeklyTargets";
import { normalizeSessionCategory } from "../sessionClassification";
import { hasKnownHighLowerLoad } from "./scheduling";
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

const recurring: Profile = {
  ...profile,
  clubTrainingDays: [3, 5],
  weeklyMatches: true,
  usualMatchDay: 7,
  seasonPhase: "inseason",
};
const targets: WeeklyTargets = { strength: 2, speed: 2, endurance: 1 };
const options: EngineOptions = {
  startDate: "2026-11-16",
  weeks: 4,
  minutesPerSession: 75,
  weeklyTargets: targets,
  fillRestDays: true,
  minFullRestDays: 1,
};
const slots = (day: SessionDay) => [day, ...(day.secondSession ? [day.secondSession] : [])];
const own = (plan: SessionDay[]) => plan.flatMap(slots).filter((s) => s.engineV2);
function emptyCalendar(plan: SessionDay[], p: Profile, opts: EngineOptions) {
  let calendar = structuredClone(plan);
  const ids: string[] = [];
  for (const day of calendar)
    for (const [slot, session] of slots(day).entries()) {
      if (!session.engineV2) continue;
      session.dbId = `counterexample-${day.date}-${slot}`;
      ids.push(session.dbId);
    }
  for (const id of ids) {
    const next = removeOwnSession(calendar, id, p, opts);
    expect(next).not.toBeNull();
    calendar = next!;
  }
  return calendar;
}

describe("whole-week search includes the existing post-match strength variants", () => {
  it("keeps the baseline sprint through all four weeks with a match every Sunday", () => {
    const result = generateTrainingPlan(recurring, options);
    expect(result.plan.filter((day) => day.dayType === "match").map((day) => day.date)).toEqual([
      "2026-11-22",
      "2026-11-29",
      "2026-12-06",
      "2026-12-13",
    ]);
    const weeks = weeklyTargetCoverage(result.plan, targets);
    expect(weeks).toHaveLength(4);
    for (const week of weeks) {
      expect(week.planned).toEqual({ strength: 2, speed: 1, endurance: 1 });
      expect(week.fullRestDays).toBeGreaterThanOrEqual(1);
    }
    const md1 = own(result.plan).filter((s) => s.engineV2!.postMatch === "full");
    expect(md1).toHaveLength(4);
    expect(md1.every((s) => s.dayOfWeek === 1)).toBe(true);
    expect(result.issues.filter((issue) => issue.code === "UNMET_WEEKLY_TARGET")).toEqual([]);
    expect(validateTrainingPlan(result.plan, recurring, options)).toEqual([]);
    expect(result.plan.every((day) => !day.secondSession?.secondSession)).toBe(true);
    expect(own(result.plan).every((s) => s.durationMin <= 75)).toBe(true);
    expect(md1.map((s) => s.engineV2!.cycle!.weekIndex)).toEqual([0, 1, 2, 3]);
  });

  it("also covers later weeks when the next Sunday fixture is saved explicitly", () => {
    const p = { ...recurring, matchDate: "2026-11-22", matchDates: ["2026-11-22"] };
    const result = generateTrainingPlan(p, options);
    expect(weeklyTargetCoverage(result.plan, targets).map((w) => w.planned.speed)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(validateTrainingPlan(result.plan, p, options)).toEqual([]);
  });

  it("matches the four-task coverage of an independently placed legal MD+1 counterexample", () => {
    const opts = { ...options, weeks: 1 };
    const generated = generateTrainingPlan(recurring, opts);
    let candidate = emptyCalendar(generated.plan, recurring, opts);
    const a = buildStrength(recurring, "A", "development");
    const b = buildStrength(recurring, "B", "development");
    const speed = buildRunning(recurring, "speed", "development");
    const run = buildEnduranceForDate(recurring, "2026-11-17", "development");
    expect(speed).not.toBeNull();
    expect(run).not.toBeNull();
    const schedule: Array<[string, EngineSession]> = [
      ["2026-11-16", { ...a, postMatch: "full" }],
      ["2026-11-18", b],
      ["2026-11-20", speed!],
      ["2026-11-17", run!],
    ];
    for (const [date, recipe] of schedule) {
      const placed = placeRecipeOnDate(candidate, date, recipe, recurring, opts);
      expect(placed).not.toHaveProperty("blocked");
      if ("plan" in placed) candidate = placed.plan;
    }
    expect(validateTrainingPlan(candidate, recurring, opts)).toEqual([]);
    const manual = weeklyTargetCoverage(candidate, targets)[0];
    expect(manual.planned).toEqual({ strength: 2, speed: 1, endurance: 1 });
    expect(manual.fullRestDays).toBe(2);
    expect(weeklyTargetCoverage(generated.plan, targets)[0].planned).toEqual(manual.planned);
  });

  it("prefers ordinary strength dates when they already cover the same four tasks", () => {
    const p: Profile = {
      ...recurring,
      clubTrainingDays: [],
      weeklyMatches: false,
      usualMatchDay: null,
      matchDate: "2026-11-18",
      matchDates: ["2026-11-18"],
    };
    const opts = { ...options, weeks: 1 };
    const result = generateTrainingPlan(p, opts);
    expect(weeklyTargetCoverage(result.plan, targets)[0].planned).toEqual({
      strength: 2,
      speed: 1,
      endurance: 1,
    });
    expect(own(result.plan).filter((s) => s.engineV2!.postMatch)).toEqual([]);
    expect(validateTrainingPlan(result.plan, p, opts)).toEqual([]);
  });

  it("preserves locked Mondays instead of forcing the improved schedule through execution locks", () => {
    const first = generateTrainingPlan(recurring, options);
    const calendar = emptyCalendar(first.plan, recurring, options);
    const lockedDays = calendar
      .filter((day) => day.dayOfWeek === 1)
      .map((day) => ({ ...day, executionProtected: true }));
    const original = structuredClone(lockedDays);
    const result = generateTrainingPlan(recurring, { ...options, lockedDays });
    for (const locked of lockedDays) {
      const preserved = result.plan.find((d) => d.date === locked.date)!;
      expect(preserved.executionProtected).toBe(true);
      expect(preserved.engineV2).toBeUndefined();
      expect(preserved.secondSession).toBeNull();
      expect(preserved.sections).toEqual(locked.sections);
    }
    expect(lockedDays).toEqual(original);
    expect(validateTrainingPlan(result.plan, recurring, options)).toEqual([]);
  });

  it("retains the known-load gate after an executed 90-minute high-impact match", () => {
    const calendar = emptyCalendar(
      generateTrainingPlan(recurring, { ...options, weeks: 1 }).plan,
      recurring,
      options,
    );
    const match = normalizeSessionCategory({
      ...calendar.find((day) => day.dayType === "match")!,
      date: plusDays(options.startDate, -1),
      dayOfWeek: 7,
      dbId: "known-sunday-match",
      durationMin: 90,
      intensity: "wysoka",
      executionProtected: true,
    });
    // A duration alone is not an impact classification. This immutable execution
    // explicitly records high-impact running; MD+1 must not bypass that known load.
    match.classification = { ...match.classification!, isHighImpactRunning: true };
    expect(hasKnownHighLowerLoad(match, recurring)).toBe(true);
    const completed: SessionCompletion = {
      completed: true,
      status: "completed",
      writeVersion: 1,
      rpe: 8,
      notes: "",
      matchMinutesPlayed: 90,
      durationMin: 90,
      executionSnapshot: match,
      endedAt: "2026-11-15T20:00:00Z",
    };
    const opts = {
      ...options,
      weeks: 1,
      precedingDays: [match],
      completions: { [match.dbId!]: completed },
    };
    const result = generateTrainingPlan(recurring, opts);
    expect(
      own(result.plan).filter(
        (s) => s.date === options.startDate && s.engineV2!.postMatch === "full",
      ),
    ).toEqual([]);
    expect(validateTrainingPlan(result.plan, recurring, opts)).toEqual([]);
    expect(completed.matchMinutesPlayed).toBe(90);
  });
});
