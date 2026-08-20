import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, SessionDay } from "./types";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

import { persistMonthlyPlan } from "./persist";

function query(result: { error: { message: string } | null }) {
  const builder: Record<string, unknown> = {
    insert: vi.fn(async () => result),
    delete: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)),
  };
  return builder;
}

const profile = {
  name: "Test",
  age: 20,
  position: "midfielder",
  level: "intermediate",
  goal: "speed",
} as Profile;

const plan = [
  {
    date: "2026-08-20",
    dayName: "Czwartek",
    dayType: "training",
    title: "Trening",
    goalLabel: "Szybkość",
    intensity: "umiarkowana",
    durationMin: 30,
    reason: "test",
    safetyNote: null,
    whyToday: "test",
    sessionType: "Szybkość",
    goalOfSession: "Szybkość",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
  },
] as unknown as SessionDay[];

describe("persistMonthlyPlan", () => {
  beforeEach(() => from.mockReset());

  it("reports the real database error and leaves the active plan untouched", async () => {
    const insertError = { error: { message: "permission denied for table training_plans" } };
    from.mockImplementation((table: string) =>
      table === "training_plans" ? query(insertError) : query({ error: null }),
    );

    await expect(persistMonthlyPlan("user-1", profile, plan)).rejects.toThrow(
      "training_plans.insert: permission denied for table training_plans",
    );
    const trainingPlans = from.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>;
    expect(trainingPlans.update).not.toHaveBeenCalled();
  });

  it("archives the old plan only after the replacement and children succeed", async () => {
    const plans = query({ error: null });
    from.mockImplementation(() => plans);

    await persistMonthlyPlan("user-1", profile, plan);

    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "training_plans",
      "training_days",
      "training_sessions",
      "training_plans",
    ]);
    expect(plans.update).toHaveBeenCalledOnce();
    expect(plans.delete).not.toHaveBeenCalled();
  });
});
