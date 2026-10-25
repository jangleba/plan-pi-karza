import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchModuleBackup, listModuleBackups } from "./client";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  single: vi.fn(),
  abort: vi.fn(),
  response: { data: null as unknown, error: null as unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
beforeEach(() => {
  const builder = {
    select: mocks.select,
    eq: mocks.eq,
    order: mocks.order,
    range: mocks.range,
    maybeSingle: mocks.single,
    abortSignal: mocks.abort,
    then: (resolve: (value: typeof mocks.response) => unknown) => resolve(mocks.response),
  };
  for (const fn of [mocks.from, mocks.select, mocks.eq, mocks.order, mocks.range, mocks.single])
    fn.mockReset().mockReturnValue(builder);
  mocks.response = { data: [], error: null };
  mocks.abort.mockReset().mockReturnValue(builder);
});
describe("bounded cloud snapshot reads", () => {
  it("lists metadata without downloading JSON payloads", async () => {
    await expect(listModuleBackups("a", "iq")).resolves.toEqual([]);
    expect(mocks.select).toHaveBeenCalledWith(
      "user_id,module,device_id,revision,operation_id,updated_at",
    );
    expect(mocks.eq.mock.calls).toEqual([
      ["user_id", "a"],
      ["module", "iq"],
    ]);
    expect(mocks.range).toHaveBeenCalledWith(0, 99);
  });
  it("fetches one owned payload only for an explicit action", async () => {
    const row = {
      user_id: "a",
      module: "iq",
      device_id: "device",
      revision: 1,
      payload: {},
      operation_id: "operation",
      updated_at: new Date().toISOString(),
    };
    mocks.response = { data: row, error: null };
    await expect(fetchModuleBackup("a", "iq", "device")).resolves.toEqual(row);
    expect(mocks.select).toHaveBeenCalledWith("*");
    expect(mocks.single).toHaveBeenCalledOnce();
    expect(mocks.eq.mock.calls).toEqual([
      ["user_id", "a"],
      ["module", "iq"],
      ["device_id", "device"],
    ]);
  });
});
