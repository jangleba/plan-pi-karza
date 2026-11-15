// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { GymEvidenceProvider, useGymEvidence } from "./useGymEvidence";
import { gymRecordKey, type GymRecord, type GymEquipment } from "./gymEvidence";
import { readPendingTrainingWrites } from "./offlineTrainingQueue";
const m = vi.hoisted(() => ({
  rows: [] as GymRecord[],
  error: null as unknown,
  rpcError: null as unknown,
  invalidResult: false,
  rpc: vi.fn(),
  query: vi.fn(),
  gate: null as Promise<void> | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let user = "",
        kinds: string[] = [];
      const q = {
        select: () => q,
        eq: (_key: string, value: string) => {
          user = value;
          return q;
        },
        in: (_key: string, value: string[]) => {
          kinds = value;
          return q;
        },
        gte: () => q,
        order: () => q,
        limit: () => q,
        then: (resolve: (v: unknown) => unknown) => {
          m.query(user, kinds);
          return Promise.resolve({
            data: m.rows.filter((r) => r.user_id === user && kinds.includes(r.payload.kind)),
            error: m.error,
          }).then(resolve);
        },
      };
      return q;
    },
    rpc: async (
      name: string,
      args: {
        p_payload: { user_id: string; record_key: string; payload: GymEquipment };
        p_expected_version: number;
        p_operation_id: string;
      },
    ) => {
      if (m.gate) await m.gate;
      m.rpc(name, args);
      if (m.rpcError) return { data: null, error: m.rpcError };
      const row = {
        ...args.p_payload,
        revision: args.p_expected_version + 1,
        updated_at: new Date().toISOString(),
        last_operation_id: args.p_operation_id,
      };
      m.rows = [
        row,
        ...m.rows.filter((r) => r.record_key !== row.record_key || r.user_id !== row.user_id),
      ];
      return { data: m.invalidResult ? {} : row, error: null };
    },
  },
}));
const user = "10000000-0000-4000-8000-000000000001";
const gear: GymEquipment = {
  kind: "equipment",
  version: 1,
  id: crypto.randomUUID(),
  exerciseId: "goblet_squat",
  label: "Hantle",
  convention: "per_hand",
  incrementKg: 0.5,
};
let host: HTMLDivElement, root: Root, error: string | null;
let current: ReturnType<typeof useGymEvidence>;
function Read() {
  current = useGymEvidence();
  return (
    <output>
      {JSON.stringify({
        rows: current.records,
        available: current.available,
        error: current.error,
      })}
    </output>
  );
}
async function mount(owner = user) {
  await act(async () => {
    root.render(
      <GymEvidenceProvider ownerId={owner} ready>
        <Read />
      </GymEvidenceProvider>,
    );
    await new Promise((r) => setTimeout(r, 15));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  m.rows = [];
  m.error = null;
  m.rpcError = null;
  m.invalidResult = false;
  m.rpc.mockClear();
  m.query.mockClear();
  m.gate = null;
  error = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("fetches configuration separately from recent history and persists a confirmed equipment identity", async () => {
  await mount();
  expect(current.available).toBe(true);
  expect(m.query).toHaveBeenCalledTimes(2);
  await act(async () => {
    await current.save(gear);
  });
  expect(current.records[0]).toMatchObject({ payload: gear, revision: 1, pending: false });
  expect(m.rpc).toHaveBeenCalledWith(
    "save_gym_record",
    expect.objectContaining({
      p_expected_version: 0,
      p_payload: expect.objectContaining({ record_key: gymRecordKey(gear) }),
    }),
  );
  expect(readPendingTrainingWrites(user)).toHaveLength(0);
  await act(async () => {
    await current.save({ ...gear, incrementKg: 1 });
  });
  expect(m.rpc.mock.calls.at(-1)?.[1].p_expected_version).toBe(1);
});
it("recovers an offline equipment choice after remount without claiming server confirmation", async () => {
  await mount();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await act(async () => {
    await current.save(gear);
  });
  expect(readPendingTrainingWrites(user)).toEqual([
    expect.objectContaining({ kind: "gym_record" }),
  ]);
  expect(current.records[0].pending).toBe(true);
  await act(async () => root.unmount());
  root = createRoot(host);
  m.error = { message: "Network offline" };
  await mount();
  expect(current.available).toBe(true);
  expect(current.records).toContainEqual(expect.objectContaining({ payload: gear, pending: true }));
  expect(m.rpc).not.toHaveBeenCalled();
});
it("never exposes the previous owner's cached records after an account change", async () => {
  await mount();
  await act(async () => {
    await current.save(gear);
  });
  expect(host.textContent).toContain("Hantle");
  await mount("10000000-0000-4000-8000-000000000002");
  expect(host.textContent).not.toContain("Hantle");
  expect(current.records).toEqual([]);
});
it("preserves a journal entry when a malformed successful response does not prove the write", async () => {
  await mount();
  m.invalidResult = true;
  await act(async () => {
    try {
      await current.save(gear);
    } catch (e) {
      error = (e as Error).message;
    }
  });
  expect(error).toContain("Nie zapisano zmiany");
  expect(current.records).toEqual([]);
  expect(readPendingTrainingWrites(user)[0]).toMatchObject({
    kind: "gym_record",
    status: "failed",
  });
});
it("keeps unavailable schema non-blocking for the existing app and does not invent records", async () => {
  m.error = { code: "PGRST205", message: "Missing table" };
  await mount();
  expect(current.available).toBe(false);
  expect(current.records).toEqual([]);
  expect(current.error).toContain("ręcznie");
});
it("does not recreate deleted local data when a save completes late", async () => {
  await mount();
  let release!: () => void;
  m.gate = new Promise<void>((resolve) => (release = resolve));
  let flight!: Promise<unknown>;
  await act(async () => {
    flight = current.save(gear);
    await new Promise((r) => setTimeout(r, 10));
  });
  await act(async () => {
    localStorage.removeItem(`ballwise:gym-evidence:v1:${user}`);
    window.dispatchEvent(new CustomEvent("ballwise:clear-user-data", { detail: { userId: user } }));
  });
  await act(async () => {
    release();
    await flight;
  });
  expect(current.records).toEqual([]);
  expect(current.available).toBe(false);
  expect(localStorage.getItem(`ballwise:gym-evidence:v1:${user}`)).toBeNull();
});
