import { describe, expect, it } from "vitest";
import { generateTrainingPlan } from "./engineV2/planner";
import { gymAthlete } from "./engineV2/testFixtures";
import { sessionStartIssue } from "./engineV2/planStatus";
import { buildReadiness } from "./readinessModel";
import { selectEffectivePlan } from "./effectivePlanSelector";
import type { Profile, Readiness, SessionDay, SessionModification } from "./types";
import {
  decideReadinessAdjustment,
  READINESS_ADJUSTMENT_REASON,
  type ReadinessDecision,
} from "./todayReadinessAdjustment";

const profile: Profile = {
  ...gymAthlete,
  age: 21,
  goal: "strength",
  healthPersonalizationEnabled: true,
};
function fixture(p = profile, weeks = 1): SessionDay[] {
  return generateTrainingPlan(p, {
    startDate: "2026-11-16",
    weeks,
    sessionDurationMode: "full",
    weeklyTargets: { strength: 2, speed: "auto", endurance: 1 },
    fillRestDays: true,
    minFullRestDays: 1,
  }).plan.map((day, i) => ({
    ...day,
    dbId: `session-${i}`,
    dayDbId: `day-${i}`,
    planDbId: "plan",
    secondSession: day.secondSession ? { ...day.secondSession, dbId: `second-${i}` } : null,
  }));
}
const sessionsOf = (plan: SessionDay[]) =>
  plan.flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])]);
const find = (plan: SessionDay[], role: string) =>
  sessionsOf(plan).find((s) => s.engineV2?.roles.includes(role as "strengthA"))!;
const good = (date: string): Readiness =>
  buildReadiness(date, { sleep: 9, fatigue: 2, soreness: 2, jointPain: 0 });
const low = (date: string): Readiness =>
  buildReadiness(date, { sleep: 2, fatigue: 9, soreness: 8, jointPain: 0 });
const pain = (date: string): Readiness =>
  buildReadiness(date, {
    sleep: 8,
    fatigue: 3,
    soreness: 3,
    jointPain: 4,
    painLocation: "knee",
    altersMovement: true,
  });
const alarm = (date: string): Readiness =>
  buildReadiness(date, { sleep: 8, fatigue: 3, soreness: 3, jointPain: 0, redFlags: ["fainting"] });

/** Everything that is done in a session: sets × work, plus metres of fast running. */
const workload = (s: SessionDay) =>
  (s.engineV2?.exercises ?? [])
    .filter((e) => e.role !== "warmup" && e.role !== "mobility")
    .reduce(
      (sum, e) =>
        sum +
        e.dose.sets *
          (e.dose.reps ??
            (e.dose.seconds ? e.dose.seconds / 10 : e.dose.distanceM ? e.dose.distanceM / 10 : 1)),
      0,
    ) + (s.engineV2?.sprintMetres ?? 0);

function decide(
  plan: SessionDay[],
  target: SessionDay,
  readiness: Readiness | undefined,
  completions = {},
  modifications: SessionModification[] = [],
  p = profile,
): ReadinessDecision {
  return decideReadinessAdjustment({
    profile: p,
    plan,
    completions,
    readiness,
    modifications,
    date: target.date,
  });
}
const adjustOf = (decision: ReadinessDecision) => {
  expect(decision.kind).toBe("adjust");
  if (decision.kind !== "adjust") throw new Error("no adjustment");
  return decision;
};

describe("daily check-in recalculation of today's session", () => {
  it("a skipped check-in changes nothing: the full session stands, no answer is invented", () => {
    const plan = fixture();
    const before = structuredClone(plan);
    const target = find(plan, "strengthA");
    expect(decide(plan, target, undefined)).toEqual({ kind: "none" });
    expect(plan).toEqual(before);
    expect(target.engineV2?.sessionDurationMode).toBe("full");
    expect(sessionStartIssue({ session: target, profile, todayIso: target.date })).toBeNull();
  });

  it("an adequate readiness keeps the full session", () => {
    const plan = fixture();
    const target = find(plan, "strengthA");
    expect(decide(plan, target, good(target.date))).toEqual({ kind: "none" });
  });

  it.each(["strengthA", "strengthB", "speed", "endurance"])(
    "low readiness really lightens today's %s and explains what changed",
    (role) => {
      const plan = fixture();
      const target = find(plan, role);
      const readiness = low(target.date);
      expect(readiness.overall).toBeLessThanOrEqual(4);
      // Today the saved full session may not start on this check-in.
      expect(
        sessionStartIssue({ session: target, profile, todayIso: target.date, readiness }),
      ).toMatch(/lżejszego planu/);
      const { session, day } = adjustOf(decide(plan, target, readiness));
      expect(workload(session)).toBeLessThan(workload(target));
      expect(session.durationMin).toBeLessThanOrEqual(target.durationMin);
      expect(session.readinessAdjustment?.changes.length).toBeGreaterThan(0);
      expect(session.readinessAdjustment?.reason).toContain(`${readiness.overall}/10`);
      expect(session.readinessAdjustment?.beforeMinutes).toBe(target.durationMin);
      // The warm-up stays, the lighter recipe is a real session of the same kind.
      expect(session.engineV2?.exercises.some((e) => e.role === "warmup")).toBe(
        target.engineV2!.exercises.some((e) => e.role === "warmup"),
      );
      expect(session.engineV2?.roles).toEqual(target.engineV2?.roles);
      // The lighter session satisfies the rule it answers; the original one still does not.
      expect(sessionStartIssue({ session, profile, todayIso: target.date, readiness })).toBeNull();
      // Finite numbers only: nothing like Infinity or NaN reaches the stored JSON.
      const json = JSON.stringify(day);
      expect(json).not.toMatch(/Infinity|NaN/);
      expect(JSON.parse(json).readinessAdjustment.kind).toMatch(/lighter|compact/);
    },
  );

  it("changes only today's unstarted session: other days and the second session stay as saved", () => {
    const p: Profile = {
      ...profile,
      doubleSessionsAllowed: "yes_if_safe",
      clubTrainingDays: [3, 5],
    };
    const plan = fixture(p, 2);
    const paired = plan.find((day) => day.secondSession?.engineV2 && day.engineV2);
    const target = (paired ?? plan.find((d) => d.engineV2?.roles.includes("strengthA")))!;
    const before = structuredClone(plan);
    const decision = adjustOf(decide(plan, target, low(target.date), {}, [], p));
    expect(plan).toEqual(before);
    expect(decision.day.date).toBe(target.date);
    if (target.secondSession)
      expect(decision.day.secondSession?.dbId).toBe(target.secondSession.dbId);
    const next = plan.map((day) => (day.date === target.date ? decision.day : day));
    for (const day of next.filter((d) => d.date !== target.date))
      expect(day).toEqual(before.find((d) => d.date === day.date));
  });

  it.each([
    ["pain", pain],
    ["a red flag", alarm],
  ])("%s blocks the start and does not rewrite the recipe", (_, answer) => {
    const plan = fixture();
    const target = find(plan, "strengthA");
    const readiness = answer(target.date);
    expect(decide(plan, target, readiness)).toEqual({ kind: "stop" });
    expect(
      sessionStartIssue({ session: target, profile, todayIso: target.date, readiness }),
    ).toMatch(/wstrzymuje trening/);
  });

  it.each(["started", "completed"])("a %s session is protected", (status) => {
    const plan = fixture();
    const target = find(plan, "strengthA");
    const completions = {
      [target.dbId!]: {
        completed: status === "completed",
        status,
        rpe: 6,
        notes: "",
        writeVersion: 1,
      },
    } as never;
    expect(decide(plan, target, low(target.date), completions)).toEqual({ kind: "none" });
  });

  it("the correction survives a refresh, is idempotent and is withdrawn when the check-in improves", () => {
    const plan = fixture();
    const target = find(plan, "strengthA");
    const readiness = low(target.date);
    const { day, session } = adjustOf(decide(plan, target, readiness));
    const mod: SessionModification = {
      id: "mod-1",
      date: target.date,
      type: "swap",
      reason: `${READINESS_ADJUSTMENT_REASON} test`,
      safetyStatus: "swapped_by_user",
      session: { ...day, dbId: "adjusted-id" },
      originalSession: plan.find((d) => d.date === target.date)!,
      createdAt: "2026-11-16T07:00:00Z",
    } as unknown as SessionModification;
    // A refresh reads the stored overlay back from JSON and resolves the effective plan.
    const stored = JSON.parse(JSON.stringify({ [target.date]: [mod] }));
    const effective = selectEffectivePlan(plan, stored, { completions: {} });
    const today = effective.find((d) => d.date === target.date)!;
    expect(workload(today)).toBe(workload(session));
    expect(today.readinessAdjustment?.changes).toEqual(session.readinessAdjustment?.changes);
    // The same check-in again: nothing more to do.
    expect(decide(effective, target, readiness, {}, stored[target.date])).toEqual({
      kind: "none",
    });
    // An edited, adequate check-in withdraws the overlay.
    expect(decide(effective, target, good(target.date), {}, stored[target.date])).toEqual({
      kind: "restore",
      modificationId: "mod-1",
    });
  });

  it("an older saved plan keeps its recipe until it is explicitly updated", () => {
    const plan = fixture().map((d) => ({ ...d, generatorVersion: "ballwise-v2.0" }));
    const target = find(plan, "strengthA");
    const decision = decide(plan, target, low(target.date));
    expect(decision.kind).toBe("unavailable");
  });
});
