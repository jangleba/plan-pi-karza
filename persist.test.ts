import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistMonthlyPlan } from "./persist";
import type { Profile, SessionDay } from "./types";

type SupabaseErrorLike = { message: string; details?: string; hint?: string; code?: string };

interface Operation {
  table: string;
  method: string;
  payload?: unknown;
  filters: Array<{ op: string; column: string; value: unknown }>;
}

const { operations, state } = vi.hoisted(() => ({
  operations: [] as Operation[],
  state: {
    forcedError: null as { table: string; method: string; error: SupabaseErrorLike } | null,
  },
}));

function nextResult(table: string, method: string) {
  if (
    state.forcedError &&
    state.forcedError.table === table &&
    state.forcedError.method === method
  ) {
    return { error: state.forcedError.error };
  }
  return { error: null };
}

function builder(table: string, method: string, payload?: unknown) {
  const operation: Operation = { table, method, payload, filters: [] };
  operations.push(operation);
  const chain = {
    eq(column: string, value: unknown) {
      operation.filters.push({ op: "eq", column, value });
      return chain;
    },
    neq(column: string, value: unknown) {
      operation.filters.push({ op: "neq", column, value });
      return chain;
    },
    then(
      resolve: (value: { error: SupabaseErrorLike | null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(nextResult(table, method)).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc(name: string, payload: unknown) {
      operations.push({ table: name, method: "rpc", payload, filters: [] });
      return Promise.resolve(nextResult(name, "rpc"));
    },
    from(table: string) {
      return {
        insert(payload: unknown) {
          operations.push({ table, method: "insert", payload, filters: [] });
          return Promise.resolve(nextResult(table, "insert"));
        },
        update(payload: unknown) {
          return builder(table, "update", payload);
        },
        delete() {
          return builder(table, "delete");
        },
      };
    },
  },
}));

function makeDay(date: string): SessionDay {
  return {
    date,
    dayName: "Poniedziałek",
    dayType: "rest",
    title: "Regeneracja",
    goalLabel: "",
    intensity: "niska",
    durationMin: 20,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Regeneracja",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
  } as SessionDay;
}

const profile = { goal: "speed" } as Profile;

describe("persistMonthlyPlan", () => {
  beforeEach(() => {
    operations.length = 0;
    state.forcedError = null;
  });

  it("persists the complete plan through one atomic RPC", async () => {
    await persistMonthlyPlan("user-1", profile, [makeDay("2026-08-20")]);

    expect(operations).toHaveLength(1);
    expect(operations[0]?.table).toBe("persist_training_plan_v2");
    expect(operations[0]?.payload).toMatchObject({
      p_goal: "speed",
      p_days: expect.any(Array),
      p_sessions: expect.any(Array),
      p_exercises: expect.any(Array),
    });
  });

  it("surfaces an atomic persistence failure without client-side cleanup", async () => {
    state.forcedError = {
      table: "persist_training_plan_v2",
      method: "rpc",
      error: { message: "transaction failed", code: "23503" },
    };

    await expect(persistMonthlyPlan("user-1", profile, [makeDay("2026-08-20")])).rejects.toThrow(
      "[persist_training_plan_v2] transaction failed | code: 23503",
    );

    expect(operations).toHaveLength(1);
  });

  it("returns a detached snapshot and preserves existing identifiers", async () => {
    const day = {
      ...makeDay("2026-10-18"),
      dbId: "old-session",
      dayDbId: "old-day",
      planDbId: "old-plan",
    };
    const saved = await persistMonthlyPlan("user-1", profile, [day]);
    expect(saved[0]).not.toBe(day);
    expect(saved[0]).toMatchObject({ dbId: "old-session", dayDbId: "old-day" });
    expect(day.planDbId).toBe("old-plan");
    expect(operations[0].payload).toMatchObject({ p_expected_plan_id: "old-plan" });
  });

  it("does not allocate identifiers in the caller's plan on failure", async () => {
    const day = makeDay("2026-10-18");
    state.forcedError = {
      table: "persist_training_plan_v2",
      method: "rpc",
      error: { message: "offline" },
    };
    await expect(persistMonthlyPlan("user-1", profile, [day])).rejects.toThrow();
    expect(day.dbId).toBeUndefined();
    expect(day.dayDbId).toBeUndefined();
    expect(day.planDbId).toBeUndefined();
  });

  it("rejects persistence when executable session misses athlete-visible instructions", async () => {
    const invalidDay = makeDay("2026-08-20");
    invalidDay.dayType = "training";
    invalidDay.sections.main = [
      {
        name: "Przysiad z masą własnego ciała",
        exerciseId: "bodyweight_squat",
        prescription: "3 × 8",
      },
    ];

    await expect(persistMonthlyPlan("user-1", profile, [invalidDay])).rejects.toThrow(
      "[PLAN_EXERCISE_CONTRACT]",
    );
    expect(operations).toHaveLength(0);
  });
});
