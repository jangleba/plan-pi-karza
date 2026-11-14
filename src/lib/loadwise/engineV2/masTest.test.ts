import { describe, expect, it } from "vitest";
import { proposeMasTest } from "./masTest";
import { buildMasTestSession, masTestIneligibility } from "./masTestRecipe";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { classifySession } from "../sessionClassification";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import type { Profile, SessionCompletion, SessionDay } from "../types";

const base = {
  name: "MAS athlete",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [1],
  individualTrainingDays: [2, 3, 4, 5, 6, 7],
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
    "med_ball",
    "nordic_setup",
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
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
} as unknown as Profile;
// Two free days and no doubles: the calendar has room for a hard run next to nothing heavy.
const roomy = {
  ...base,
  individualTrainingDays: [3, 6],
  doubleSessionsAllowed: "no",
  clubTrainingDays: [],
} as Profile;
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const TODAY = "2026-11-03";
function saved(p: Profile) {
  const plan = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 2 }).plan;
  for (const d of plan) {
    d.dayDbId = `day-${d.date}`;
    d.planDbId = "plan-1";
    slots(d).forEach((s, i) => {
      if (s.dayType !== "rest") s.dbId = `s-${s.date}-${i}`;
    });
  }
  return plan;
}
const offer = (p: Profile, plan = saved(p), completions: Record<string, SessionCompletion> = {}) =>
  proposeMasTest({ profile: p, plan, completions, todayIso: TODAY, planId: "plan-1" });
const ownCount = (plan: SessionDay[]) => plan.flatMap(slots).filter((s) => s.engineV2).length;

describe("voluntary field MAS test ('Ustal tempo')", () => {
  it("replaces one unstarted calm run with a validated 5-minute test and adds no third session", () => {
    const plan = saved(roomy);
    const result = offer(roomy, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { proposal } = result;
    expect(proposal.changes).toHaveLength(1);
    expect(proposal.changes[0]).toMatchObject({ kind: "mas_test" });
    const upcoming = plan.filter((d) => d.date >= TODAY);
    expect(ownCount(proposal.candidatePlan)).toBe(ownCount(upcoming));
    expect(
      validateTrainingPlan(proposal.candidatePlan, roomy, {
        startDate: TODAY,
        minutesPerSession: 75,
      }),
    ).toEqual([]);
    const test = proposal.candidatePlan
      .flatMap(slots)
      .find((s) => s.runningRecipe?.method === "field_mas_test")!;
    expect(test.runningRecipe!.id.startsWith("v2:mas-test:")).toBe(true);
    // warm-up and cool-down included: 10 + 5 + 5 minutes
    expect(test.durationMin).toBe(20);
    expect(proposal.candidatePlan.flatMap((d) => d.feedbackAdjustments ?? [])[0]).toMatchObject({
      kind: "mas_test",
    });
  });

  it("the prepared session is recognised by the existing counter and tracker contracts", () => {
    const result = offer(roomy);
    if (!result.ok) throw new Error(result.reason);
    const test = result.proposal.candidatePlan
      .flatMap(slots)
      .find((s) => s.runningRecipe?.method === "field_mas_test")!;
    expect(classifySession(test).subcategory).toBe("field_mas_test");
    const protocol = deriveRunningIntervalProtocol(test)!;
    const work = protocol.steps.filter((s) => s.kind === "work");
    expect(work).toHaveLength(1);
    expect(work[0].target).toMatchObject({ mode: "time", value: 300 });
  });

  it.each([
    ["under 16", { age: 15 }],
    ["not sport-prepared", { level: "beginner" }],
    ["a lighter route", { secondaryLimiter: "fatigue" }],
    ["reported pain", { painInjury: true }],
    ["no pitch", { hasPitch: false }],
  ])("is not offered for %s", (_n, patch) => {
    const p = { ...roomy, ...patch } as Profile;
    expect(masTestIneligibility(p, TODAY)).toBeTruthy();
    const plan = saved(roomy);
    const result = proposeMasTest({
      profile: p,
      plan,
      completions: {},
      todayIso: TODAY,
      planId: "plan-1",
    });
    expect(result.ok).toBe(false);
  });

  it("is not offered while a valid result (under 28 days, with its source session) exists", () => {
    const p = {
      ...base,
      fieldMasKmh: 15.2,
      fieldMasTestedAt: "2026-10-20",
      fieldMasSourceSessionId: "src",
    } as Profile;
    expect(masTestIneligibility(p, TODAY)).toContain("nadal ważny");
    const expired = { ...p, fieldMasTestedAt: "2026-09-01" } as Profile;
    expect(masTestIneligibility(expired, TODAY)).toBeNull();
  });

  it("respects the calendar: in a full week with heavy leg days around, the test is refused with a reason", () => {
    const dense = offer(base);
    expect(dense.ok).toBe(false);
    if (!dense.ok) expect(dense.reason).toMatch(/Test nie mieści się|nie przechodzi kontroli/);
  });

  it("never replaces a started or finished run, and says why when nothing can be replaced", () => {
    const plan = saved(roomy);
    const runs = plan
      .filter((d) => d.date >= TODAY)
      .flatMap(slots)
      .filter((s) => s.engineV2?.roles[0] === "endurance" && s.dbId);
    const done = Object.fromEntries(
      runs.map((s) => [
        s.dbId!,
        { completed: true, status: "completed", rpe: 5, notes: "" } as SessionCompletion,
      ]),
    );
    const result = offer(roomy, plan, done);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("spokojnego biegu");
  });

  it("the validator accepts only the engine's own test recipe and rejects a test for an ineligible profile", () => {
    const young = { ...roomy, age: 15 } as Profile;
    const plan = saved(roomy);
    const session = buildMasTestSession(roomy, "2026-11-04");
    expect(session.runningRecipe!.blocks[0].work.seconds).toBe(300);
    const result = offer(roomy, plan);
    if (!result.ok) throw new Error(result.reason);
    const issues = validateTrainingPlan(result.proposal.candidatePlan, young, {
      startDate: TODAY,
      minutesPerSession: 75,
    });
    expect(issues.some((i) => i.code === "MAS_TEST_ELIGIBILITY")).toBe(true);
    // a look-alike recipe with a foreign id is still refused
    const fake = structuredClone(result.proposal.candidatePlan);
    for (const s of fake.flatMap(slots))
      if (s.runningRecipe?.method === "field_mas_test") {
        s.runningRecipe = { ...s.runningRecipe, id: "other:test" };
        s.engineV2!.runningRecipe = s.runningRecipe;
      }
    expect(
      validateTrainingPlan(fake, roomy, { startDate: TODAY, minutesPerSession: 75 }).some(
        (i) => i.code === "UNSUPPORTED_RUN_METHOD",
      ),
    ).toBe(true);
  });
});

describe("what the engine does with the result", () => {
  // two available days and no doubles, so the calendar does not force a calm run
  const tight = {
    ...base,
    individualTrainingDays: [3, 6],
    doubleSessionsAllowed: "no",
    clubTrainingDays: [],
  } as Profile;
  const methods = (p: Profile) =>
    generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 2 })
      .plan.flatMap(slots)
      .filter((s) => s.engineV2?.roles.includes("endurance"))
      .map((s) => `${s.runningRecipe!.method}/${s.runningRecipe!.paceSource}`);
  it("uses a valid result with its source session, and never invents a personal pace without one", () => {
    const withResult = {
      ...tight,
      fieldMasKmh: 15.2,
      fieldMasTestedAt: "2026-11-01",
      fieldMasSourceSessionId: "src",
    } as Profile;
    const noSource = { ...tight, fieldMasKmh: 15.2, fieldMasTestedAt: "2026-11-01" } as Profile;
    expect(methods(withResult).every((m) => m.endsWith("/field_mas"))).toBe(true);
    expect(methods(noSource).some((m) => m.endsWith("/field_mas"))).toBe(false);
    expect(methods(tight).some((m) => m.endsWith("/field_mas"))).toBe(false);
  });
  it("an expired result (over 28 days) is no longer used", () => {
    const expired = {
      ...tight,
      fieldMasKmh: 15.2,
      fieldMasTestedAt: "2026-09-01",
      fieldMasSourceSessionId: "src",
    } as Profile;
    expect(methods(expired).some((m) => m.endsWith("/field_mas"))).toBe(false);
  });
});
