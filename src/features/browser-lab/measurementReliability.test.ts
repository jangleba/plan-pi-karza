import { describe, expect, it } from "vitest";
import { buildJumpTimeline, GRAVITY } from "./measurement";
import { createBrowserResult, timedMeasurement, validatedResult } from "./results";
import { attemptPlan } from "./protocols";

describe("measurement bounds across recording rates", () => {
  it.each([15, 24, 30, 60, 120, 240, 300])(
    "preserves real event-time brackets at %s FPS, including variable spacing",
    (fps) => {
      for (const variable of [false, true]) {
        const base = Math.ceil(1_000_000 / fps);
        let ticks = 0;
        const samples = Array.from({ length: fps * 4 }, (_, i) => {
          const duration = base + (variable ? (i % 2 ? 1 : -1) * Math.floor(base * 0.18) : 0);
          const sample = { cts: ticks, timescale: 1_000_000, duration };
          ticks += duration;
          return sample;
        });
        const timeline = buildJumpTimeline(samples);
        const start = Math.max(2, Math.floor(fps * 0.3));
        const end = start + Math.round(fps * 0.45);
        const jump = timedMeasurement("cmj", timeline, start, end);
        for (const takeoffFraction of [0.01, 0.5, 0.99])
          for (const landingFraction of [0.01, 0.5, 0.99]) {
            const first = timeline.frames[start - 1].seconds;
            const last = timeline.frames[end - 1].seconds;
            const actualTakeoff =
              first + takeoffFraction * (timeline.frames[start].seconds - first);
            const actualLanding = last + landingFraction * (timeline.frames[end].seconds - last);
            const knownHeight = (GRAVITY * (actualLanding - actualTakeoff) ** 2 * 100) / 8;
            expect(knownHeight).toBeGreaterThanOrEqual(jump.resolutionMin - 1e-8);
            expect(knownHeight).toBeLessThanOrEqual(jump.resolutionMax + 1e-8);
          }
        for (const testId of ["sprint_10m", "cod_505"] as const) {
          const finish = start + Math.round(fps * 2.5);
          const middle = start + Math.round(fps);
          const result = createBrowserResult({
            attempt: attemptPlan([testId])[0],
            sessionId: "controlled-frame-session",
            timeline,
            start,
            end: finish,
            ...(testId === "cod_505" ? { turnFrameIndex: middle } : {}),
            sourceName: "controlled.mp4",
            sourceHash: "f".repeat(64),
            sourceBytes: 1000,
            codec: "avc1.640029",
            guidePositions: [0.3, 0.7],
            notes: "",
          });
          expect(result.primaryValue).toBe(
            timeline.frames[finish].seconds - timeline.frames[start].seconds,
          );
          expect(result.primaryUnit).toBe("s");
          expect(validatedResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
        }
      }
    },
  );
});
