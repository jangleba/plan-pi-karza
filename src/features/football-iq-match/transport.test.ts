import { describe, it, expect } from "vitest";
import { clampProgress, currentPlaybackStep } from "./transport";
import { scenarios } from "./scenarios";
import { createPlayback } from "./playback";

describe("IQ interactive transport", () => {
  it("clamps seeking and rejects non-finite input", () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(2)).toBe(1);
    expect(clampProgress(0.37)).toBe(0.37);
    expect(clampProgress(NaN)).toBe(0);
    expect(clampProgress(Infinity)).toBe(0);
  });
  it("changes the teaching step when the actual action finishes", () => {
    const s = scenarios[0],
      p = createPlayback(s, s.referenceActions);
    const first = p.simulation!.events[0];
    expect(currentPlaybackStep(p, 0, s.referenceActions.length)).toBe(0);
    expect(
      currentPlaybackStep(p, (first.time + 0.01) / p.duration, s.referenceActions.length),
    ).toBe(1);
    expect(currentPlaybackStep(p, 1, s.referenceActions.length)).toBe(
      s.referenceActions.length - 1,
    );
  });
  it("does not advance past an invalid action", () => {
    const s = scenarios[0],
      bad = { ...s.referenceActions[0], targetId: "missing" };
    const p = createPlayback(s, [bad, s.referenceActions[1]]);
    expect(currentPlaybackStep(p, 0, 2)).toBe(0);
  });
});
