import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "./types";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { enforceFinalPlanPolicy, FINAL_PLAN_POLICY_VERSION } from "./finalPlanPolicy";
import { validatePersistedPlan } from "./persistedPlanValidation";
import { assessDaySpeedLoad } from "./speedLoad";

const profile = (extra: Partial<Profile> = {}): Profile => ({
  name: "Test", age: 22, position: "midfielder", level: "intermediate", goal: "speed",
  secondaryLimiter: null, clubTrainingDays: [], individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [], usualMatchDay: null, matchDate: null, matchDates: [], equipment: [],
  painInjury: false, doubleSessionsAllowed: "yes_if_safe", guardianConsent: true,
  onboardingComplete: true, createdAt: "2026-11-01", seasonPhase: "preseason", seasonStage: null,
  competitionLevel: "iv_liga", weeklyMatches: false, hasGym: true, hasPitch: true,
  hasSprintSpace: true, ...extra,
});
function day(date: string, extra: Partial<SessionDay> = {}): SessionDay {
  return sessionFixture({ date, dbId: `session-${date}`, generatorVersion: "test", ...extra });
}
function sprint(date: string): SessionDay {
  return day(date, { title: "Prędkość maksymalna", sessionType: "Szybkość", intensity: "wysoka",
    goalOfSession: "Prędkość", sections: { warmup: [], main: [
      { name: "Sprint lotny", prescription: "3 × 20 m, pełne przerwy" },
    ], accessory: [], footballTransfer: [], cooldown: [] } });
}
function strength(date: string): SessionDay {
  return day(date, { title: "Siła bazowa", sessionType: "Siła", intensity: "umiarkowana",
    goalOfSession: "Siła", sections: { warmup: [], main: [
      { name: "Przysiad", prescription: "3 × 8" },
    ], accessory: [], footballTransfer: [], cooldown: [] } });
}

describe("constraints-first final calendar policy", () => {
  it("respects the explicit no-double setting without removing the club obligation", () => {
    const p = profile({ clubTrainingDays: [1], doubleSessionsAllowed: "no" });
    const original = day("2026-11-02", { dayType: "club", title: "Trening klubowy",
      secondSession: strength("2026-11-02") });
    const [result] = enforceFinalPlanPolicy([original], p);
    expect(result.dayType).toBe("club"); expect(result.secondSession).toBeNull();
    expect(original.secondSession).not.toBeNull();
    expect(result.weekMeta).toMatchObject({ planningStatus: "reduced", finalPolicyVersion: FINAL_PLAN_POLICY_VERSION });
    expect(validatePersistedPlan([result], p, "test").issues).toEqual([]);
  });
  it.each([{ age: 14, level: "beginner" as const }, { doubleSessionsAllowed: "light_only" as const }])(
    "does not merely relabel an excessive second-session prescription", extra => {
      const original = day("2026-11-02", { dayType: "club", secondSession: strength("2026-11-02") });
      const [result] = enforceFinalPlanPolicy([original], profile({ clubTrainingDays: [1], ...extra }));
      expect(result.secondSession).toBeNull();
    });
  it("checks true Sunday/Monday speed content and keeps the non-speed second prescription", () => {
    const sunday = sprint("2026-11-22");
    const monday = { ...sprint("2026-11-23"), secondSession: strength("2026-11-23") };
    const plan = enforceFinalPlanPolicy([sunday, monday], profile());
    expect(assessDaySpeedLoad(plan[0]).realExposureCount).toBe(1);
    expect(assessDaySpeedLoad(plan[1]).realExposureCount).toBe(0);
    expect(plan[1].title).toBe("Siła bazowa");
    expect(plan[1].dbId).toBe(monday.secondSession.dbId);
    expect(validatePersistedPlan(plan, profile(), "test").issues).toEqual([]);
  });
  it("will not prescribe a real sprint when no sprint space is available", () => {
    const p = profile({ hasSprintSpace: false });
    expect(validatePersistedPlan([sprint("2026-11-02")], p, "test").issues)
      .toContainEqual(expect.objectContaining({ code: "sprint-space-unavailable" }));
    const plan = enforceFinalPlanPolicy([sprint("2026-11-02")], p);
    expect(assessDaySpeedLoad(plan[0]).realExposureCount).toBe(0);
    expect(plan[0].sections.main).toEqual([]);
  });
  it("keeps the third gym after removing the middle day of an adjacent three-day chain", () => {
    const plan = enforceFinalPlanPolicy([
      strength("2026-11-02"), strength("2026-11-03"), strength("2026-11-04"),
    ], profile({ goal: "strength" }));
    expect(plan.map(value => value.title)).toEqual(["Siła bazowa", "Odpoczynek", "Siła bazowa"]);
  });
  it("retains the main-goal secondary prescription and relocates complementary work into a safe rest day", () => {
    const conditioning = day("2026-11-02", { dbId: "running-identity", title: "Bieg tlenowy", sessionType: "Wydolność",
      goalOfSession: "Wydolność", sections: { warmup: [], main: [{ name: "Bieg ciągły", prescription: "20 min" }], accessory: [], footballTransfer: [], cooldown: [] } });
    const p = profile({ goal: "endurance", doubleSessionsAllowed: "no" });
    const plan = enforceFinalPlanPolicy([
      { ...strength("2026-11-02"), dbId: "strength-identity", secondSession: conditioning },
      day("2026-11-03", { dayType: "rest", title: "Odpoczynek", durationMin: 0 }),
    ], p);
    expect(plan[0].dbId).toBe("running-identity");
    expect(plan[0].title).toBe("Bieg tlenowy");
    expect(plan[1].title).toBe("Siła bazowa");
    expect(plan[1].dbId).toBe("strength-identity");
    expect(plan.every(value => !value.secondSession)).toBe(true);
  });
  it("keeps a deliberately reduced feasible week on re-opening but rejects forbidden new work", () => {
    const p = profile({ individualTrainingDays: [1, 3, 5], unavailableDays: [2, 4, 6, 7], doubleSessionsAllowed: "no" });
    const input = Array.from({ length: 7 }, (_, index) => day(`2026-11-0${index + 2}`, {
      dayType: "rest", durationMin: 0, title: "Odpoczynek", sessionType: "Odpoczynek",
      goalOfSession: "Odpoczynek", secondSession: null,
    }));
    input[0] = { ...sprint(input[0].date), secondSession: strength(input[0].date) };
    const plan = enforceFinalPlanPolicy(input, p);
    expect(plan[0].weekMeta?.planningStatus).toBe("reduced");
    expect(plan[0].weekMeta?.planningNotes?.join(" ")).toContain("Nie zmieszczono");
    expect(validatePersistedPlan(plan, p, "test").valid).toBe(true);
    const forbidden = [...plan]; forbidden[0] = { ...plan[0], secondSession: strength(plan[0].date) };
    expect(validatePersistedPlan(forbidden, p, "test").issues)
      .toContainEqual(expect.objectContaining({ code: "double-sessions-disabled" }));
    const unmarked = plan.map(value => ({ ...value, weekMeta: undefined }));
    expect(validatePersistedPlan(unmarked, p, "test").issues)
      .toContainEqual(expect.objectContaining({ code: "missing-weekly-minimum" }));
  });
  it("does not rewrite or drop an already protected execution slot", () => {
    const protectedSecond = { ...strength("2026-11-02"), executionProtected: true, dbId: "in-flight" };
    const [result] = enforceFinalPlanPolicy([
      { ...sprint("2026-11-02"), secondSession: protectedSecond },
    ], profile({ doubleSessionsAllowed: "no" }));
    expect(result.secondSession).toBe(protectedSecond);
    expect(result.dayType).toBe("rest");
  });
  it("treats return/fatigue as a conservative context and health limitation as an honest status", () => {
    const [returnDay] = enforceFinalPlanPolicy([sprint("2026-11-02")], profile({ secondaryLimiter: "return" }));
    expect(returnDay.dayType).toBe("rest");
    expect(returnDay.weekMeta?.planningStatus).toBe("reduced");
    const [healthDay] = enforceFinalPlanPolicy([day("2026-11-02", { dayType: "recovery", durationMin: 0 })], profile({ painInjury: true }));
    expect(healthDay.weekMeta?.planningStatus).toBe("health_limited");
    expect(healthDay.weekMeta?.validationStatus).toBe("valid");
  });
});
