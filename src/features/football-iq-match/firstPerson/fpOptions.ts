/** The options TY has at one moment, each played out by the same simulator with exact execution.
 * This is how the debrief tells the quality of a choice apart from its execution and its result:
 * a choice is judged by what the option would give with a clean pass, not by what happened. */
import { add, clamp, dist, headingOf, len, norm, scale, sub, v, type V } from "./fpMath";
import {
  createSim,
  runSim,
  stepSim,
  type FpInput,
  type Outcome,
  type OutcomeKind,
  type SimState,
} from "./fpSim";
import type { FpVariant } from "./fpVariants";

export type OptionKey = "support" | "runner" | "space" | "lofted" | "carry";
export type OptionEval = { key: OptionKey; input: FpInput; outcome: Outcome; score: number };

export const OUTCOME_SCORE: Record<OutcomeKind, number> = {
  chance: 1,
  progress: 0.72,
  kept: 0.5,
  timeout: 0.1,
  loss: 0,
  offside: 0,
};
export const SENSIBLE_SCORE = 0.45;

/** The simulator state just before the given tick, with the given inputs. */
export function simAt(variant: FpVariant, inputs: readonly FpInput[], tick: number): SimState {
  const s = createSim(variant, { record: false });
  while (s.phase !== "done" && s.tick < tick)
    stepSim(
      s,
      inputs.filter((i) => i.tick === s.tick),
    );
  return s;
}

/** Where a ball into space for the runner should go: ahead of him, where he arrives first
 * by the widest margin over the rivals (keeper included). */
export function spacePoint(s: SimState): V {
  const r = s.agents.runner;
  const ahead = len(r.vel) > 2 ? norm(r.vel) : v(0, 1);
  const base = add(r.pos, scale(r.vel, 0.4));
  const rivals = [s.agents.d1, s.agents.d2, s.agents.gk];
  const time = (from: V, to: V, speed: number, delay: number) => delay + dist(from, to) / speed;
  let best = add(base, scale(ahead, 9)),
    bestMargin = -Infinity;
  for (const forward of [6, 9, 12, 15]) {
    for (const side of [-6, -3, 0, 3, 6]) {
      const p0 = add(base, add(scale(ahead, forward), v(side, 0)));
      const p = v(clamp(p0.x, -30, 30), Math.min(p0.y, 45));
      const mine = time(r.pos, p, 7, 0);
      const theirs = Math.min(...rivals.map((d) => time(d.pos, p, 6.8, 0.35)));
      const margin = theirs - mine - 0.02 * Math.abs(side);
      if (margin > bestMargin) {
        bestMargin = margin;
        best = p;
      }
    }
  }
  return best;
}

export function optionInputs(s: SimState, tick: number): { key: OptionKey; input: FpInput }[] {
  const ty = s.agents.ty;
  const space = spacePoint(s);
  const forward = headingOf(sub(v(ty.pos.x * 0.7, ty.pos.y + 10), ty.pos));
  return [
    { key: "support", input: { tick, kind: "pass", aim: { kind: "player", id: "support" } } },
    { key: "runner", input: { tick, kind: "pass", aim: { kind: "player", id: "runner" } } },
    { key: "space", input: { tick, kind: "pass", aim: { kind: "point", x: space.x, y: space.y } } },
    {
      key: "lofted",
      input: { tick, kind: "pass", aim: { kind: "point", x: space.x, y: space.y }, lofted: true },
    },
    { key: "carry", input: { tick, kind: "carry", dir: forward } },
  ];
}

const scoreOf = (o: Outcome | null) => (o ? OUTCOME_SCORE[o.kind] : 0);

/** Plays every option out from `tick` with exact execution (no noise from that tick on). */
export function evaluateOptions(
  variant: FpVariant,
  prefix: readonly FpInput[],
  tick: number,
  depth = 1,
): OptionEval[] {
  const at = simAt(variant, prefix, tick);
  if (at.phase !== "possession" && at.phase !== "touch") return [];
  const before = prefix.filter((i) => i.tick < tick);
  return optionInputs(at, tick).map(({ key, input }) => {
    if (key === "carry") {
      // A carry is worth the best pass after it (one level deep).
      const after = tick + 50;
      const carried = runSim(variant, [...before, input], { idealFrom: tick, record: false });
      if (depth <= 0 || (carried.outcome && carried.outcome.tick <= after))
        return { key, input, outcome: carried.outcome!, score: scoreOf(carried.outcome) };
      const next = evaluateOptions(variant, [...before, input], after, depth - 1).filter(
        (o) => o.key !== "carry",
      );
      const best = next.sort((a, b) => b.score - a.score)[0];
      if (!best) return { key, input, outcome: carried.outcome!, score: scoreOf(carried.outcome) };
      return { key, input, outcome: best.outcome, score: best.score * 0.95 };
    }
    const done = runSim(variant, [...before, input], { idealFrom: tick, record: false });
    return { key, input, outcome: done.outcome!, score: scoreOf(done.outcome) };
  });
}

/** Options that make sense here: a decent result with a clean pass, close to the best one. */
export function sensibleOptions(options: OptionEval[]) {
  const best = Math.max(0, ...options.map((o) => o.score));
  return options.filter((o) => o.score >= SENSIBLE_SCORE && o.score >= best - 0.3);
}

/** Which option a free aim corresponds to (for grading a pass into space or to a player). */
export function classifyInput(s: SimState, input: FpInput): OptionKey {
  if (input.kind === "carry") return "carry";
  if (input.kind !== "pass") return "carry";
  if (input.aim.kind === "player") return input.aim.id;
  const p = v(input.aim.x, input.aim.y);
  if (input.lofted) return "lofted";
  const toRunner = dist(p, s.agents.runner.pos),
    toSupport = dist(p, s.agents.support.pos);
  return toSupport < 4 && toSupport < toRunner ? "support" : toRunner < 4 ? "runner" : "space";
}
