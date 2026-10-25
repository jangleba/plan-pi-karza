import { describe, expect, it } from "vitest";
import { ReactiveClock } from "./clock";
import { DEFAULT_REACTIVE_SETTINGS, initialReactiveStats } from "./engine";
import {
  loadReactiveSession,
  loadReactiveResults,
  saveReactiveSession,
  saveReactiveCustomSets,
  type ReactiveSavedSession,
} from "./storage";
const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
const session = (): ReactiveSavedSession => ({
  version: 1,
  id: "one",
  phase: "paused",
  settings: { ...DEFAULT_REACTIVE_SETTINGS },
  stats: { ...initialReactiveStats(DEFAULT_REACTIVE_SETTINGS), elapsedSec: 10 },
});
describe("reaction time is active time and results are recoverable", () => {
  it("does not count paused time or wall-clock jumps", () => {
    let now = 0;
    const clock = new ReactiveClock(() => now);
    clock.resume();
    now = 10_000;
    expect(clock.pause()).toBe(10);
    now = 130_000;
    expect(clock.seconds()).toBe(10);
    clock.resume();
    now += 5000;
    expect(clock.pause()).toBe(15);
  });
  it("restores an interrupted draft and stores final results idempotently", () => {
    const storage = memory();
    const row = session();
    expect(saveReactiveSession("u", row, storage)).toBe(true);
    expect(loadReactiveSession("u", storage)).toEqual(row);
    row.phase = "summary";
    row.stats.endedAt = new Date().toISOString();
    expect(saveReactiveSession("u", row, storage)).toBe(true);
    expect(saveReactiveSession("u", row, storage)).toBe(true);
    expect(loadReactiveResults("u", storage)).toEqual([row]);
  });
  it("never overwrites a corrupted draft or custom-set source", () => {
    const storage = memory();
    storage.values.set("u:session", "{broken");
    storage.values.set("u", "{broken");
    expect(saveReactiveSession("u", session(), storage)).toBe(false);
    expect(saveReactiveCustomSets("u", [], storage)).toBe(false);
    expect(storage.values.get("u:session")).toBe("{broken");
    expect(storage.values.get("u")).toBe("{broken");
  });
});
