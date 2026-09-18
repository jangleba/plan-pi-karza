import { describe, expect, it } from "vitest";
import {
  enqueueTrainingWrite,
  flushPendingTrainingWrites,
  isRetryableWriteError,
  readPendingTrainingWrites,
} from "./offlineTrainingQueue";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const sessionWrite = (completed: boolean) => ({
  kind: "session_log" as const,
  dedupeKey: "session:s1",
  payload: {
    user_id: "u1",
    session_id: "s1",
    completed,
    completion_status: completed ? "completed" : "started",
  },
});

describe("offline training queue", () => {
  it("replaces an older write with the same idempotency key", () => {
    const storage = new MemoryStorage();
    expect(enqueueTrainingWrite("u1", sessionWrite(false), storage, 100)).toBe(true);
    expect(enqueueTrainingWrite("u1", sessionWrite(true), storage, 200)).toBe(true);
    const queued = readPendingTrainingWrites("u1", storage, 200);
    expect(queued).toHaveLength(1);
    expect(queued[0].kind).toBe("session_log");
    if (queued[0].kind === "session_log") expect(queued[0].payload.completed).toBe(true);
  });

  it("removes successful writes and retains failed writes", async () => {
    const storage = new MemoryStorage();
    enqueueTrainingWrite("u1", sessionWrite(true), storage);
    enqueueTrainingWrite("u1", {
      kind: "running_progression",
      dedupeKey: "progression",
      payload: { running_progression_level: 2, running_progression_updated_at: "2026-09-13" },
    }, storage);
    const result = await flushPendingTrainingWrites(
      "u1",
      async (write) => write.kind === "session_log",
      storage,
    );
    expect(result).toEqual({ synced: 1, remaining: 1 });
    expect(readPendingTrainingWrites("u1", storage)[0].kind).toBe("running_progression");
  });

  it("drops expired local writes", () => {
    const storage = new MemoryStorage();
    enqueueTrainingWrite("u1", sessionWrite(true), storage, 0);
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    expect(readPendingTrainingWrites("u1", storage, eightDays)).toEqual([]);
  });

  it("retries transient HTTP and network failures but not validation errors", () => {
    expect(isRetryableWriteError({ status: 503, message: "Service unavailable" })).toBe(true);
    expect(isRetryableWriteError({ status: 429, message: "Too many requests" })).toBe(true);
    expect(isRetryableWriteError({ message: "Network connection timed out" })).toBe(true);
    expect(isRetryableWriteError({ status: 400, message: "Invalid row" })).toBe(false);
  });
});
