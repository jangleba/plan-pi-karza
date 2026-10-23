// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { useExerciseSetLogs } from "./setLogs";

const mock = vi.hoisted(() => ({ upsertError: null as unknown, responses: [] as Promise<any>[] }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: mock.upsertError ? null : {write_version: 1}, error: mock.upsertError }),
    from: () => {
      let operation = "read";
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        order: () => q,
        limit: () => q,
        upsert: () => {
          operation = "upsert";
          return q;
        },
        update: () => {
          operation = "update";
          return q;
        },
        then: (yes: any, no: any) => {
          const result =
            operation === "read"
              ? (mock.responses.shift() ?? Promise.resolve({ data: [], error: null }))
              : Promise.resolve({
                  data: null,
                  error: operation === "upsert" ? mock.upsertError : null,
                  count: 0,
                });
          return result.then(yes, no);
        },
      };
      return q;
    },
  },
}));
let host: HTMLDivElement, root: Root, snapshot: ReturnType<typeof useExerciseSetLogs>;
function Harness({ sessionId }: { sessionId: string }) {
  snapshot = useExerciseSetLogs(sessionId, "squat");
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.upsertError = null;
  mock.responses = [];
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
test("REPRO: failed insert never reports a successful save without a row", async () => {
  await act(async () => root.render(<Harness sessionId="one" />));
  mock.upsertError = { message: "constraint failed", code: "23514" };
  let success = false;
  await act(async () => {
    success = await snapshot.saveSet({ setNumber: 1, weightKg: 100, reps: 5, rir: 2 });
  });
  expect(success).toBe(false);
  expect(snapshot.current[1]).toBeUndefined();
});
test("REPRO: stale reads never overwrite the newly opened session", async () => {
  let resolveFirst!: (x: any) => void;
  mock.responses.push(
    new Promise((resolve) => {
      resolveFirst = resolve;
    }),
  );
  await act(async () => root.render(<Harness sessionId="one" />));
  mock.responses.push(
    Promise.resolve({
      error: null,
      data: [
        {
          session_id: "two",
          set_number: 1,
          weight_kg: 50,
          reps: 8,
          rir: 2,
          performed_at: "2026-10-18T10:00:00Z",
        },
      ],
    }),
  );
  await act(async () => root.render(<Harness sessionId="two" />));
  expect(snapshot.current[1].weightKg).toBe(50);
  await act(async () =>
    resolveFirst({
      error: null,
      data: [
        {
          session_id: "one",
          set_number: 1,
          weight_kg: 100,
          reps: 5,
          rir: 2,
          performed_at: "2026-10-18T09:00:00Z",
        },
      ],
    }),
  );
  expect(snapshot.current[1].weightKg).toBe(50);
});
