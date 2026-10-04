import { describe, expect, it } from "vitest";
import {
  actionDuration,
  createPlayback,
  PASS_WINDUP_SECONDS,
  PASS_RECOVERY_SECONDS,
  playbackDuration,
  playbackFrame,
  samplePlayback,
  shortestAngle,
} from "./playback";
import type { PlannedAction, Scenario } from "./types";

const scenario: Scenario = {
  id: "animation-test",
  title: "",
  question: "",
  focus: "",
  seconds: 8,
  controlledPlayerId: "a",
  ballCarrierId: "a",
  referenceActions: [],
  players: [
    { id: "a", team: "home", number: 8, role: "SP", x: 20, y: 100 },
    { id: "b", team: "home", number: 7, role: "PS", x: 80, y: 80 },
  ],
};
const run: PlannedAction = {
  id: "run",
  type: "run",
  playerId: "a",
  from: { x: 20, y: 100 },
  to: { x: 20, y: 60 },
};
const pass: PlannedAction = {
  id: "pass",
  type: "pass",
  playerId: "a",
  targetId: "b",
  from: { x: 20, y: 60 },
  to: { x: 80, y: 80 },
};

describe("IQ action playback", () => {
  it("moves only the active player and keeps its gait tied to distance", () => {
    const frame = playbackFrame(scenario, [run], 0.5);
    expect(frame.positions.get("a")).toEqual({ x: 20, y: 80 });
    expect(frame.motions.get("a")).toMatchObject({ moving: true, distance: 20, heading: Math.PI });
    expect(frame.motions.get("b")?.moving).toBe(false);
    expect(frame.ball).toEqual({ x: 20, y: 80 });
  });
  it("stops the gait at the final destination", () => {
    const frame = playbackFrame(scenario, [run], 1);
    expect(frame.positions.get("a")).toEqual(run.to);
    expect(frame.motions.get("a")).toMatchObject({ moving: false, distance: 40 });
  });
  it("walks for a positional shift, then stops and switches to running", () => {
    const shift = { ...run, id: "shift", type: "shift" as const, to: { x: 20, y: 96 } };
    const nextRun = { ...run, from: shift.to };
    const plan = createPlayback(scenario, [shift, nextRun]);
    const walking = samplePlayback(plan, plan.segments[0].duration / 2 / plan.duration);
    expect(walking.motions.get("a")).toMatchObject({ moving: true, state: "move", gait: "walk" });
    expect(walking.positions.get("a")!.y).toBeCloseTo(98);
    expect(actionDuration(shift)).toBeGreaterThan(actionDuration({ ...shift, type: "run" }));
    const stopped = samplePlayback(plan, plan.segments[1].start / plan.duration);
    expect(stopped.positions.get("a")).toEqual(shift.to);
    expect(stopped.motions.get("a")?.moving).toBe(false);
    const running = samplePlayback(plan, (plan.segments[1].start + 0.3) / plan.duration);
    expect(running.motions.get("a")).toMatchObject({ moving: true, gait: "run" });
  });
  it("uses each action's duration instead of speeding all moves into 2.6 seconds", () => {
    const total = playbackDuration(scenario, [run, pass]);
    expect(total).toBeGreaterThan(5);
    const frame = playbackFrame(scenario, [run, pass], actionDuration(run) / total);
    expect(frame.positions.get("a")).toEqual(run.to);
    expect(frame.ballCarrierId).toBe("a");
    const afterPass = playbackFrame(scenario, [run, pass], 1);
    expect(afterPass.ballCarrierId).toBe("b");
    expect(afterPass.ball).toEqual({ x: 80, y: 80 });
  });
  it("does not teleport to an obsolete reference-action start", () => {
    const stale = { ...run, from: { x: 18, y: 72 } };
    const frame = playbackFrame(scenario, [stale], 0.001);
    expect(frame.positions.get("a")?.x).toBe(20);
    expect(frame.positions.get("a")?.y).toBeGreaterThan(99);
  });
  it("faces east for a sideways run and never runs for a zero-distance move", () => {
    const sideways = { ...run, to: { x: 60, y: 100 } };
    expect(playbackFrame(scenario, [sideways], 0.5).motions.get("a")?.heading).toBeCloseTo(
      Math.PI / 2,
    );
    expect(playbackFrame(scenario, [{ ...run, to: run.from }], 0.5).motions.get("a")?.moving).toBe(
      false,
    );
  });
  it("preserves possession before a pass arrives", () => {
    const frame = playbackFrame(scenario, [{ ...pass, from: run.from }], 0.5);
    expect(frame.ballInFlight).toBe(true);
    expect(frame.ballCarrierId).toBe("a");
    expect(frame.positions.get("b")).toEqual({ x: 80, y: 80 });
  });
  it("handles an empty plan without moving or losing the ball", () => {
    const frame = playbackFrame(scenario, [], 1);
    expect(playbackDuration(scenario, [])).toBe(0);
    expect(frame.ball).toEqual({ x: 20, y: 100 });
    expect([...frame.motions.values()].some((motion) => motion.moving)).toBe(false);
  });
  it("brakes, turns in place and accelerates before running in the opposite direction", () => {
    const back = { ...run, id: "back", from: run.to, to: run.from };
    const plan = createPlayback(scenario, [run, back]);
    const segment = plan.segments[1];
    const start = samplePlayback(plan, segment.start / plan.duration);
    const turning = samplePlayback(plan, (segment.start + segment.turn / 2) / plan.duration);
    const endedTurn = samplePlayback(plan, (segment.start + segment.turn) / plan.duration);
    expect(start.positions.get("a")).toEqual(run.to);
    expect(start.motions.get("a")?.moving).toBe(false);
    expect(turning.positions.get("a")).toEqual(run.to);
    expect(turning.motions.get("a")?.state).toBe("turn");
    expect(
      Math.abs(shortestAngle(start.motions.get("a")!.heading, turning.motions.get("a")!.heading)),
    ).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(shortestAngle(endedTurn.motions.get("a")!.heading, 0))).toBeLessThan(0.00001);
    const moving = samplePlayback(plan, (segment.start + segment.turn + 0.02) / plan.duration);
    expect(moving.positions.get("a")!.y).toBeGreaterThan(60);
    expect(moving.positions.get("a")!.y).toBeLessThan(60.01);
  });
  it("turns across the -PI/PI boundary using the shorter arc", () => {
    expect(shortestAngle(Math.PI - 0.05, -Math.PI + 0.05)).toBeCloseTo(0.1);
    expect(shortestAngle(-Math.PI + 0.05, Math.PI - 0.05)).toBeCloseTo(-0.1);
  });
  it("releases from the foot only after preparation, with no jump at either pass endpoint", () => {
    const plan = createPlayback(scenario, [pass]);
    const segment = plan.segments[0];
    const release = segment.turn + PASS_WINDUP_SECONDS;
    const justBefore = samplePlayback(plan, (release - 0.00001) / plan.duration);
    const justAfter = samplePlayback(plan, (release + 0.00001) / plan.duration);
    expect(justBefore.ballInFlight).toBe(false);
    expect(justAfter.ballInFlight).toBe(true);
    expect(justBefore.ballCarrierId).toBe("a");
    expect(
      Math.hypot(
        justAfter.ballVisual.x - justBefore.ballVisual.x,
        justAfter.ballVisual.y - justBefore.ballVisual.y,
      ),
    ).toBeLessThan(0.001);
    const contact = release + segment.travel;
    const approach = samplePlayback(plan, (contact - 0.00001) / plan.duration);
    const caught = samplePlayback(plan, (contact + 0.00001) / plan.duration);
    expect(approach.ballCarrierId).toBe("a");
    expect(caught.ballCarrierId).toBe("b");
    expect(caught.motions.get("b")?.state).toBe("receive");
    expect(
      Math.hypot(
        caught.ballVisual.x - approach.ballVisual.x,
        caught.ballVisual.y - approach.ballVisual.y,
      ),
    ).toBeLessThan(0.001);
  });
  it("finishes reception before the receiver turns and runs", () => {
    const next = {
      ...run,
      id: "next",
      playerId: "b",
      from: { x: 80, y: 80 },
      to: { x: 90, y: 30 },
    };
    const plan = createPlayback(scenario, [pass, next]);
    const segment = plan.segments[1];
    const before = samplePlayback(plan, (segment.start - 0.00001) / plan.duration);
    const after = samplePlayback(plan, (segment.start + 0.00001) / plan.duration);
    expect(before.ballCarrierId).toBe("b");
    expect(after.positions.get("b")).toEqual({ x: 80, y: 80 });
    expect(
      Math.abs(shortestAngle(before.motions.get("b")!.heading, after.motions.get("b")!.heading)),
    ).toBeLessThan(0.001);
    expect(
      Math.hypot(
        before.ballVisual.x - after.ballVisual.x,
        before.ballVisual.y - after.ballVisual.y,
      ),
    ).toBeLessThan(0.001);
  });
  it("samples deterministically even when seeking backwards or skipping frames", () => {
    const plan = createPlayback(scenario, [run, pass]);
    const first = samplePlayback(plan, 0.82);
    samplePlayback(plan, 0.1);
    samplePlayback(plan, 1);
    expect(samplePlayback(plan, 0.82)).toEqual(first);
    expect(samplePlayback(plan, -1)).toEqual(samplePlayback(plan, 0));
    expect(samplePlayback(plan, 2)).toEqual(samplePlayback(plan, 1));
  });
  it("keeps the follow-through for a short pass after the receiver has the ball", () => {
    const nearby = {
      ...scenario,
      players: [scenario.players[0], { ...scenario.players[1], x: 20, y: 88 }],
    };
    const plan = createPlayback(nearby, [pass]);
    const segment = plan.segments[0];
    expect(segment.duration - segment.turn).toBeCloseTo(
      PASS_WINDUP_SECONDS + PASS_RECOVERY_SECONDS,
    );
    const late = samplePlayback(plan, (segment.turn + PASS_WINDUP_SECONDS + 0.8) / plan.duration);
    expect(late.ballCarrierId).toBe("b");
    expect(late.motions.get("a")?.state).toBe("pass");
    expect(late.motions.get("a")?.phase).toBeGreaterThan(0.5);
    expect(late.motions.get("b")?.state).toBe("idle");
  });
});
