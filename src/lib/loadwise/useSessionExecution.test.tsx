// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useSessionExecution } from "./useSessionExecution";
import { executionKey } from "./sessionExecution";
const m = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn(), owner: "owner-a" }));
vi.mock("./auth", () => ({ useAuth: () => ({ user: { id: m.owner } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: m.rpc,
    from: () => {
      const q = { select: () => q, eq: () => q, like: () => q, limit: () => m.read() };
      return q;
    },
  },
}));
vi.mock("./offlineTrainingQueue", () => ({
  readPendingTrainingWrites: () => [],
  recoverTrainingQueue: async () => {},
  isRetryableWriteError: (e: { message: string }) => e.message === "offline",
  withDurableTrainingWrite: async (_u: unknown, _w: unknown, request: (v: unknown) => unknown) =>
    request({ predecessors: [] }),
}));
const sid = "00000000-0000-4000-8000-000000000001",
  exercise = { id: "first", exerciseId: "goblet_squat", name: "Przysiad", sets: "3", reps: "8" };
let api: ReturnType<typeof useSessionExecution>, root: Root, host: HTMLDivElement;
function Screen({ reps = "8" }: { reps?: string }) {
  api = useSessionExecution([{ ...exercise, reps }], sid, "2026-11-07");
  return <output>{JSON.stringify(api.done)}</output>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  m.owner = "owner-a";
  m.read.mockReset().mockResolvedValue({ data: [], error: null });
  m.rpc.mockReset().mockResolvedValue({ data: { write_version: 1 }, error: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("restores owned cloud marks and saves edits against the observed version", async () => {
  m.read.mockResolvedValue({
    data: [
      {
        exercise_key: executionKey(exercise),
        metric_kind: "completion",
        metric_value: 1,
        write_version: 3,
      },
    ],
    error: null,
  });
  await act(async () => root.render(<Screen />));
  expect(api.done.first).toBe(true);
  await act(async () => {
    await api.markDone("first", false);
  });
  expect(m.rpc.mock.calls[0][1]).toMatchObject({
    p_expected_version: 3,
    p_payload: { user_id: "owner-a", session_id: sid, metric_kind: "completion", metric_value: 0 },
  });
  expect(api.done.first).toBe(false);
});
it("keeps an unacknowledged mark unchanged on permanent rejection and separates changed prescriptions", async () => {
  await act(async () => root.render(<Screen />));
  m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
  await act(async () => {
    expect(await api.markDone("first", true)).toBe(false);
  });
  expect(api.done.first).not.toBe(true);
  m.rpc.mockResolvedValue({ data: { write_version: 1 }, error: null });
  await act(async () => {
    await api.markDone("first", true);
  });
  expect(api.done.first).toBe(true);
  await act(async () => root.render(<Screen reps="5" />));
  expect(api.done.first).not.toBe(true);
});
it("never lets a late save from one owner mark a newly selected owner", async () => {
  await act(async () => root.render(<Screen />));
  let resolve!: (v: unknown) => void;
  m.rpc.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = api.markDone("first", true);
  });
  m.owner = "owner-b";
  await act(async () => root.render(<Screen />));
  await act(async () => {
    resolve({ data: { write_version: 1 }, error: null });
    await saving;
  });
  expect(api.done.first).not.toBe(true);
});
