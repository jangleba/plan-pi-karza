import { describe, expect, it } from "vitest";
import { generateTrainingPlan } from "./engineV2/planner";
import { gymAthlete } from "./engineV2/testFixtures";
import { sessionPrescription } from "./planIdentity";
import type { Profile, SessionDay, SessionModification } from "./types";
import {
  prepareTodayTimeChoice,
  todayTimeChoiceModification,
  todayTimeChoiceSession,
  TODAY_TIME_CHOICE_REASON,
} from "./todaySessionTimeChoice";

const profile: Profile = { ...gymAthlete, age: 21, goal: "strength" };
function fixture(p = profile, weeks = 1) {
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
function proposalFor(plan: SessionDay[], role: string, p = profile) {
  const target = plan
    .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
    .find((session) => session.engineV2?.roles.includes(role as "strengthA"))!;
  expect(target, `Missing ${role}`).toBeDefined();
  const attempts = [20, 30, 45, 60, 75, 90]
    .filter((minutes) => minutes < target.durationMin)
    .map((minutes) =>
      prepareTodayTimeChoice({
        profile: p,
        plan,
        completions: {},
        date: target.date,
        sessionId: target.dbId!,
        minutes,
      }),
    );
  const result = attempts.find((value) => "proposal" in value);
  expect(result, JSON.stringify({ role, duration: target.durationMin, attempts })).toBeDefined();
  if (!result || "error" in result) throw new Error("No valid preview");
  return { target, proposal: result.proposal };
}

describe("voluntary daily time choice", () => {
  it.each(["strengthA", "speed"])(
    "previews only today's %s while retaining full sessions elsewhere",
    (role) => {
      const plan = fixture();
      const before = structuredClone(plan);
      const { target, proposal } = proposalFor(plan, role);
      expect(plan).toEqual(before);
      expect(proposal.afterMinutes).toBeLessThan(proposal.beforeMinutes);
      expect(proposal.afterMinutes).toBeLessThanOrEqual(proposal.minutes);
      expect(proposal.session.engineV2?.sessionDurationMode).toBe("limited");
      expect(proposal.session.dbId).toBeUndefined();
      expect(proposal.day.dayDbId).toBe(plan.find((day) => day.date === target.date)!.dayDbId);
      expect(proposal.day.checkinBaseSession).toEqual(plan.find((day) => day.date === target.date));
      expect(proposal.day.checkinTimeBudgetMin).toBe(proposal.minutes);
      expect(proposal.day.planInputs).toEqual(
        plan.find((day) => day.date === target.date)!.planInputs,
      );
      for (const day of plan.filter((item) => item.date !== target.date))
        expect(day).toEqual(before.find((item) => item.date === day.date));
    },
  );

  it.each(["primary", "secondary"])(
    "preserves the sibling of an adjusted %s slot and its identity",
    (slot) => {
      const p: Profile = {
        ...profile,
        goal: "endurance",
        doubleSessionsAllowed: "yes_if_safe",
        clubTrainingDays: [3, 5],
        usualMatchDay: 7,
        weeklyMatches: true,
        strengthTrainingMonths: 48,
        equipment: [
          ...profile.equipment,
          "machine",
          "box",
          "platform",
          "med_ball",
          "gym_throw_zone",
          "kettlebell",
          "trap_bar",
          "nordic_setup",
          "swiss_ball",
          "sliders",
          "fixed_pins",
        ],
      };
      const plan = fixture(p, 4);
      const paired = plan.find((day) =>
        slot === "primary"
          ? day.engineV2?.roles.includes("strengthA") && day.secondSession
          : day.secondSession?.engineV2?.roles.includes("strengthB"),
      );
      if (!paired) throw new Error("Fixture must include a paired day");
      const target = slot === "primary" ? paired : paired.secondSession!;
      const results = [20, 30, 45, 60]
        .filter((minutes) => minutes < target.durationMin)
        .map((minutes) =>
          prepareTodayTimeChoice({
            profile: p,
            plan,
            completions: {},
            date: paired.date,
            sessionId: target.dbId!,
            minutes,
          }),
        );
      const result = results.find((value) => "proposal" in value);
      expect(result, JSON.stringify(results)).toBeDefined();
      if (!result || "error" in result) return;
      const originalSibling = slot === "primary" ? paired.secondSession! : paired;
      const nextSibling =
        slot === "primary" ? result.proposal.day.secondSession! : result.proposal.day;
      expect(nextSibling.dbId).toBe(originalSibling.dbId);
      expect(sessionPrescription(nextSibling)).toBe(sessionPrescription(originalSibling));
      expect(result.proposal.session.engineV2?.sessionDurationMode).toBe("limited");
      const completed = { ...plan[0], secondSession: null, executionProtected: true };
      const protectedSiblingDay =
        slot === "primary"
          ? { ...paired, secondSession: completed }
          : { ...paired, executionProtected: true };
      const protectedPlan = plan.map((day) =>
        day.date === paired.date ? protectedSiblingDay : day,
      );
      expect(
        prepareTodayTimeChoice({
          profile: p,
          plan: protectedPlan,
          completions: {},
          date: paired.date,
          sessionId: target.dbId!,
          minutes: 45,
        }),
      ).toHaveProperty("error");
    },
  );

  it.each(["started", "completed", "missed"] as const)("never replaces a %s session", (status) => {
    const plan = fixture();
    const target = plan.find((day) => day.engineV2?.roles.includes("strengthA"))!;
    const completions = { [target.dbId!]: { status, completed: status === "completed" } } as never;
    expect(
      prepareTodayTimeChoice({
        profile,
        plan,
        completions,
        date: target.date,
        sessionId: target.dbId!,
        minutes: 30,
      }),
    ).toHaveProperty("error");
    expect(todayTimeChoiceSession(target, completions)).toBeNull();
  });

  it("rejects a tiny budget rather than inventing an incomplete unit", () => {
    const plan = fixture();
    const target = plan.find((day) => day.engineV2?.roles.includes("strengthA"))!;
    expect(
      prepareTodayTimeChoice({
        profile,
        plan,
        completions: {},
        date: target.date,
        sessionId: target.dbId!,
        minutes: 10,
      }),
    ).toHaveProperty("error");
  });

  it("preserves the full run when a shorter limit cannot fit its complete minimum", () => {
    const plan = fixture();
    const before = structuredClone(plan);
    const target = plan.find((day) => day.engineV2?.roles.includes("endurance"))!;
    expect(target.durationMin).toBe(30);
    expect(
      prepareTodayTimeChoice({
        profile,
        plan,
        completions: {},
        date: target.date,
        sessionId: target.dbId!,
        minutes: 20,
      }),
    ).toHaveProperty("error");
    expect(plan).toEqual(before);
  });

  it("does not treat other manual changes as our reversible time choice", () => {
    const own = {
      id: "own",
      type: "swap",
      reason: `${TODAY_TIME_CHOICE_REASON} 30 min`,
    } as SessionModification;
    const other = { ...own, id: "other", reason: "Trening zastępczy" };
    expect(todayTimeChoiceModification([own])).toBe(own);
    expect(todayTimeChoiceModification([own, other])).toBeNull();
    expect(todayTimeChoiceModification([other])).toBeNull();
  });
});
