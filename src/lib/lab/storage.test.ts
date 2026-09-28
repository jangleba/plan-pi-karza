// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resultFixture } from "./testFixtures";
import { newLabId } from "./id";
import { isVisibleLabResult } from "./engine";

const cloud = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => ({
        abortSignal: (signal: AbortSignal) => cloud.insert(row, signal),
      }),
      select: () => ({ eq: () => ({ order: () => ({ limit: () => cloud.select() }) }) }),
    }),
  },
}));
import {
  listLocalLabResults,
  loadLabResults,
  saveLabResult,
  syncPendingLabResults,
} from "./storage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  window.localStorage.clear();
  cloud.insert.mockReset().mockResolvedValue({ error: null });
  cloud.select.mockReset().mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("LAB persistence", () => {
  it("generates UUIDs accepted by Postgres on iOS without crypto.randomUUID", () => {
    const randomUUID = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    try {
      expect(newLabId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: randomUUID });
    }
  });

  it("stores auditable timestamps and speed fields in the existing JSON columns", async () => {
    const result = resultFixture("sprint_10m");
    const saved = await saveLabResult(result);
    expect(saved.cloudSaved).toBe(true);
    expect(cloud.insert.mock.calls[0][0]).toMatchObject({
      protocol_version: "ballwise-lab-2.0",
      metrics: { distanceMeters: 10, speedKmh: expect.closeTo(18, 10) },
      quality: { timing: { source: "sample_pts" } },
    });
    expect(listLocalLabResults(result.userId)[0].quality.timing).toEqual(result.quality.timing);
  });

  it("reads a Supabase timestamp with a UTC offset without recalculating the result", async () => {
    const result = resultFixture("sprint_10m");
    await saveLabResult(result);
    const inserted = cloud.insert.mock.calls[0][0];
    localStorage.clear();
    cloud.select.mockResolvedValueOnce({
      data: [{ ...inserted, recorded_at: result.recordedAt.replace("Z", "+00:00") }],
      error: null,
    });
    const rows = await loadLabResults(result.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].metrics).toEqual(result.metrics);
    expect(rows[0].quality).toEqual(result.quality);
    expect(rows[0].synced).toBe(true);
  });

  it("keeps an offline result and syncs it using the same ID", async () => {
    cloud.insert.mockRejectedValueOnce(new Error("offline"));
    const result = resultFixture();
    expect((await saveLabResult(result)).cloudSaved).toBe(false);
    expect(listLocalLabResults(result.userId)[0].synced).toBe(false);
    await syncPendingLabResults(result.userId);
    expect(listLocalLabResults(result.userId)).toHaveLength(1);
    expect(listLocalLabResults(result.userId)[0].synced).toBe(true);
    expect(cloud.insert.mock.calls.map(([row]) => row.id)).toEqual([result.id, result.id]);
  });

  it("does not overwrite a newer save when an earlier upload finishes", async () => {
    const earlier = deferred<{ error: null }>();
    cloud.insert.mockImplementationOnce(() => earlier.promise);
    const a = resultFixture();
    const b = resultFixture();
    const firstSave = saveLabResult(a);
    await saveLabResult(b);
    earlier.resolve({ error: null });
    await firstSave;
    expect(
      listLocalLabResults(a.userId)
        .map((row) => row.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
    expect(listLocalLabResults(a.userId).every((row) => row.synced)).toBe(true);
  });

  it("merges a late cloud load with results saved while it was pending", async () => {
    const response = deferred<{ data: []; error: null }>();
    cloud.select.mockImplementationOnce(() => response.promise);
    const result = resultFixture();
    const loading = loadLabResults(result.userId);
    await saveLabResult(result);
    response.resolve({ data: [], error: null });
    expect((await loading).map((row) => row.id)).toEqual([result.id]);
    expect(listLocalLabResults(result.userId)).toHaveLength(1);
  });

  it("deduplicates a concurrent save and pending sync", async () => {
    const response = deferred<{ error: null }>();
    cloud.insert.mockImplementationOnce(() => response.promise);
    const result = resultFixture();
    const saving = saveLabResult(result);
    const syncing = syncPendingLabResults(result.userId);
    response.resolve({ error: null });
    await Promise.all([saving, syncing]);
    expect(cloud.insert).toHaveBeenCalledTimes(1);
    expect(listLocalLabResults(result.userId)).toHaveLength(1);
    await saveLabResult(result);
    expect(cloud.insert).toHaveBeenCalledTimes(1);
  });

  it("treats an already inserted immutable result as synced", async () => {
    cloud.insert.mockResolvedValueOnce({ error: { code: "23505" } });
    expect((await saveLabResult(resultFixture())).cloudSaved).toBe(true);
  });

  it("fails before upload if durable local storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    await expect(saveLabResult(resultFixture())).rejects.toThrow("quota");
    expect(cloud.insert).not.toHaveBeenCalled();
  });

  it("preserves pending results beyond the synced-history limit and retains legacy records", async () => {
    const result = resultFixture();
    const legacy = resultFixture("sprint_10m", { testId: "sprint_10m_ball", synced: true });
    legacy.quality = { ...legacy.quality, protocolVersion: "ballwise-lab-1.0", timing: undefined };
    const queued = Array.from({ length: 305 }, (_, i) => ({ ...result, id: `pending-${i}` }));
    localStorage.setItem(
      `ballwise:lab:results:${result.userId}`,
      JSON.stringify([...queued, legacy]),
    );
    await saveLabResult(result);
    const rows = listLocalLabResults(result.userId);
    expect(rows).toHaveLength(307);
    expect(rows.find((row) => row.id === legacy.id)).toEqual(legacy);
    expect(rows.filter(isVisibleLabResult)).toHaveLength(306);
  });

  it("ignores malformed records and results owned by another user", () => {
    const result = resultFixture();
    localStorage.setItem(
      `ballwise:lab:results:${result.userId}`,
      JSON.stringify([null, {}, result, { ...result, userId: "other" }]),
    );
    expect(listLocalLabResults(result.userId)).toEqual([result]);
  });
});
