import { describe, expect, it } from "vitest";
import { buildJumpTimeline, type JumpTimeline } from "./measurement";
import { selectTimedEvents, type TimedPoseFrame } from "./timedEventDetection";
const timeline = (fps = 240, seconds = 4) =>
  buildJumpTimeline(
    Array.from({ length: fps * seconds }, (_, cts) => ({ cts, duration: 1, timescale: fps })),
  );
function pose(frameIndex: number, x = 0.5, lift = 0): TimedPoseFrame {
  return {
    frameIndex,
    hip: [x, 0.45 - lift],
    shoulders: [x, 0.25 - lift],
    heels: [
      [x - 0.02, 0.82 - lift],
      [x + 0.02, 0.82 - lift],
    ],
    toes: [
      [x - 0.01, 0.84 - lift],
      [x + 0.03, 0.84 - lift],
    ],
    confidence: 0.9,
    bodyHeight: 0.6,
  };
}
const sample = (t: JumpTimeline, f: (seconds: number, index: number) => TimedPoseFrame) =>
  t.frames.map((p, i) => f(p.seconds, i));
describe("conservative timed-event proposals", () => {
  it.each([30, 60, 120, 240])("finds one jump at %s FPS within a small review window", (fps) => {
    const t = timeline(fps),
      points = sample(t, (s, i) =>
        pose(i, 0.5, s > 0.8 && s < 1.2 ? 0.14 * Math.sin((Math.PI * (s - 0.8)) / 0.4) : 0),
      );
    const p = selectTimedEvents("cmj", t, points, null);
    expect(Math.abs(t.frames[p.start].seconds - 0.8)).toBeLessThan(0.06);
    expect(Math.abs(t.frames[p.end].seconds - 1.2)).toBeLessThan(0.06);
    expect(p.focus.start[1]).toBeGreaterThan(0.7);
    expect(p.method).toBe("pose-proposal-v1");
  });
  it("uses the selected support leg rather than the foot held in the air", () => {
    const t = timeline(),
      points = sample(t, (s, i) => {
        const p = pose(
          i,
          0.5,
          s > 0.8 && s < 1.2 ? 0.14 * Math.sin((Math.PI * (s - 0.8)) / 0.4) : 0,
        );
        p.heels[1][1] -= 0.15;
        p.toes[1][1] -= 0.15;
        return p;
      });
    expect(selectTimedEvents("single_leg_cmj", t, points, "left").end).toBeGreaterThan(240);
    expect(() => selectTimedEvents("single_leg_cmj", t, points, null)).toThrow("nogę");
  });
  it("refuses multiple jumps, missing landing, uncertain feet and obvious camera movement", () => {
    const t = timeline();
    const jump = (s: number) => (s > 0.8 && s < 1.2 ? 0.12 : s > 2 && s < 2.4 ? 0.12 : 0);
    expect(() =>
      selectTimedEvents(
        "cmj",
        t,
        sample(t, (s, i) => pose(i, 0.5, jump(s))),
        null,
      ),
    ).toThrow("jeden");
    expect(() =>
      selectTimedEvents(
        "cmj",
        t,
        sample(t, (s, i) => pose(i, 0.5, s > 0.8 ? 0.12 : 0)),
        null,
      ),
    ).toThrow();
    expect(() =>
      selectTimedEvents(
        "cmj",
        t,
        sample(t, (_, i) => ({ ...pose(i), confidence: 0.4 })),
        null,
      ),
    ).toThrow("wyraźnych");
    expect(() =>
      selectTimedEvents(
        "cmj",
        t,
        sample(t, (s, i) => pose(i, s > 2 ? 0.8 : 0.5, s > 0.8 && s < 1.2 ? 0.12 : 0)),
        null,
      ),
    ).toThrow("ruch");
  });
  it("proposes first torso movement and one finish crossing without using a reaction signal", () => {
    const t = timeline(),
      points = sample(t, (s, i) => pose(i, 0.15 + Math.max(0, s - 0.6) * 0.18));
    const p = selectTimedEvents("sprint_10m", t, points, null, 0.6);
    expect(t.frames[p.start].seconds).toBeGreaterThan(0.6);
    expect(t.frames[p.start].seconds).toBeLessThan(0.75);
    expect(Math.abs(t.frames[p.end].seconds - 3.1)).toBeLessThan(0.02);
    expect(() => selectTimedEvents("sprint_10m", t, points, null)).toThrow("linię");
  });
  it("finds two opposite crossings for 505 and does not double-count an exact line frame", () => {
    const t = timeline(120),
      points = sample(t, (s, i) =>
        pose(
          i,
          s < 0.5
            ? 0.15
            : s < 1.6
              ? 0.15 + 0.5 * (s - 0.5)
              : s < 2.7
                ? 0.7 - 0.5 * (s - 1.6)
                : 0.15,
        ),
      );
    const p = selectTimedEvents("cod_505", t, points, "left", 0.4);
    expect(Math.abs(t.frames[p.start].seconds - 1)).toBeLessThan(0.02);
    expect(Math.abs(t.frames[p.end].seconds - 2.2)).toBeLessThan(0.02);
    expect(Math.abs(t.frames[p.turn!].seconds - 1.6)).toBeLessThan(0.02);
    expect(p.focus.turn![1]).toBeGreaterThan(p.focus.start[1]);
  });
  it("uses presentation times for variable-rate footage", () => {
    let ticks = 0;
    const t = buildJumpTimeline(
      Array.from({ length: 600 }, (_, i) => {
        const cts = ticks,
          duration = i % 5 === 0 ? 6 : 4;
        ticks += duration;
        return { cts, duration, timescale: 1000 };
      }),
    );
    const points = sample(t, (s, i) => pose(i, 0.5, s > 0.8 && s < 1.2 ? 0.12 : 0));
    const p = selectTimedEvents("cmj", t, points, null);
    expect(t.frames[p.end].seconds - t.frames[p.start].seconds).toBeCloseTo(0.4, 1);
  });
});
