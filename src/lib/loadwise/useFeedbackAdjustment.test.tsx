// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useFeedbackAdjustment } from "@/lib/loadwise/useFeedbackAdjustment";
import { initialState } from "@/lib/loadwise/store/model";
import { gymAthlete } from "@/lib/loadwise/engineV2/testFixtures";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
const m = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  club: vi.fn(),
  gym: vi.fn(),
  run: vi.fn(),
  records: [] as unknown[],
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "feedback-audit" } }) }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => m.store }));
vi.mock("@/lib/loadwise/useGymEvidence", () => ({
  useGymEvidence: () => ({ records: m.records, loading: false, available: true }),
}));
vi.mock("@/lib/loadwise/engineV2/feedbackAdjustment", () => ({
  proposeFeedbackAdjustment: m.club,
  proposalToEngineResult: vi.fn(),
}));
vi.mock("@/lib/loadwise/engineV2/gymAdjustment", () => ({ proposeGymAdjustment: m.gym }));
vi.mock("@/lib/loadwise/engineV2/runningCalibration", () => ({
  proposeRunningCalibration: m.run,
}));
it("a dismissed club suggestion must not mask a new independent gym suggestion", async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  m.store = {
    state: { ...initialState, profile: gymAthlete, plan: [sessionFixture()], completions: {} },
    todayIso: "2026-11-15",
    hydrated: true,
    syncing: false,
  };
  m.club.mockImplementation((input) =>
    input.excludedProposalIds?.has("club-1") ? null : { id: "club-1", sourceKind: "club" },
  );
  m.gym.mockReturnValue({ id: "gym-1", sourceKind: "strength" });
  let result: ReturnType<typeof useFeedbackAdjustment>;
  function Probe() {
    result = useFeedbackAdjustment();
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    expect(result!.proposal?.id).toBe("club-1");
    await act(async () => result!.dismiss());
    m.gym.mockReturnValue({ id: "gym-new-evidence", sourceKind: "strength" });
    m.records = [{ record_key: "new-observation", revision: 2, payload: {} }];
    await act(async () => root.render(<Probe />));
    expect(result!.proposal?.id).toBe("gym-new-evidence");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("new paces after MAS arrive as a proposal (never written automatically), before a gym update", async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  m.records = [];
  m.store = {
    state: { ...initialState, profile: gymAthlete, plan: [sessionFixture()], completions: {} },
    todayIso: "2026-11-15",
    hydrated: true,
    syncing: false,
    activatePlanV2: vi.fn(),
  };
  m.club.mockReturnValue(null);
  m.gym.mockReturnValue({ id: "gym-1", sourceKind: "strength" });
  m.run.mockImplementation((input) =>
    input.hasUnconfirmedWrites ? null : { id: "run-1", sourceKind: "running" },
  );
  let result: ReturnType<typeof useFeedbackAdjustment>;
  function Probe() {
    result = useFeedbackAdjustment();
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    expect(result!.proposal?.id).toBe("run-1");
    // Nothing is activated by showing it.
    expect((m.store.activatePlanV2 as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    // "Zostaw plan" keeps the plan; the next independent proposal can still be shown.
    await act(async () => result!.dismiss());
    expect(result!.proposal?.id).toBe("gym-1");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
