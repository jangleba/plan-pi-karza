// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createProfileActions } from "./profileActions";
import { initialState, buildProfile } from "./model";
import type { ProfileSaveRefs, ProfileSaveStage } from "../profileSave";
import type { LoadwiseState } from "../types";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), consents: vi.fn(), savedAt: null as string | null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: mocks.savedAt ? { updated_at: mocks.savedAt } : null,
          error: null,
        }),
      };
      return chain;
    },
  },
}));
vi.mock("../consent", () => ({
  recordConsentDecisions: mocks.consents,
  recordConsentDecision: mocks.consents,
}));
let state: LoadwiseState, stages: Array<ProfileSaveStage | null>;
const refs = { current: { attempt: null, flight: null, key: null } as ProfileSaveRefs };
function actions() {
  return createProfileActions({
    user: { id: "owner" },
    state,
    getState: () => state,
    setState: (update) => {
      state = typeof update === "function" ? update(state) : update;
    },
    todayIso: "2026-11-04",
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
  mocks.savedAt = null;
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: { athlete: { updated_at: "saved-version" } }, error: null });
});
afterEach(() => vi.useRealTimers());
it("coalesces double submissions across rerenders into one atomic profile write without a plan", async () => {
  const first = actions().completeOnboarding(state.profile!, consents),
    second = actions().completeOnboarding({ ...state.profile! }, consents);
  expect(second).toBe(first);
  await first;
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_plan: null, p_clear_transitions: false });
  expect(mocks.consents).toHaveBeenCalledWith(
    expect.any(Array),
    null,
    expect.objectContaining({ notify: false }),
  );
  expect(state.profile?.onboardingComplete).toBe(true);
  expect(state.profile?.serverProfileUpdatedAt).toBe("saved-version");
  expect(state.plan).toEqual([]);
  expect(stages).toEqual(["consents", "saving", null]);
});
it("keeps acknowledged consents after a timeout and retries the same profile write", async () => {
  const originalProfile = state.profile!;
  mocks.rpc.mockImplementationOnce(() => new Promise(() => {}));
  const first = actions().completeOnboarding(originalProfile, consents);
  const failed = expect(first).rejects.toThrow("Odpowiedzi pozostają w formularzu");
  await vi.advanceTimersByTimeAsync(12001);
  await failed;
  expect(state.profile?.onboardingComplete).toBe(false);
  const savedPayload = mocks.rpc.mock.calls[0][1];
  await actions().completeOnboarding({ ...originalProfile }, consents);
  expect(mocks.consents).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[1][1]).toEqual(savedPayload);
  expect(state.profile?.onboardingComplete).toBe(true);
});
it("does not treat an empty or failed response as a completed onboarding", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(actions().completeOnboarding(state.profile!, consents)).rejects.toThrow(
    "Serwer nie zwrócił potwierdzenia zapisu.",
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
it("recovers a committed write after a lost response without sending it again", async () => {
  mocks.rpc.mockImplementationOnce(async () => {
    mocks.savedAt = "landed-version";
    return { data: null, error: { message: "upstream request timeout" } };
  });
  await actions().completeOnboarding(state.profile!, consents);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(state.profile?.onboardingComplete).toBe(true);
  expect(state.profile?.serverProfileUpdatedAt).toBe("landed-version");
});
