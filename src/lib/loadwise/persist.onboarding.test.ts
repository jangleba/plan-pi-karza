import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "./types";

const calls: string[] = [];
let failPlans = false;

function query(table: string) {
  const builder = {
    eq: () => builder,
    neq: () => builder,
    insert: async () => {
      calls.push(`${table}.insert`);
      return {
        error:
          failPlans && table === "training_plans"
            ? { code: "23514", message: "exercise constraint" }
            : null,
      };
    },
    update: () => {
      calls.push(`${table}.update`);
      return {
        ...builder,
        then: (resolve: (value: { error: null }) => unknown) =>
          Promise.resolve(resolve({ error: null })),
      };
    },
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => query(table) },
}));

const profile = {
  name: "Test player",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: "2026-08-22",
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-01-01",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "pro",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
} satisfies Profile;

describe("authenticated onboarding plan persistence", () => {
  beforeEach(() => {
    calls.length = 0;
    failPlans = false;
  });

  it("keeps the previous active plan until replacement persistence succeeds", async () => {
    const { persistMonthlyPlan } = await import("./persist");

    await persistMonthlyPlan("user-1", profile, []);
    expect(calls).toEqual(["training_plans.insert", "training_plans.update"]);

    calls.length = 0;
    failPlans = true;
    await expect(persistMonthlyPlan("user-1", profile, [])).rejects.toThrow("23514");
    expect(calls).not.toContain("training_plans.update");
  });
});
