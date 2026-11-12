import { describe, expect, it } from "vitest";
import { createSim, DT, runSim, stepSim, type F5Input, type SimState } from "./f5Sim";
import { F5_VARIANT_SEEDS, makeVariant, POSITIONS, slotIndex } from "./f5Variants";
import { botInputs, type BotStyle } from "./f5Bot";
import { FixedStep } from "../firstPerson/fpScene";
import { dist, len } from "../firstPerson/fpMath";

const play = (seed: number, pos: (typeof POSITIONS)[number], style: BotStyle) => {
  const s = createSim(makeVariant(seed, pos));
  const inputs = botInputs(s, style, (st, i) => stepSim(st, i));
  return { s, inputs };
};

describe("5v5 simulator", () => {
  it("has ten players on a 40 × 25 m pitch, keeper first in each team", () => {
    const s = createSim(makeVariant(F5_VARIANT_SEEDS.left[0]!, "left"));
    expect(s.players).toHaveLength(10);
    expect(s.players.filter((p) => p.keeper).map((p) => p.index)).toEqual([0, 5]);
    for (const p of s.players) {
      expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(12.5);
      expect(Math.abs(p.pos.y)).toBeLessThanOrEqual(20);
    }
    expect(s.ty).toBe(slotIndex("home", "left"));
  });

  it("is deterministic: recorded inputs replay to the same fragment", () => {
    for (const pos of POSITIONS) {
      const { s, inputs } = play(F5_VARIANT_SEEDS[pos][1]!, pos, "turn");
      const again = runSim(s.variant, inputs);
      expect(again.outcome).toEqual(s.outcome);
      expect(again.frames.at(-1)).toEqual(s.frames.at(-1));
    }
  });

  it("does not depend on the display frame rate", () => {
    const v = makeVariant(F5_VARIANT_SEEDS.right[0]!, "right");
    const { inputs } = play(v.seed, "right", "pass");
    const run = (frameTime: () => number) => {
      const s = createSim(v);
      const byTick = new Map<number, F5Input[]>();
      for (const i of inputs) byTick.set(i.tick, [...(byTick.get(i.tick) ?? []), i]);
      const step = new FixedStep(DT);
      let guard = 0;
      while (s.phase !== "done" && guard++ < 50000)
        step.advance(frameTime(), () => {
          stepSim(s, byTick.get(s.tick) ?? []);
          return s.phase !== "done";
        });
      return s;
    };
    let k = 0;
    const at30 = run(() => 1 / 30);
    const at120 = run(() => 1 / 120);
    const jitter = run(() => [0.004, 0.031, 0.016, 0.09, 0.008][k++ % 5]!);
    expect(at120.frames.at(-1)).toEqual(at30.frames.at(-1));
    expect(jitter.frames.at(-1)).toEqual(at30.frames.at(-1));
  });

  it("moves without teleporting: no step longer than top speed allows", () => {
    for (const pos of POSITIONS) {
      const { s } = play(F5_VARIANT_SEEDS[pos][2]!, pos, "turn");
      for (let t = 1; t < s.frames.length; t++)
        for (let i = 0; i < 10; i++) {
          const a = s.frames[t - 1]!.agents[i]!,
            b = s.frames[t]!.agents[i]!;
          // Top speed 7.4 m/s plus a small push when two players touch.
          expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(7.5 * DT + 0.2);
        }
    }
  });

  it("does not send everybody to the ball", () => {
    let crowded = 0,
      ticks = 0;
    for (const pos of POSITIONS)
      for (const seed of F5_VARIANT_SEEDS[pos].slice(0, 4)) {
        const { s } = play(seed, pos, "pass");
        for (const f of s.frames) {
          ticks++;
          const near = f.agents.filter((a) => Math.hypot(a.x - f.ball.x, a.y - f.ball.y) < 4);
          if (near.length > 4) crowded++;
        }
      }
    expect(crowded / ticks).toBeLessThan(0.03);
  });

  it("needs time to turn a sprint round (limited turning)", () => {
    const s = createSim(makeVariant(F5_VARIANT_SEEDS.left[0]!, "left"));
    const ty = s.players[s.ty]!;
    // Run straight for 2 s, then ask for the opposite direction.
    stepSim(s, [{ tick: 0, kind: "move", dir: 0, speed: 1 }]);
    for (let i = 0; i < 120; i++) stepSim(s, []);
    const fast = len(ty.vel);
    expect(fast).toBeGreaterThan(5.5);
    stepSim(s, [{ tick: s.tick, kind: "move", dir: Math.PI, speed: 1 }]);
    let ticks = 0;
    while (ty.vel.y > -1 && ticks < 300) {
      stepSim(s, []);
      ticks++;
    }
    expect(ticks * DT).toBeGreaterThan(0.6);
  });

  it("starts with the keeper's distribution and plays on continuously", () => {
    const { s } = play(F5_VARIANT_SEEDS.def[0]!, "def", "pass");
    const firstPass = s.events.find((e) => e.type === "pass");
    expect(firstPass && firstPass.type === "pass" && firstPass.by).toBe(0);
    expect(s.events.filter((e) => e.type === "pass").length).toBeGreaterThan(3);
    expect(s.outcome).not.toBeNull();
  });

  it("lets rivals win the ball from a player who stands still and loses it slower when shielded", () => {
    const lossTick = (s: SimState) =>
      s.events.find((e) => e.type === "possession" && e.team === "away")?.tick ?? Infinity;
    let idleFaster = 0,
      compared = 0;
    for (const seed of F5_VARIANT_SEEDS.left.slice(0, 10)) {
      const idle = play(seed, "left", "idle").s;
      const shield = play(seed, "left", "shield").s;
      if (lossTick(idle) === Infinity) continue;
      compared++;
      if (lossTick(idle) <= lossTick(shield)) idleFaster++;
    }
    expect(compared).toBeGreaterThan(3);
    expect(idleFaster / compared).toBeGreaterThan(0.6);
  });

  it("has no scripted ending: different decisions lead to different results", () => {
    for (const pos of POSITIONS) {
      const kinds = new Set<string>();
      for (const seed of F5_VARIANT_SEEDS[pos].slice(0, 6))
        for (const style of ["pass", "turn", "careless", "idle"] as const)
          kinds.add(play(seed, pos, style).s.outcome!.kind);
      expect(kinds.size).toBeGreaterThanOrEqual(3);
    }
  });

  it("closes the ball down from the goal side", () => {
    let close = 0,
      goalSide = 0;
    for (const pos of POSITIONS)
      for (const seed of F5_VARIANT_SEEDS[pos].slice(0, 6)) {
        const { s } = play(seed, pos, "idle");
        for (const f of s.frames) {
          if (
            s.events.some((e) => e.type === "possession" && e.team === "away" && e.tick <= f.tick)
          )
            break;
          const ty = f.agents[s.ty]!;
          if (Math.hypot(ty.x - f.ball.x, ty.y - f.ball.y) > 1) continue;
          for (const i of [6, 7, 8, 9]) {
            const p = f.agents[i]!;
            if (dist(p, f.ball) > 2.5) continue;
            close++;
            // The rivals defend the goal at +y: goal side means a higher y than the ball.
            if (p.y >= f.ball.y - 0.3) goalSide++;
          }
        }
      }
    expect(close).toBeGreaterThan(50);
    expect(goalSide / close).toBeGreaterThan(0.6);
  });
});
