// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createProfileActions } from "./profileActions";
import { initialState, buildProfile } from "./model";
import type { ProfileSaveRefs, ProfileSaveStage } from "../profileSave";
import type { LoadwiseState } from "../types";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), consents: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock("../consent", () => ({
  recordConsentDecisions: mocks.consents,
  recordConsentDecision: mocks.consents,
}));
let state: LoadwiseState, stages: Array<ProfileSaveStage | null>;
const refs = { current: { attempt: null, flight: null, key: null } as ProfileSaveRefs };
const generate = vi.fn();
function actions() {
  return createProfileActions({
    user: { id: "owner" },
    state,
    getState: () => state,
    setState: (update) => {
      state = typeof update === "function" ? update(state) : update;
    },
    todayIso: "2026-11-04",
    savePlanToDb: generate,
    saveProfileRows: vi.fn(),
    generatingRef: { current: false },
    setPlanGenerating: vi.fn(),
    profileSaveRefs: refs,
    onProfileSaveStage: (s) => stages.push(s),
  } as Parameters<typeof createProfileActions>[0]);
}
const consents = { terms: true, privacy: true, health_data: false };
beforeEach(() => {
  vi.useFakeTimers();
  refs.current = { attempt: null, flight: null, key: null };
  stages = [];
  state = {
    ...initialState,
    profile: buildProfile(
      { full_name: "Test", onboarding_completed: false },
      { age: 22, position: "midfielder" },
      null,
    ),
  };
  mocks.consents.mockReset().mockResolvedValue("consent-version");
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: { athlete: { updated_at: "saved-version" } }, error: null });
  generate
    .mockReset()
    .mockResolvedValue([
      sessionFixture({
        date: "2026-11-04",
        dbId: undefined,
        sections: {
          warmup: [],
          main: [
            {
              name: "Bieg",
              exerciseId: "easy_aerobic_run",
              prescription: "10 min",
              technique: "Biegnij spokojnie",
            },
          ],
          accessory: [],
          footballTransfer: [],
          cooldown: [],
        },
      }),
    ]);
  mocks.from.mockReset().mockImplementation(() => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return chain;
  });
});
afterEach(() => vi.useRealTimers());
it("coalesces double submissions across rerenders into one generation and one atomic write", async () => {
  const first = actions().completeOnboarding(state.profile!, consents),
    second = actions().completeOnboarding({ ...state.profile! }, consents);
  expect(second).toBe(first);
  await first;
  expect(generate).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.consents).toHaveBeenCalledWith(
    expect.any(Array),
    null,
    expect.objectContaining({ notify: false }),
  );
  expect(state.profile?.onboardingComplete).toBe(true);
  expect(stages.at(-1)).toBeNull();
});
it("recovers a committed write after a lost response using owner-scoped plan identity", async () => {
  mocks.rpc.mockImplementation(() => new Promise(() => {}));
  const filters: Array<[string, unknown]> = [];
  mocks.from.mockImplementation((table:string) => {
    const chain = {
      select: () => chain,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return chain;
      },
      maybeSingle: async () => ({
        data:
          table === "training_plans"
            ? { id: refs.current.attempt?.prepared?.args.p_plan_id }
            : { updated_at: "verified-version" },
        error: null,
      }),
    };
    return chain;
  });
  const work = actions().completeOnboarding(state.profile!, consents);
  await vi.advanceTimersByTimeAsync(12001);
  await work;
  expect(state.profile?.serverProfileUpdatedAt).toBe("verified-version");
  expect(state.plan[0].dbId).toBeTruthy();
  expect(filters).toContainEqual(["user_id", "owner"]);
  expect(filters).toContainEqual(["active", true]);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("retains the prepared plan and acknowledged consents after timeout, then retries the same operation", async () => {
  const originalProfile = state.profile!;
  mocks.rpc.mockImplementationOnce(() => new Promise(() => {}));
  const work = actions().completeOnboarding(originalProfile, consents);
  const failed = expect(work).rejects.toThrow("Odpowiedzi pozostają");
  await vi.advanceTimersByTimeAsync(12001);
  await failed;
  expect(state.profile?.onboardingComplete).toBe(false);
  const savedPayload = mocks.rpc.mock.calls[0][1];
  expect(refs.current.attempt?.prepared).toBeTruthy();
  await actions().completeOnboarding({ ...originalProfile }, consents);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(mocks.consents).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[1][1]).toEqual(savedPayload);
  expect(state.profile?.onboardingComplete).toBe(true);
});
it("does not treat an empty or failed response as a completed onboarding", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(actions().completeOnboarding(state.profile!, consents)).rejects.toThrow(
    "potwierdzenia",
  );
  expect(state.profile?.onboardingComplete).toBe(false);
  expect(state.plan).toEqual([]);
});
it("rejects a different edit while an earlier command is still in flight", async () => {
  let finish!: (value: unknown) => void;
  mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  const p = actions().completeOnboarding(state.profile!, consents);
  await vi.advanceTimersByTimeAsync(0);
  await expect(
    actions().completeOnboarding({ ...state.profile!, goal: "speed" }, consents),
  ).rejects.toThrow("Trwa zapisywanie");
  finish({ data: { athlete: { updated_at: "ok" } }, error: null });
  await p;
});
