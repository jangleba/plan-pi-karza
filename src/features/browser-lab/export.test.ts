import { expect, it } from "vitest";
import { historyCSV } from "./export";
import { buildJumpTimeline } from "./measurement";
import { createBrowserResult } from "./results";
import { attemptPlan } from "./protocols";
it("exports valid measurements with quoted cells, BOM and escaped spreadsheet formula text", () => {
  const row = createBrowserResult({
    attempt: attemptPlan(["cmj"])[0],
    sessionId: "session-123456",
    timeline: buildJumpTimeline(
      Array.from({ length: 360 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
    ),
    start: 60,
    end: 164,
    sourceName: "=1+1.mov",
    sourceHash: "a".repeat(64),
    sourceBytes: 1000,
    codec: "avc1.640029",
    guidePositions: [0.5, 0.5],
    notes: '  =HYPERLINK("x")\nnotatka',
  });
  const csv = historyCSV([row]);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("\r\n");
  expect(csv).toContain('"\'=1+1.mov"');
  expect(csv).toContain('"\'=HYPERLINK(""x"")\nnotatka"');
  expect(() => historyCSV([{ ...row, primaryValue: 1000 }])).toThrow();
});
it("keeps reviewed event evidence in CSV rather than dropping it during export", () => {
  const row = createBrowserResult({
    attempt: attemptPlan(["cod_505"])[0],
    sessionId: "reviewed-export-64",
    timeline: buildJumpTimeline(
      Array.from({ length: 960 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
    ),
    start: 100,
    end: 800,
    turnFrameIndex: 450,
    sourceName: "original.mov",
    sourceHash: "f".repeat(64),
    sourceBytes: 1000,
    codec: "avc1.640029",
    guidePositions: [0.5, 0.5],
    notes: "",
    timingMethod: "assisted",
  });
  const csv = historyCSV([row]);
  expect(csv).toContain('"timingReview"');
  expect(csv).toContain('"turnPreviousSeconds"');
  expect(csv).toContain('""method"":""assisted""');
});
