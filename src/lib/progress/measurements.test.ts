import { expect, it } from "vitest";
import { createBrowserResult, type BrowserResult } from "@/features/browser-lab/results";
import { buildJumpTimeline } from "@/features/browser-lab/measurement";
import { attemptPlan } from "@/features/browser-lab/protocols";
import type { JourneyAttempt } from "@/features/football-iq-match/journeyTypes";
import { buildLabProgress, buildIQProgress } from "./measurements";
const today = "2026-11-02";
const timeline = buildJumpTimeline(
  Array.from({ length: 500 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
);
function series(id: string, date: string, end = 140, seed = 10): BrowserResult[] {
  return attemptPlan(["cmj"]).map((attempt, i) => ({
    ...createBrowserResult({
      attempt,
      sessionId: id,
      timeline,
      start: 40,
      end,
      sourceName: "original.mp4",
      sourceHash: (seed + i).toString(16).padStart(64, "0"),
      sourceBytes: 1000,
      codec: "avc1.640029",
      guidePositions: [0.5, 0.5],
      notes: "",
    }),
    recordedAt: `${date}T12:00:00.000Z`,
  }));
}
it("compares full independent Lab series, never individual trials within the same session", () => {
  const one = series("session-a", today);
  expect(buildLabProgress(one, today, 7)[0]).toMatchObject({
    complete: true,
    trials: 3,
    delta: null,
  });
  const prior = series("session-b", "2026-10-29", 139, 20);
  const report = buildLabProgress([...one, ...prior], today, 7);
  expect(report).toHaveLength(1);
  expect(report[0].delta).toBeGreaterThan(0);
  expect(report[0].overlaps).toBe(true);
});
it("does not call an incomplete or repeated-video series a new comparison", () => {
  const old = series("session-a", "2026-10-29");
  expect(
    buildLabProgress([...old, ...series("session-b", today).slice(0, 1)], today, 7)[0],
  ).toMatchObject({ complete: false, delta: null });
  expect(buildLabProgress([...old, ...series("session-b", today)], today, 7)[0].delta).toBeNull();
});
it("keeps versions separate and ignores future results", () => {
  const old = series("session-old", "2026-10-29").map((r) => ({
    ...r,
    version: "ballwise-browser-lab-1.1" as const,
  }));
  const now = series("session-now", today, 140, 30);
  const future = series("session-future", "2026-11-03", 150, 40);
  expect(buildLabProgress([...old, ...now, ...future], today, 7)[0]).toMatchObject({
    date: today,
    delta: null,
  });
  expect(buildLabProgress(series("session-old", "2026-10-15"), today, 7)).toEqual([]);
  expect(buildLabProgress(series("session-old", "2026-10-15"), today, 28)).toHaveLength(1);
});
it("reports completed IQ practice in separate modes without treating it as a match performance score", () => {
  const row = (id: string, date: string, mode: JourneyAttempt["mode"], scenarioId = "scenario-a") =>
    ({ id, createdAt: `${date}T12:00:00.000Z`, mode, scenarioId }) as JourneyAttempt;
  const a = row("a", today, "learn"),
    b = row("b", "2026-10-29", "challenge"),
    old = row("c", "2026-10-10", "learn", "scenario-b");
  const rows = [a, a, b, old, row("future", "2026-11-03", "challenge")];
  expect(buildIQProgress(rows, today, 7)).toEqual({
    total: 2,
    scenarios: 1,
    guided: 1,
    independent: 1,
  });
  expect(buildIQProgress(rows, today, 28)).toEqual({
    total: 3,
    scenarios: 2,
    guided: 2,
    independent: 1,
  });
});
it("retains low-rate sprint results but does not turn their difference into progress", () => {
  const t = buildJumpTimeline(
    Array.from({ length: 120 }, (_, cts) => ({ cts, timescale: 30, duration: 1 })),
  );
  const sprintSeries = (sessionId: string, date: string, end: number, seed: number) =>
    attemptPlan(["sprint_10m"]).map((attempt, i) => ({
      ...createBrowserResult({
        attempt,
        sessionId,
        timeline: t,
        start: 20,
        end,
        sourceName: "sprint.mp4",
        sourceHash: (seed + i).toString(16).padStart(64, "0"),
        sourceBytes: 1000,
        codec: "avc1.640029",
        guidePositions: [0.3, 0.7],
        notes: "",
      }),
      recordedAt: `${date}T12:00:00.000Z`,
    }));
  const rows = [
    ...sprintSeries("older-sprint-session", "2026-10-29", 95, 100),
    ...sprintSeries("newer-sprint-session", today, 90, 200),
  ];
  const report = buildLabProgress(rows, today, 7)[0];
  expect(report.complete).toBe(true);
  expect(report.previous).not.toBeNull();
  expect(report.delta).toBeNull();
  expect(report.timingQuality?.status).toBe("indicative");
});

it("keeps a low-rate CMJ series visible without declaring a performance trend", () => {
  const rows = [
    ...series("older-cmj", "2026-10-29", 139, 200),
    ...series("newer-cmj", today, 140, 300),
  ].map((row) => ({ ...row, fps: 60 }));
  const report = buildLabProgress(rows, today, 7)[0];
  expect(report.complete).toBe(true);
  expect(report.previous).not.toBeNull();
  expect(report.delta).toBeNull();
  expect(report.timingQuality?.status).toBe("indicative");
});
