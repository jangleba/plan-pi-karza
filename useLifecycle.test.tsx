// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMissedSessionSync } from "./useLifecycle";
import { initialState, type StoreActionContext } from "./model";
import type { LoadwiseState, SessionDay } from "../types";

const mock = vi.hoisted(() => ({ save: vi.fn(), clear: vi.fn(), plan: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.save } }));
vi.mock("./repository", () => ({ clearFutureOverlaysForUser: mock.clear }));
let root: ReturnType<typeof createRoot>;
const started = "2026-10-18T23:30:00.000Z";
const day = {
  dbId: "night",
  date: "2026-10-18",
  dayType: "individual",
  type: "strength_power",
  secondSession: null,
} as unknown as SessionDay;
const state = {
  ...initialState,
  profile: { onboardingComplete: true, healthPersonalizationEnabled: false },
  plan: [day],
  completions: {
    night: {
      completed: false,
      status: "started",
      rpe: null,
      notes: "",
      startedAt: started,
      executionSnapshot: day,
    },
  },
} as unknown as LoadwiseState;
let snapshot: LoadwiseState;
function Harness({ orphan = false }: { orphan?: boolean }) {
  const [current, setState] = useState(orphan ? { ...state, plan: [] } : state);
  snapshot = current;
  useMissedSessionSync({
    user: { id: "night-user" },
    state: current,
    setState,
    todayIso: "2026-10-19",
    hydrated: true,
    savePlanToDb: mock.plan,
    saveProfileRows: async () => "revision",
  } as StoreActionContext & { hydrated: boolean });
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T00:00:00.000Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.save
    .mockReset()
    .mockImplementation(async (_name, args) => ({
      error: null,
      data: { ...args.p_payload, session_id: args.p_session_id, write_version: 1 },
    }));
  mock.plan.mockReset().mockResolvedValue([day]);
  mock.clear.mockReset().mockResolvedValue(undefined);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("midnight workout grace", () => {
  it("keeps an active workout after midnight and expires it when four hours elapse without another navigation", async () => {
    await act(async () => root.render(<Harness />));
    expect(mock.save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3.5 * 60 * 60 * 1000 + 5);
    });
    expect(mock.save).toHaveBeenCalledTimes(1);
    expect(mock.save.mock.calls[0][1]).toMatchObject({
      p_session_id: "night",
      p_payload: { completion_status: "missed" },
    });
  });
  it("expires an orphan execution snapshot from the previous cycle", async () => {
    await act(async () => root.render(<Harness orphan />));
    expect(mock.save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3.5 * 60 * 60 * 1000 + 5);
    });
    expect(mock.save).toHaveBeenCalledTimes(1);
    expect(snapshot.completions.night.status).toBe("missed");
  });
  it("does not claim a missed workout or replan when another device already changed the result", async () => {
    const refresh = vi.fn();
    window.addEventListener("ballwise:server-state-changed", refresh);
    mock.save.mockResolvedValue({ error: { code: "40001" }, data: null });
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3.5 * 60 * 60 * 1000 + 5);
    });
    expect(snapshot.completions.night.status).toBe("started");
    expect(mock.plan).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    window.removeEventListener("ballwise:server-state-changed", refresh);
  });
});
