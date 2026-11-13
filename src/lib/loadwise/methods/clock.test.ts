import { describe, expect, it } from "vitest";
import {
  advanceMethodClock,
  completeManualMethodWork,
  initialMethodClock,
  pauseMethodClock,
  resumeMethodClock,
  startMethodClock,
  velocityLoss,
} from "./clock";
import { executionFor } from "./catalogue";
describe("method clocks and honest manual measurements", () => {
  it("runs timed intervals, separate block rests, and no final post-work rest", () => {
    const p = executionFor("M29", {
      rounds: 2,
      repetitions: 2,
      workSeconds: 10,
      restSeconds: 5,
      roundRestSeconds: 20,
    });
    let s = startMethodClock(p, 1000);
    expect(s.deadline).toBe(11000);
    s = advanceMethodClock(p, s, 11000);
    expect(s.phase).toBe("rest");
    s = advanceMethodClock(p, s, 16000);
    expect(s.repetition).toBe(1);
    s = advanceMethodClock(p, s, 26000);
    expect(s.round).toBe(1);
    expect(s.deadline).toBe(46000);
    s = advanceMethodClock(p, s, 71000);
    expect(s.phase).toBe("done");
  });
  it("never assumes a measured-distance trial is complete from elapsed time", () => {
    const p = executionFor("M18", { repetitions: 2, distanceM: 20, restSeconds: 120 });
    let s = startMethodClock(p, 0);
    expect(advanceMethodClock(p, s, 999999)).toEqual(s);
    s = completeManualMethodWork(p, s, 5000);
    expect(s.deadline).toBe(125000);
    s = advanceMethodClock(p, s, 125000);
    expect(s.phase).toBe("work");
    expect(s.deadline).toBeNull();
    expect(completeManualMethodWork(p, s, 130000).phase).toBe("done");
  });
  it("counts cluster groups, not repetitions as separate sets, with an intra-set rest", () => {
    const p = executionFor("M08", {
      mode: "cluster",
      rounds: 2,
      repetitions: 3,
      repGroups: [2, 2, 2],
      restSeconds: 20,
      roundRestSeconds: 180,
    });
    let s = startMethodClock(p, 0);
    for (let i = 0; i < 3; i++) {
      s = completeManualMethodWork(p, s, i * 21000);
      if (i < 2) s = advanceMethodClock(p, s, i * 21000 + 20000);
    }
    expect(s.round).toBe(1);
    expect(s.phase).toBe("rest");
    expect(s.deadline).toBe(222000);
    expect(s.group).toBe(0);
  });
  it("pauses without spending work/rest time and resumes remaining duration", () => {
    const p = executionFor("M13", { mode: "hold", workSeconds: 20 });
    const s = pauseMethodClock(p, startMethodClock(p, 0), 6000);
    expect(s.remainingMs).toBe(14000);
    expect(advanceMethodClock(p, s, 999999)).toEqual(s);
    const resumed = resumeMethodClock(p, s, 50000);
    expect(resumed.deadline).toBe(64000);
    expect(advanceMethodClock(p, resumed, 64000).phase).toBe("done");
    expect(initialMethodClock().phase).toBe("idle");
  });
  it("computes manual velocity loss from the fastest valid rep without guessing missing values", () => {
    expect(velocityLoss([0.5, 0.6, 0.48], 15).lossPct).toBeCloseTo(20);
    expect(velocityLoss([0.5, 0.6, 0.48], 15).stop).toBe(true);
    expect(velocityLoss([0.5], 15).lossPct).toBeNull();
    expect(velocityLoss([0, 0.4], 15).error).toBeTruthy();
    expect(velocityLoss([0.5, 0.4], NaN).error).toBeTruthy();
  });
});
