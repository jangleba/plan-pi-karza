import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, SessionDay } from "./types";

const backend = vi.hoisted(() => ({
  plans: [] as Array<Record<string, unknown>>,
  failSessionInsert: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      if (table === "training_plans") {
        return {
          insert: async (row: Record<string, unknown>) => {
            backend.plans.push(row);
            return { error: null };
          },
          update(values: Record<string, unknown>) {
            const query = {
              userId: null as string | null,
              status: null as string | null,
              excludedId: null as string | null,
              eq(column: string, value: string) {
                if (column === "user_id") query.userId = value;
                if (column === "status") query.status = value;
                return query;
              },
              neq(_column: string, value: string) {
                query.excludedId = value;
                return query;
              },
              then(resolve: (value: { error: null }) => unknown) {
                for (const plan of backend.plans) {
                  if (
                    plan.user_id === query.userId &&
                    plan.status === query.status &&
                    plan.id !== query.excludedId
                  ) {
                    Object.assign(plan, values);
                  }
                }
                return Promise.resolve(resolve({ error: null }));
              },
            };
            return query;
          },
          delete() {
            const query = {
              id: null as string | null,
              eq(column: string, value: string) {
                if (column === "id") query.id = value;
                return query;
              },
              then(resolve: (value: { error: null }) => unknown) {
                backend.plans = backend.plans.filter((plan) => plan.id !== query.id);
                return Promise.resolve(resolve({ error: null }));
              },
            };
            return query;
          },
        };
      }
      return {
        insert: async (rows: unknown) => ({
          error: table === "training_sessions" && backend.failSessionInsert
            ? { message: "simulated session insert failure" }
            : null,
          rows,
        }),
      };
    },
  },
}));

const profile: Profile = {
  name: "Authenticated player",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-08-20",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "pro",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
};

const plan = [
  {
    date: "2026-08-20",
    dayType: "individual",
    reason: "test",
    sessionType: "Siła",
    title: "Test session",
    goalOfSession: "strength",
    durationMin: 30,
    intensity: "moderate",
    sections: {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
  },
] as unknown as SessionDay[];

describe("authenticated onboarding plan persistence and reload hydration", () => {
  beforeEach(() => {
    backend.plans = [
      { id: "previous", user_id: "user-1", status: "active", active: true },
    ];
    backend.failSessionInsert = false;
  });

  it("keeps the last valid plan when replacement persistence fails", async () => {
    const { persistMonthlyPlan } = await import("./persist");

    await persistMonthlyPlan("user-1", profile, plan);
    const current = backend.plans.find((item) => item.status === "active");
    expect(current?.user_id).toBe("user-1");
    expect(backend.plans.find((item) => item.id === "previous")?.status).toBe("archived");

    backend.failSessionInsert = true;
    await expect(persistMonthlyPlan("user-1", profile, plan)).rejects.toThrow(
      "[training_sessions.insert] simulated session insert failure",
    );

    const hydratedAfterReload = backend.plans
      .filter((item) => item.user_id === "user-1" && item.status === "active")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    expect(hydratedAfterReload?.id).toBe(current?.id);
  });
});
