import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { reconcilePlanIdentity } from "./planIdentity";
import { repairSegmentBoundaries } from "./segmentBoundary";
import { gymSpacingIssues } from "./strengthScheduling";
import { isMainGymSession } from "./sessionClassification";
import { isDedicatedSprintSession, weeklySprintIssues } from "./weeklySprintPolicy";
import type { Profile, SessionDay } from "./types";

const profile: Profile = {
  name: "Granica tygodni",
  age: 22,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["barbell", "dumbbells"],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-09-01",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "academy",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  healthPersonalizationEnabled: false,
};

const slots = (day: SessionDay) => [day, day.secondSession].filter(Boolean) as SessionDay[];

describe("granice tygodni i ochrona historii", () => {
  beforeAll(() => vi.spyOn(console, "debug").mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());
  const plan = generatePlan(profile, new Date("2026-11-09T00:00:00"), 14).map((day, index) => ({
    ...day,
    dbId: `s-${index}`,
    dayDbId: `d-${index}`,
  }));
  const gym = slots(plan.find((day) => slots(day).some(isMainGymSession))!).find(isMainGymSession)!;
  const sprint = plan.flatMap(slots).find((session) => isDedicatedSprintSession(session))!;

  it("siłownia w niedzielę i nowa siłownia w poniedziałek: zmienia się tylko nowy tydzień", () => {
    const sunday = {
      ...plan[6],
      ...gym,
      date: plan[6].date,
      secondSession: null,
      executionProtected: true,
    };
    const monday = { ...plan[7], ...gym, date: plan[7].date, secondSession: null };
    const joined = plan.map((day, index) => (index === 6 ? sunday : index === 7 ? monday : day));
    expect(gymSpacingIssues(joined).some((issue) => issue.date === plan[7].date)).toBe(true);

    const repaired = repairSegmentBoundaries(
      joined,
      joined.slice(7).map((day) => day.date),
    );
    expect(repaired[6]).toBe(sunday);
    expect(gymSpacingIssues(repaired).some((issue) => issue.date === plan[7].date)).toBe(false);
    expect(slots(repaired[7]).some(isMainGymSession)).toBe(false);
  });

  it("wykonany sprint w poniedziałku i nowy sprint w czwartek tego samego tygodnia", () => {
    const monday = {
      ...plan[0],
      ...sprint,
      date: plan[0].date,
      secondSession: null,
      executionProtected: true,
    };
    const thursday = { ...plan[3], ...sprint, date: plan[3].date, secondSession: null };
    const joined = plan.map((day, index) => (index === 0 ? monday : index === 3 ? thursday : day));
    expect(weeklySprintIssues(joined).length).toBeGreaterThan(0);
    const repaired = repairSegmentBoundaries(
      joined,
      joined.slice(1).map((day) => day.date),
    );
    expect(repaired[0]).toBe(monday);
    expect(weeklySprintIssues(repaired)).toEqual([]);
  });

  it("regeneracja nie dokleja nowej drugiej sesji do minionego dnia", () => {
    const previous = plan.map((day) => ({ ...day, secondSession: null }));
    const candidate = plan.map((day, index) =>
      index === 1 ? { ...day, secondSession: { ...gym, date: day.date, dbId: undefined } } : day,
    );
    const today = plan[3].date;
    const reconciled = reconcilePlanIdentity(candidate, previous, {}, today);
    expect(reconciled[1].secondSession).toBeNull();
    expect(reconciled[1].dbId).toBe(previous[1].dbId);
    expect(reconciled[1].executionProtected).toBe(true);
  });
});
