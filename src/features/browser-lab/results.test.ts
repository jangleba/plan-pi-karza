import { describe, expect, it } from "vitest";
import { buildJumpTimeline } from "./measurement";
import { attemptPlan, TEST_IDS } from "./protocols";
import {
  createBrowserResult,
  timedMeasurement,
  validatedResult,
  resultGroups,
  sideDifference,
  comparison,
} from "./results";
import {
  appendBrowserResult,
  replaceCorruptedHistory,
  createHistoryBackup,
  deleteBrowserResult,
  loadBrowserResults,
  restoreHistoryBackup,
  storeBrowserResults,
} from "./storage";

const timeline = buildJumpTimeline(
  Array.from({ length: 1000 }, (_, i) => ({
    cts: i,
    timescale: 240,
    duration: 1,
  })),
);
export function fixtureResult(
  overrides: Partial<ReturnType<typeof createBrowserResult>> = {},
) {
  return {
    ...createBrowserResult({
      attempt: attemptPlan(["cmj"])[0],
      sessionId: "session-1234",
      timeline,
      start: 60,
      end: 164,
      sourceName: "CMJ.mov",
      sourceHash: "a".repeat(64),
      sourceBytes: 10000,
      codec: "avc1.640029",
      guidePositions: [0.5, 0.5],
      notes: "",
    }),
    ...overrides,
  };
}
function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}

describe("five browser protocols", () => {
  it("saves 24 FPS and variable-FPS results with real event times and restores their brackets", () => {
    for (const variable of [false, true]) {
      let ticks = 0;
      const timeline = buildJumpTimeline(
        Array.from({ length: 60 }, (_, i) => {
          const duration = variable && i % 2 === 0 ? 1000 : 1250;
          const sample = { cts: ticks, timescale: 30000, duration };
          ticks += duration;
          return sample;
        }),
      );
      const result = createBrowserResult({
        attempt: attemptPlan(["cmj"])[0],
        sessionId: "session-1234",
        timeline,
        start: 8,
        end: 20,
        sourceName: "camera.mp4",
        sourceHash: "a".repeat(64),
        sourceBytes: 10000,
        codec: "avc1.640029",
        guidePositions: [0.5, 0.5],
        notes: "",
      });
      expect(result.elapsedSeconds).toBeCloseTo(variable ? 0.45 : 0.5, 10);
      expect(validatedResult(result)).toEqual(result);
      const store = memoryStore();
      restoreHistoryBackup("a", createHistoryBackup([result]), store);
      expect(loadBrowserResults("a", store)[0]).toEqual(result);
    }
  });
  it.each([30, 60])(
    "saves, restores and exports original %s FPS measurements",
    (fps) => {
      const result = createBrowserResult({
        attempt: attemptPlan(["cmj"])[0],
        sessionId: "session-1234",
        timeline: buildJumpTimeline(
          Array.from({ length: fps * 2 }, (_, i) => ({
            cts: i,
            timescale: fps,
            duration: 1,
          })),
        ),
        start: fps / 3,
        end: fps / 3 + fps * 0.4,
        sourceName: "CMJ.mp4",
        sourceHash: "a".repeat(64),
        sourceBytes: 100 * 1024 * 1024,
        codec: "avc1.640029",
        guidePositions: [0.5, 0.5],
        notes: "",
      });
      expect(result.primaryValue).toBeCloseTo(19.6133, 6);
      expect(result.fps).toBeCloseTo(fps, 8);
      const store = memoryStore();
      appendBrowserResult("a", result, store);
      expect(loadBrowserResults("a", store)[0]).toEqual(result);
      const backup = createHistoryBackup([result]);
      expect(restoreHistoryBackup("b", backup, store).added).toBe(1);
      expect(loadBrowserResults("b", store)[0]).toEqual(result);
    },
  );
  it("plans exactly 17 trials, alternating legs and respecting each test count", () => {
    const plan = attemptPlan(TEST_IDS);
    expect(plan).toHaveLength(17);
    expect(
      plan.filter((p) => p.testId === "single_leg_cmj").map((p) => p.side),
    ).toEqual(["left", "right", "left", "right", "left", "right"]);
    expect(
      plan.filter((p) => p.testId === "cod_505").map((p) => p.trial),
    ).toEqual([1, 1, 2, 2]);
  });
  it("uses PTS for all tests and publishes average speed only for flying 10m", () => {
    expect(timedMeasurement("cmj", timeline, 60, 164).primaryValue).toBeCloseTo(
      23.0183868056,
      8,
    );
    const sprint = timedMeasurement("sprint_10m", timeline, 60, 660);
    expect(sprint.primaryValue).toBe(2.5);
    expect(sprint).not.toHaveProperty("averageSpeedMps");
    expect(
      timedMeasurement("flying_10m", timeline, 60, 300).averageSpeedMps,
    ).toBe(10);
    expect(
      timedMeasurement("cod_505", timeline, 60, 660).resolutionMin,
    ).toBeCloseTo(2.5 - 1 / 240, 9);
    expect(() => timedMeasurement("cmj", timeline, 0, 164)).toThrow();
    expect(() => timedMeasurement("cmj", timeline, 60, 660)).toThrow();
  });
  it("rejects tampered results, wrong legs, units, trial numbers and missing confirmations", () => {
    const valid = fixtureResult();
    expect(validatedResult(valid)).toEqual(valid);
    for (const changed of [
      { primaryValue: 99 },
      { fps: 600 },
      { side: "left" },
      { trial: 4 },
      { primaryUnit: "s" },
      { averageSpeedMps: 10 },
      { protocolConfirmed: false },
      { startPreviousSeconds: 0.5 },
      { endFrameIndex: 10000 },
    ])
      expect(() => validatedResult({ ...valid, ...changed })).toThrow();
  });
  it("requires all distinct trials before calculating a left/right difference", () => {
    const rows = ["left", "right"].flatMap((side) =>
      [1, 2, 3].map((trial) =>
        fixtureResult({
          id: `${side}-${trial}-12345`,
          testId: "single_leg_cmj",
          side: side as "left" | "right",
          trial,
        }),
      ),
    );
    expect(
      sideDifference(rows.slice(0, 5), "session-1234", "single_leg_cmj"),
    ).toBeNull();
    expect(
      sideDifference(rows, "session-1234", "single_leg_cmj")?.percent,
    ).toBe(0);
    expect(resultGroups(rows)[0].complete).toBe(true);
    expect(resultGroups([rows[0], rows[0], rows[2]])[0].complete).toBe(false);
  });
  it("compares only the same protocol, test and leg and reports bracket overlap", () => {
    const a = fixtureResult({ recordedAt: "2026-10-01T10:00:00.000Z" });
    const b = fixtureResult({ recordedAt: "2026-10-02T10:00:00.000Z" });
    expect(comparison(b, a)).toMatchObject({
      older: a,
      newer: b,
      difference: 0,
      overlaps: true,
    });
    expect(() => comparison(a, { ...b, testId: "single_leg_cmj" })).toThrow();
    expect(() => comparison(a, { ...b, side: "left" })).toThrow();
  });
});

describe("account-scoped local history", () => {
  it("separates owners, blocks duplicate measurements and deletes only one result", () => {
    const store = memoryStore();
    const a = fixtureResult();
    appendBrowserResult("a", a, store);
    expect(loadBrowserResults("b", store)).toEqual([]);
    expect(() => appendBrowserResult("a", fixtureResult(), store)).toThrow(
      "już zapisana",
    );
    const b = fixtureResult({ sourceHash: "b".repeat(64) });
    appendBrowserResult("a", b, store);
    expect(deleteBrowserResult("a", a.id, store).map((r) => r.id)).toEqual([
      b.id,
    ]);
  });
  it("validates an entire backup before writing, merges without duplicates and refuses overflow", () => {
    const store = memoryStore();
    const a = fixtureResult();
    appendBrowserResult("a", a, store);
    const b = fixtureResult({ sourceHash: "b".repeat(64) });
    expect(
      restoreHistoryBackup("a", createHistoryBackup([a, b]), store).added,
    ).toBe(1);
    expect(
      restoreHistoryBackup("a", createHistoryBackup([a, b]), store).added,
    ).toBe(0);
    const before = [...store.data];
    expect(() =>
      restoreHistoryBackup(
        "a",
        {
          schema: "ballwise.browser-lab.backup.v1",
          results: [a, { ...b, primaryValue: 500 }],
        },
        store,
      ),
    ).toThrow();
    expect([...store.data]).toEqual(before);
    expect(() =>
      storeBrowserResults(
        "a",
        Array.from({ length: 301 }, (_, i) =>
          fixtureResult({ id: `result-${i}-12345` }),
        ),
        store,
      ),
    ).toThrow("300");
  });
  it("preserves corrupted data and reports quota failure without claiming a save", () => {
    const store = memoryStore();
    store.setItem("ballwise.browser-lab.v1:a", "broken");
    expect(() => loadBrowserResults("a", store)).toThrow("Nie nadpisano");
    expect(() => appendBrowserResult("a", fixtureResult(), store)).toThrow();
    expect(store.getItem("ballwise.browser-lab.v1:a")).toBe("broken");
    expect(() =>
      storeBrowserResults("a", [fixtureResult()], {
        ...store,
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).toThrow("nie zapisało");
  });
});

it("only recovers corrupted history from validated data and guards against a changed history", () => {
  const store = memoryStore();
  const key = "ballwise.browser-lab.v1:a";
  const backup = createHistoryBackup([fixtureResult()]);
  store.setItem(key, "broken");
  expect(() => replaceCorruptedHistory("a", backup, "stale", store)).toThrow(
    "zmieniła",
  );
  expect(() =>
    replaceCorruptedHistory(
      "a",
      { ...backup, results: [{ ...backup.results[0], primaryValue: 999 }] },
      "broken",
      store,
    ),
  ).toThrow();
  expect(store.getItem(key)).toBe("broken");
  expect(replaceCorruptedHistory("a", backup, "broken", store)).toHaveLength(1);
  expect(() =>
    replaceCorruptedHistory("a", backup, store.getItem(key)!, store),
  ).toThrow("poprawna");
});
