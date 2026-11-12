import { describe, expect, it } from "vitest";
import {
  __test,
  createSim,
  DT,
  groundSpeedFor,
  offsideLine,
  runSim,
  stepSim,
  type FpInput,
  type SimState,
} from "./fpSim";
import { FixedStep } from "./fpScene";
import { makeVariant, FP_VARIANT_SEEDS } from "./fpVariants";
import { dist, len } from "./fpMath";
import { evaluateOptions } from "./fpOptions";
import { modelInputs, shutSide } from "./fpDebrief";

const SEED = FP_VARIANT_SEEDS[0];

describe("first-person 3v2 simulator", () => {
  it("is deterministic: the same variant and inputs give the same match", () => {
    const v = makeVariant(SEED);
    const inputs = modelInputs(v, "touch");
    const a = runSim(v, inputs),
      b = runSim(v, inputs);
    expect(a.outcome).toEqual(b.outcome);
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.frames.at(-1)).toEqual(b.frames.at(-1));
  });

  it("does not depend on the display frame rate", () => {
    const v = makeVariant(SEED);
    const inputs = modelInputs(v, "touch");
    const play = (frameTimes: () => number) => {
      const s = createSim(v);
      const step = new FixedStep();
      let guard = 0;
      while (s.phase !== "done" && guard++ < 20000)
        step.advance(frameTimes(), () => {
          stepSim(s, inputs);
          return s.phase !== "done";
        });
      return s;
    };
    let k = 0;
    const at30 = play(() => 1 / 30);
    const at144 = play(() => 1 / 144);
    const jitter = play(() => [0.004, 0.031, 0.016, 0.09, 0.008][k++ % 5]!);
    expect(at144.outcome).toEqual(at30.outcome);
    expect(jitter.outcome).toEqual(at30.outcome);
    expect(at144.frames.at(-1)).toEqual(at30.frames.at(-1));
    expect(jitter.frames.at(-1)).toEqual(at30.frames.at(-1));
  });

  it("accelerates, tops out and brakes like a footballer", () => {
    const s = createSim(makeVariant(SEED));
    const a = s.agents.runner;
    a.pos = { x: 0, y: 0 };
    a.vel = { x: 0, y: 0 };
    a.heading = 0;
    const tick = (target: { x: number; y: number }, top: number) => {
      a.target = target;
      a.top = top;
      a.face = null;
      // Move only this player: call the step's movement through a one-agent sim.
      stepAgent(s, a);
    };
    for (let i = 0; i < 60; i++) tick({ x: 0, y: 100 }, 9);
    const after1s = len(a.vel);
    expect(after1s).toBeGreaterThan(3.8);
    expect(after1s).toBeLessThan(5.6);
    for (let i = 0; i < 240; i++) tick({ x: 0, y: 200 }, 9);
    expect(len(a.vel)).toBeLessThanOrEqual(a.maxSpeed + 1e-9);
    expect(len(a.vel)).toBeGreaterThan(a.maxSpeed * 0.95);
    // Braking to a stop takes over a second and several metres from top speed.
    const from = { ...a.pos };
    let ticks = 0;
    while (len(a.vel) > 0.2 && ticks < 400) {
      tick(a.pos, 0);
      ticks++;
    }
    expect(ticks * DT).toBeGreaterThan(0.9);
    expect(dist(from, a.pos)).toBeGreaterThan(3);
  });

  it("cannot turn sharply at full speed", () => {
    const s = createSim(makeVariant(SEED));
    const a = s.agents.runner;
    a.pos = { x: 0, y: 0 };
    a.vel = { x: 0, y: a.maxSpeed };
    a.heading = 0;
    a.target = { x: 40, y: 0 };
    a.top = 9;
    a.face = null;
    let ticks = 0;
    while (Math.abs(Math.atan2(a.vel.x, a.vel.y) - Math.PI / 2) > 0.2 && ticks < 300) {
      stepAgent(s, a);
      a.target = { x: a.pos.x + 40, y: a.pos.y };
      ticks++;
    }
    // A 90° change of direction from a sprint needs time and space (no instant turns).
    expect(ticks * DT).toBeGreaterThan(0.35);
  });

  it("kicks a ground pass hard enough to arrive at the asked speed", () => {
    const v0 = groundSpeedFor(20, 7);
    expect(v0).toBeGreaterThan(9);
    expect(v0).toBeLessThan(15);
    expect(groundSpeedFor(40, 7)).toBeGreaterThan(v0);
  });

  it("lifts a lofted pass over the players and lands it later than a ground pass", () => {
    const v = makeVariant(SEED);
    const s = runSim(v, modelInputs(v, "touch"), { record: false });
    const control = s.events.find((e) => e.type === "control" && e.by === "ty")!.tick;
    const base: FpInput[] = [{ tick: 20, kind: "touch", dir: -shutSide(v) }];
    const aim = { kind: "point" as const, x: v.start.runner.x, y: v.start.runner.y + 10 };
    const lofted = runSim(v, [...base, { tick: control + 10, kind: "pass", aim, lofted: true }], {
      idealFrom: 0,
    });
    const launch = lofted.events.find((e) => e.type === "pass" && e.from === "ty");
    expect(launch).toBeDefined();
    const peak = Math.max(
      ...lofted.frames.filter((f) => f.tick > launch!.tick).map((f) => f.ball.h),
    );
    expect(peak).toBeGreaterThan(2.2);
  });

  it("judges offside at the moment of the pass", () => {
    const v = makeVariant(SEED);
    const s = createSim(v, { record: false });
    // Play to TY's control, then put the runner clearly beyond the line and pass to him.
    const inputs: FpInput[] = [{ tick: 20, kind: "touch", dir: -shutSide(v) }];
    while (s.phase !== "possession" && s.phase !== "done") stepSim(s, inputs);
    expect(s.phase).toBe("possession");
    const line = offsideLine(s);
    s.agents.runner.pos = { x: s.agents.ty.pos.x + 12, y: line + 5 };
    s.agents.runner.vel = { x: 0, y: 0 };
    const pass: FpInput = { tick: s.tick, kind: "pass", aim: { kind: "player", id: "runner" } };
    stepSim(s, [pass]);
    let guard = 0;
    while (!s.events.some((e) => e.type === "pass" && e.from === "ty") && guard++ < 200)
      stepSim(s, []);
    const event = s.events.find((e) => e.type === "pass" && e.from === "ty");
    expect(event && event.type === "pass" && event.offside).toContain("runner");
  });

  it("has no scripted ending: different decisions give different results", () => {
    const outcomes = new Set<string>();
    for (const seed of FP_VARIANT_SEEDS.slice(0, 4)) {
      const v = makeVariant(seed);
      const touch: FpInput = { tick: 20, kind: "touch", dir: -shutSide(v) };
      const s = runSim(v, [touch], { record: false });
      if (s.controlTick === null) continue;
      for (const o of evaluateOptions(v, [touch], s.controlTick + 20, 0))
        outcomes.add(`${seed}:${o.outcome.kind}`);
      // And within one variant at least two different results.
      const own = [...outcomes].filter((x) => x.startsWith(`${seed}:`));
      expect(own.length).toBeGreaterThanOrEqual(2);
    }
  }, 30_000);

  it("keeps the simulated body facing apart from where the first touch is aimed", () => {
    const v = makeVariant(SEED);
    const run = (dir: number) => {
      const s = createSim(v, { record: false });
      const inputs: FpInput[] = [{ tick: 10, kind: "touch", dir }];
      while (s.phase !== "touch" && s.phase !== "possession" && s.phase !== "done")
        stepSim(s, inputs);
      return s;
    };
    const a = run(0),
      b = run(Math.PI / 2);
    // Up to the first touch TY faces the ball either way: the aim is only a control input.
    expect(a.agents.ty.heading).toBeCloseTo(b.agents.ty.heading, 6);
  });
});

/** Moves one agent one tick with the simulator's own movement rules. */
const stepAgent = (s: SimState, a: SimState["agents"]["ty"]) => __test.moveAgent(s, a);
