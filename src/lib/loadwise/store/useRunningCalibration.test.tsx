// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRunningCalibration } from "./useRunningCalibration";
import { initialState } from "./model";
import { generateTrainingPlan } from "../engineV2/planner";
import { resetPlanWriteGuard } from "./planWriteGuard";
import type { LoadwiseState, Profile, SessionDay } from "../types";
import type { GymRecord } from "../gymEvidence";
const m = vi.hoisted(() => ({ load: vi.fn(), persist: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("../engineV2/persistence", () => ({ loadV2Plan: m.load }));
vi.mock("../persist", () => ({ persistMonthlyPlan: m.persist }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
const athlete: Profile = {
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
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
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "none",
  strengthTrainingMonths: 0,
  movementCompetence: "medium",
  supervisionLevel: "none",
  fieldMasKmh: 16,
  fieldMasTestedAt: "2026-11-01",
  fieldMasSourceSessionId: "5f261acf-d1d6-4f50-9513-2fb027932041",
  runningProgressionLevel: 0,
};

let state: LoadwiseState, root: Root, host: HTMLDivElement;
let gym: { records: GymRecord[]; loading: boolean; available: boolean };
function Probe() {
  useRunningCalibration({
    ownerId: "owner",
    ready: true,
    state,
    getState: () => state,
    todayIso: "2026-11-02",
    gym,
    setState: (update) => {
      state = typeof update === "function" ? update(state) : update;
      root.render(<Probe />);
    },
  });
  return null;
}
beforeEach(() => {
  resetPlanWriteGuard();
  gym = { records: [], loading: false, available: true };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  m.load.mockReset();
  m.persist.mockReset();
  m.success.mockReset();
  m.error.mockReset();
  const before = {
    ...athlete,
    fieldMasKmh: null,
    fieldMasTestedAt: null,
    fieldMasSourceSessionId: null,
  };
  const plan = generateTrainingPlan(before, {
    startDate: "2026-11-02",
    weeks: 2,
    minutesPerSession: 45,
  }).plan;
  for (const [i, d] of plan.entries()) {
    d.dbId = `s${i}`;
    d.dayDbId = `d${i}`;
    d.planDbId = "plan1";
  }
  state = { ...initialState, profile: athlete, plan, activePlanId: "plan1" };
  m.load.mockResolvedValue({ id: "plan1", plan });
  m.persist.mockImplementation(async (_owner: string, _p: Profile, p: SessionDay[]) =>
    p.map((d) => ({ ...d, planDbId: "plan2" })),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("persists calibrated future units once after receiving confirmed server MAS", async () => {
  await act(async () => root.render(<Probe />));
  expect(m.persist).toHaveBeenCalledOnce();
  expect(state.activePlanId).toBe("plan2");
  expect(
    state.plan
      .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
      .some((s) => s.runningRecipe?.paceSource === "field_mas"),
  ).toBe(true);
  await act(async () => root.render(<Probe />));
  expect(m.persist).toHaveBeenCalledOnce();
});
it("does not overwrite a plan changed on another device", async () => {
  m.load.mockResolvedValue({ id: "different-plan", plan: [] });
  const prior = state.plan;
  await act(async () => root.render(<Probe />));
  expect(m.persist).not.toHaveBeenCalled();
  expect(state.plan).toBe(prior);
  expect(m.error).toHaveBeenCalledOnce();
});
it("waits for reconnection instead of deriving a server-confirmed result offline", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  await act(async () => root.render(<Probe />));
  expect(m.persist).not.toHaveBeenCalled();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(m.persist).toHaveBeenCalledOnce();
});

it("retries once against refreshed execution locks when another device starts a session", async () => {
  m.persist.mockRejectedValueOnce(new Error("Plan changed [code: 40001]"));
  let refreshed = false;
  const refresh = () => {
    if (refreshed) return;
    refreshed = true;
    const slot = state.plan.find((d) => d.engineV2)!;
    state = {
      ...state,
      completions: {
        [slot.dbId!]: {
          completed: false,
          status: "started",
          rpe: null,
          notes: "",
          writeVersion: 1,
          executionSnapshot: structuredClone(slot),
        },
      },
    };
    root.render(<Probe />);
  };
  window.addEventListener("ballwise:server-state-changed", refresh);
  try {
    await act(async () => root.render(<Probe />));
    expect(refreshed).toBe(true);
    expect(m.persist).toHaveBeenCalledTimes(2);
    expect(state.activePlanId).toBe("plan2");
  } finally {
    window.removeEventListener("ballwise:server-state-changed", refresh);
  }
});

it("waits for gym evidence instead of rebuilding without the gym decisions", async () => {
  gym = { records: [], loading: true, available: false };
  await act(async () => root.render(<Probe />));
  expect(m.persist).not.toHaveBeenCalled();
  gym = { records: [], loading: false, available: true };
  await act(async () => root.render(<Probe />));
  expect(m.persist).toHaveBeenCalledOnce();
});
it("defers while a gym record is still waiting for the server", async () => {
  gym = {
    records: [{ record_key: "x", pending: true, revision: 0, payload: {} } as unknown as GymRecord],
    loading: false,
    available: true,
  };
  await act(async () => root.render(<Probe />));
  expect(m.persist).not.toHaveBeenCalled();
});

it("does not persist a calibration built before the gym evidence changed during the server read", async () => {
  let release!: (value: { id: string; plan: SessionDay[] }) => void;
  m.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => root.render(<Probe />));
  expect(m.persist).not.toHaveBeenCalled();
  gym = {
    loading: false,
    available: true,
    records: [
      {
        record_key: "band_selection:gym_cmj_assisted",
        revision: 1,
        payload: {
          kind: "band_selection",
          version: 1,
          exerciseId: "gym_cmj_assisted",
          setupId: null,
        },
      } as GymRecord,
    ],
  };
  await act(async () => root.render(<Probe />));
  await act(async () => release({ id: "plan1", plan: state.plan }));
  expect(m.load).toHaveBeenCalledTimes(2);
  expect(m.persist).toHaveBeenCalledOnce();
});
