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

  it("activates new plan before archiving previous active plan", async () => {
    await persistMonthlyPlan("user-1", profile, [makeDay("2026-08-20")]);

    const trainingPlanInserts = operations.filter(
      (op) => op.table === "training_plans" && op.method === "insert",
    );
    expect(trainingPlanInserts).toHaveLength(1);
    expect(trainingPlanInserts[0]?.payload).toMatchObject({ status: "archived" });

    const activateIndex = operations.findIndex(
      (op) =>
        op.table === "training_plans" &&
        op.method === "update" &&
        op.filters.some((f) => f.op === "eq" && f.column === "id"),
    );
    const archivePreviousIndex = operations.findIndex(
      (op) =>
        op.table === "training_plans" &&
        op.method === "update" &&
        op.filters.some((f) => f.op === "neq" && f.column === "id"),
    );
    expect(activateIndex).toBeGreaterThan(-1);
    expect(archivePreviousIndex).toBeGreaterThan(-1);
    expect(activateIndex).toBeLessThan(archivePreviousIndex);
  });

  it("keeps previous active plan untouched when new persistence fails", async () => {
    state.forcedError = {
      table: "training_sessions",
      method: "insert",
      error: { message: "insert failed", code: "23503" },
    };

    await expect(persistMonthlyPlan("user-1", profile, [makeDay("2026-08-20")])).rejects.toThrow(
      "[training_sessions.insert] insert failed | code: 23503",
    );

    const archivePrevious = operations.find(
      (op) =>
        op.table === "training_plans" &&
        op.method === "update" &&
        op.filters.some((f) => f.op === "neq" && f.column === "id"),
    );
    expect(archivePrevious).toBeUndefined();
    expect(
      operations.some((op) => op.table === "training_plans" && op.method === "delete"),
    ).toBe(true);
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
