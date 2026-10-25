import { describe, expect, it } from "vitest";
import { clearRunCheckpoint, loadRunCheckpoint, saveRunCheckpoint } from "./runCheckpoint";
import { nativeRunDraft } from "./nativeRecorder";

function memory() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
    removeItem: (key: string) => {
      rows.delete(key);
    },
  };
}
describe("durable aggregate run checkpoint", () => {
  it("survives restart, scopes accounts and never persists route coordinates", () => {
    const storage = memory();
    saveRunCheckpoint(
      {
        schema: 1,
        ownerId: "a",
        sessionId: "s",
        date: "2026-10-18",
        startedAt: "2026-10-18T10:00:00Z",
        phase: "paused",
        durationSec: 100,
        distanceM: 400,
      },
      storage,
    );
    expect(loadRunCheckpoint("a", "s", storage)?.distanceM).toBe(400);
    expect(loadRunCheckpoint("b", "s", storage)).toBeNull();
    expect([...storage.rows.values()].join()).not.toContain('"lat"');
    clearRunCheckpoint("a", "s", storage);
    expect(loadRunCheckpoint("a", "s", storage)).toBeNull();
  });
  it("does not convert a corrupt checkpoint to an empty success", () => {
    const storage = memory();
    storage.rows.set("ballwise:run-draft:v1:a:s", "broken");
    expect(() => loadRunCheckpoint("a", "s", storage)).toThrow();
    expect(storage.getItem("ballwise:run-draft:v1:a:s")).toBe("broken");
  });
  it("turns native aggregates into a result without fabricating coordinates or splits", () => {
    const result = nativeRunDraft({
      present: true,
      sessionId: "s",
      date: "2026-10-18",
      startedAt: "2026-10-18T10:00:00Z",
      durationSec: 300,
      distanceM: 1000,
    });
    expect(result.avgPaceSecPerKm).toBe(300);
    expect(result.route).toEqual([]);
    expect(result.splits).toEqual([]);
    expect(() => nativeRunDraft({ present: true, durationSec: NaN })).toThrow();
  });
});
