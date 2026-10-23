// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import {
  enqueueDurableTrainingWrite,
  exportTrainingQueue,
  flushPendingTrainingWrites,
  purgeTrainingQueue,
  readPendingTrainingWrites,
  recoverTrainingQueue,
  trainingQueueStatus,
  withDurableTrainingWrite,
  redactTrainingQueueHealthData,
  resolveTrainingQueueConflict,
  type PendingTrainingWrite,
} from "./offlineTrainingQueue";

import { readDurableTrainingValue } from "./durableTrainingStore";

const write = (userId: string, key: string, completed = false): PendingTrainingWrite => ({
  kind: "session_log",
  dedupeKey: `session:${key}`,
  payload: { user_id: userId, session_id: key, completed },
});
const user = () => crypto.randomUUID();

describe("durable transaction journal", () => {
  it("migrates legacy writes once and keeps corrupt bytes recoverable", async () => {
    const id = user();
    localStorage.setItem(
      `loadwise:training-queue:v1:${id}`,
      JSON.stringify({ version: 1, items: [{ ...write(id, "a"), queuedAt: 1 }] }),
    );
    await recoverTrainingQueue(id);
    expect(readPendingTrainingWrites(id)).toHaveLength(1);
    expect(localStorage.getItem(`loadwise:training-queue:v1:${id}`)).toBeNull();
    await recoverTrainingQueue(id);
    expect(readPendingTrainingWrites(id)).toHaveLength(1);
    const corrupted = user();
    localStorage.setItem(`loadwise:training-queue:v1:${corrupted}`, "{unfinished");
    await recoverTrainingQueue(corrupted);
    expect(trainingQueueStatus(corrupted).recoveryRequired).toBe(true);
    expect((await exportTrainingQueue(corrupted)).recoveryRaw).toBe("{unfinished");
    expect(await enqueueDurableTrainingWrite(corrupted, write(corrupted, "b"))).toBe(true);
    expect((await exportTrainingQueue(corrupted)).recoveryRaw).toBe("{unfinished");
  });
  it("two concurrent transactions keep both results, and ACK cannot remove a later edit", async () => {
    const id = user();
    await Promise.all([
      enqueueDurableTrainingWrite(id, write(id, "a")),
      enqueueDurableTrainingWrite(id, write(id, "b")),
    ]);
    await recoverTrainingQueue(id);
    expect(readPendingTrainingWrites(id)).toHaveLength(2);
    const first = readPendingTrainingWrites(id).find((row) => row.dedupeKey === "session:a")!;
    await flushPendingTrainingWrites(id, async (row) => {
      if (row.dedupeKey === "session:a")
        await enqueueDurableTrainingWrite(id, write(id, "a", true));
      return true;
    });
    const remaining = readPendingTrainingWrites(id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payload).toMatchObject({ completed: true });
    expect(remaining[0].predecessors).toContain(first.operationId);
  });
  it("marks permanent rejection and conflict without retrying indefinitely", async () => {
    const id = user();
    await enqueueDurableTrainingWrite(id, write(id, "a"));
    await enqueueDurableTrainingWrite(id, write(id, "b"));
    await flushPendingTrainingWrites(id, async (row) => {
      throw { code: row.dedupeKey.endsWith("a") ? "40001" : "42501" };
    });
    expect(trainingQueueStatus(id)).toMatchObject({ pending: 0, failed: 1, conflicts: 1 });
    let attempts = 0;
    await flushPendingTrainingWrites(id, async () => {
      attempts++;
      return true;
    });
    expect(attempts).toBe(0);
    expect((await exportTrainingQueue(id)).items).toHaveLength(2);
  });
  it("rejects cross-account payloads and deleting an account cannot be undone by an in-flight ACK", async () => {
    const id = user(),
      other = user();
    expect(await enqueueDurableTrainingWrite(id, write(other, "foreign"))).toBe(false);
    await enqueueDurableTrainingWrite(id, write(id, "a"));
    await enqueueDurableTrainingWrite(other, write(other, "a"));
    await flushPendingTrainingWrites(id, async () => {
      await purgeTrainingQueue(id);
      return true;
    });
    await recoverTrainingQueue(id);
    expect(readPendingTrainingWrites(id)).toHaveLength(0);
    expect(readPendingTrainingWrites(other)).toHaveLength(1);
  });
  it("commits intent before issuing a foreground request and removes only its own acknowledged revision", async () => {
    const id = user();
    let release!: (value: { error: null }) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const request = withDurableTrainingWrite(id, write(id, "a"), () => {
      started();
      return new Promise<{ error: null }>((resolve) => {
        release = resolve;
      });
    });
    await entered;
    const durable = await readDurableTrainingValue<{ items: unknown[] }>(id);
    expect(durable?.items).toHaveLength(1);
    await enqueueDurableTrainingWrite(id, write(id, "a", true));
    release({ error: null });
    await request;
    expect(readPendingTrainingWrites(id)[0].payload).toMatchObject({ completed: true });
  });
  it("revocation removes queued health notes without deleting time and RPE", async () => {
    const id = user();
    await enqueueDurableTrainingWrite(id, {
      ...write(id, "a", true),
      kind: "session_log",
      payload: {
        user_id: id,
        session_id: "a",
        completed: true,
        notes: "ból kolana",
        duration_minutes: 31,
        rpe: 7,
      },
    });
    await redactTrainingQueueHealthData(id);
    expect(readPendingTrainingWrites(id)[0].payload).toMatchObject({
      notes: "",
      duration_minutes: 31,
      rpe: 7,
    });
  });
  it("resolves a reviewed conflict with server CAS, without touching an edit made after the review", async () => {
    const id = user();
    await enqueueDurableTrainingWrite(id, write(id, "a", true));
    await flushPendingTrainingWrites(id, async () => {
      throw { code: "40001" };
    });
    const oldOperation = readPendingTrainingWrites(id)[0].operationId!;
    expect(await resolveTrainingQueueConflict(id, oldOperation, "local", 7)).toBe(true);
    expect(readPendingTrainingWrites(id)[0]).toMatchObject({
      expectedVersion: 7,
      status: "pending",
      predecessors: [],
    });
    expect(readPendingTrainingWrites(id)[0].operationId).not.toBe(oldOperation);
    expect(await resolveTrainingQueueConflict(id, oldOperation, "server")).toBe(false);
    expect(readPendingTrainingWrites(id)).toHaveLength(1);
  });
  it("keeps an unconfirmed server response instead of acknowledging a zero-row success", async () => {
    const id = user();
    const result = await withDurableTrainingWrite(id, write(id, "a"), async () => ({
      error: null,
      data: null,
    }));
    expect(result).toMatchObject({ error: { code: "P0002" } });
    expect(trainingQueueStatus(id)).toMatchObject({ failed: 1 });
    expect(readPendingTrainingWrites(id)).toHaveLength(1);
  });
  it("journals an offline result without asking an expired server session to write it", async () => {
    const id = user();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const request = vi.fn(async () => ({ error: null }));
    try {
      const result = await withDurableTrainingWrite(id, write(id, "a"), request);
      expect(result).toMatchObject({ error: { message: "Network offline" } });
      expect(request).not.toHaveBeenCalled();
      expect(trainingQueueStatus(id)).toMatchObject({ pending: 1, failed: 0 });
    } finally {
      online.mockRestore();
    }
  });
});
