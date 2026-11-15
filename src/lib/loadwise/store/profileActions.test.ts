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
    profile: {
      age: 14,
      strengthTrainingMonths: 24,
      trainingMethodPreferences: {
        periodization: "undulating" as const,
        declaredEquipment: ["flywheel"],
      },
    },
    plan: [{ date: "2026-10-15" }],
    readiness: { today: {} },
    modifications: { today: {} },
    transitions: {},
    completions: { saved: {} },
    exerciseReplacements: { saved: [] },
  };
  let state = original;
  const setState = vi.fn((fn: (current: typeof original) => typeof original) => {
    state = fn(state);
  });
  const actions = createProfileActions({
    user: { id: "real-user" },
    state: original,
    setState,
  } as unknown as Parameters<typeof createProfileActions>[0]);
  return { actions, original, getState: () => state, update, eq, setState };
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
  });
  it("preserves method preferences when the existing experience form saves without them", async () => {
    const x = setup();
    await x.actions.saveStrengthExperience({
      gymExperienceLevel: "beginner",
      strengthTrainingMonths: 3,
      movementCompetence: "low",
      supervisionLevel: "full",
    });
    const saved = decodeStrengthExperience(x.update.mock.calls[0][0].training_experience);
    expect(saved.trainingMethodPreferences).toEqual(x.original.profile.trainingMethodPreferences);
    expect(x.getState().profile.trainingMethodPreferences).toEqual(saved.trainingMethodPreferences);
  });
  it("can deliberately clear optional method preferences in both database payload and state", async () => {
    const x = setup();
    await x.actions.saveStrengthExperience({
      gymExperienceLevel: "beginner",
      trainingMethodPreferences: {},
    });
    expect(
      decodeStrengthExperience(x.update.mock.calls[0][0].training_experience)
        .trainingMethodPreferences,
    ).toEqual({});
    expect(x.getState().profile.trainingMethodPreferences).toEqual({});
  });
  it("does not pretend a missing database row was saved", async () => {
    const x = setup(null);
    await expect(
      x.actions.saveStrengthExperience({ gymExperienceLevel: "none" }),
    ).rejects.toThrow();
    expect(x.setState).not.toHaveBeenCalled();
  });
});

describe("food safety profile update", () => {
  const input = {
    status: "has_allergies" as const,
    allergies: ["orzechy"],
    intolerances: ["laktoza"],
    exclusions: ["grzyby"],
  };
  function withConsent(health: boolean, saved: Record<string, unknown>) {
    const x = setup(saved);
    const actions = createProfileActions({
      user: { id: "real-user" },
      state: {
        ...x.original,
        profile: { ...x.original.profile, healthPersonalizationEnabled: health },
      },
      setState: x.setState,
    } as unknown as Parameters<typeof createProfileActions>[0]);
    return { ...x, actions };
  }
  it("refuses allergies without the health-data consent and writes nothing", async () => {
    const x = withConsent(false, {});
    await expect(x.actions.saveFoodSafety(input)).rejects.toThrow(/zgody na dane o zdrowiu/);
    expect(x.update).not.toHaveBeenCalled();
  });
  it("saves exclusions alone without the health consent", async () => {
    const x = withConsent(false, {
      updated_at: "t",
      fuel_allergy_status: "unconfirmed",
      food_allergies: [],
      food_intolerances: [],
      food_exclusions: ["grzyby"],
    });
    await x.actions.saveFoodSafety({
      ...input,
      status: "unconfirmed",
      allergies: [],
      intolerances: [],
    });
    expect(x.update.mock.calls[0][0]).toMatchObject({
      food_allergies: [],
      food_exclusions: ["grzyby"],
    });
  });
  it("saves three separate lists and shows what the server kept", async () => {
    const x = withConsent(true, {
      updated_at: "t",
      fuel_allergy_status: "has_allergies",
      food_allergies: ["orzechy"],
      food_intolerances: ["laktoza"],
      food_exclusions: ["grzyby"],
    });
    await x.actions.saveFoodSafety(input);
    expect(x.update.mock.calls[0][0]).toEqual({
      fuel_allergy_status: "has_allergies",
      food_allergies: ["orzechy"],
      food_intolerances: ["laktoza"],
      food_exclusions: ["grzyby"],
    });
    expect(x.getState().profile).toMatchObject({
      fuelAllergyStatus: "has_allergies",
      foodAllergies: ["orzechy"],
      foodIntolerances: ["laktoza"],
      foodExclusions: ["grzyby"],
    });
  });
  it("never reports a value the server dropped as saved", async () => {
    const x = withConsent(true, {
      updated_at: "t",
      fuel_allergy_status: "unconfirmed",
      food_allergies: [],
      food_intolerances: [],
      food_exclusions: [],
    });
    await expect(x.actions.saveFoodSafety(input)).rejects.toThrow(/Serwer nie przyjął/);
    expect(x.getState().profile).toMatchObject({
      fuelAllergyStatus: "unconfirmed",
      foodAllergies: [],
    });
  });
});
