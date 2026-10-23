import { describe, expect, it, vi } from "vitest";
import { createProfileActions } from "./profileActions";
import { decodeStrengthExperience } from "../strengthExperience";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("./repository", () => ({
  clearFutureOverlaysForUser: vi.fn(),
  shouldReusePersistedPlan: vi.fn(),
}));
function setup(data: unknown = { user_id: "real-user" }) {
  const single = vi.fn(async () => ({ data, error: null }));
  const select = vi.fn(() => ({ maybeSingle: single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn((_value: { training_experience: string | null }) => ({ eq }));
  mocks.from.mockReturnValue({ update });
  const original = {
    profile: { age: 14, strengthTrainingMonths: 24 },
    plan: [{ date: "2026-10-15" }],
    readiness: { today: {} },
    modifications: { today: {} },
    transitions: {},
    completions: { saved: {} },
    exerciseReplacements: { saved: [] },
  };
  let state = original;
  const rebuild = vi.fn();
  const setState = vi.fn((fn: (current: typeof original) => typeof original) => {
    state = fn(state);
  });
  const actions = createProfileActions({
    user: { id: "real-user" },
    state: original,
    setState,
    savePlanToDb: rebuild,
    generatingRef: { current: false },
    setPlanGenerating: vi.fn(),
  } as unknown as Parameters<typeof createProfileActions>[0]);
  return { actions, original, getState: () => state, rebuild, update, eq, setState };
}
describe("strength experience profile update", () => {
  it("saves only owned experience and preserves the plan, overlays and logs", async () => {
    const x = setup();
    await x.actions.saveStrengthExperience({
      gymExperienceLevel: "beginner",
      movementCompetence: "low",
      supervisionLevel: "full",
    });
    expect(x.eq).toHaveBeenCalledWith("user_id", "real-user");
    expect(Object.keys(x.update.mock.calls[0][0])).toEqual(["training_experience"]);
    expect(
      decodeStrengthExperience(x.update.mock.calls[0][0].training_experience)
        .strengthTrainingMonths,
    ).toBeUndefined();
    expect(x.getState().profile.strengthTrainingMonths).toBeUndefined();
    for (const key of [
      "plan",
      "readiness",
      "modifications",
      "completions",
      "exerciseReplacements",
    ] as const)
      expect(x.getState()[key]).toBe(x.original[key]);
    expect(x.rebuild).not.toHaveBeenCalled();
  });
  it("does not pretend a missing database row was saved", async () => {
    const x = setup(null);
    await expect(
      x.actions.saveStrengthExperience({ gymExperienceLevel: "none" }),
    ).rejects.toThrow();
    expect(x.setState).not.toHaveBeenCalled();
    expect(x.rebuild).not.toHaveBeenCalled();
  });
});
