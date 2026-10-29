// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./durableTrainingStore", () => ({
  readDurableTrainingValue: vi.fn(async () => {
    throw new DOMException("IndexedDB blocked", "SecurityError");
  }),
  updateDurableTrainingValue: vi.fn(async () => {
    throw new DOMException("IndexedDB blocked", "SecurityError");
  }),
}));

import {
  enqueueDurableTrainingWrite,
  flushPendingTrainingWrites,
  readPendingTrainingWrites,
  resolveTrainingQueueConflict,
  trainingQueueStatus,
  withDurableTrainingWrite,
  type PendingTrainingWrite,
} from "./offlineTrainingQueue";

const write = (userId: string): PendingTrainingWrite => ({
  kind: "session_log",
  dedupeKey: "session:completed",
  payload: { user_id: userId, session_id: "completed", completed: true },
});

beforeEach(() => {
  localStorage.clear();
  // Some browsers expose IndexedDB but deny opening it. localStorage still works.
  vi.stubGlobal("indexedDB", {});
});
afterEach(() => vi.unstubAllGlobals());

describe("training journal when IndexedDB is denied", () => {
  it("acknowledges a foreground result in its localStorage fallback", async () => {
    const id = crypto.randomUUID();
    const result = await withDurableTrainingWrite(id, write(id), async () => ({
      error: null,
      data: { saved: true },
    }));
    expect(result.error).toBeNull();
    expect(readPendingTrainingWrites(id)).toEqual([]);
  });

  it("acknowledges a background sync without repeatedly sending the saved result", async () => {
    const id = crypto.randomUUID();
    expect(await enqueueDurableTrainingWrite(id, write(id))).toBe(true);
    const persist = vi.fn(async () => true);
    expect(await flushPendingTrainingWrites(id, persist)).toEqual({ synced: 1, remaining: 0 });
    await flushPendingTrainingWrites(id, persist);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("retains a server conflict and lets the user resolve its fallback copy", async () => {
    const id = crypto.randomUUID();
    await enqueueDurableTrainingWrite(id, write(id));
    expect(
      await flushPendingTrainingWrites(id, async () => {
        throw { code: "40001" };
      }),
    ).toEqual({ synced: 0, remaining: 1 });
    expect(trainingQueueStatus(id)).toMatchObject({ conflicts: 1, pending: 0 });
    const operation = readPendingTrainingWrites(id)[0].operationId!;
    expect(await resolveTrainingQueueConflict(id, operation, "local", 5)).toBe(true);
    expect(readPendingTrainingWrites(id)[0]).toMatchObject({
      expectedVersion: 5,
      status: "pending",
    });
    expect(readPendingTrainingWrites(id)[0].operationId).not.toBe(operation);
    expect(await resolveTrainingQueueConflict(id, operation, "server")).toBe(false);
  });
});
