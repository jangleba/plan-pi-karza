import { describe, expect, it } from "vitest";
import { createSim, isOffside, offsideLine, runSim, stepSim, type E11Input } from "./e11Sim";
import {
  E11_VARIANT_SEEDS,
  makeVariant,
  nextVariantSeed,
  ROLES,
  slotIndex,
  type E11Role,
} from "./e11Variants";

const through = (seed: number, role: E11Role, dt: number) => {
  const v = makeVariant(seed, role);
  const run = v.runs[0]!;
  const input: E11Input = {
    tick: run.burst + dt - 19,
    kind: "pass",
    to: slotIndex("home", run.slot),
    through: true,
  };
  return runSim(v, [input], { record: false });
};

describe("11v11 simulator basics", () => {
  it("has 22 players, your ball and a legal start (nobody of yours beyond the line)", () => {
    for (const role of ROLES) {
      const s = createSim(makeVariant(3, role));
      expect(s.players).toHaveLength(22);
      expect(s.ball.owner).toBe(s.ty);
      const line = offsideLine(s.players, s.ball.pos.y);
      for (const p of s.players.filter((p) => p.team === "home"))
        expect(isOffside(p, line)).toBe(false);
    }
  });

  it("is deterministic: the same variant and inputs give the same fragment", () => {
    const v = makeVariant(5, "fwd");
    const a = runSim(v, []);
    const b = runSim(v, []);
    expect(b.tick).toBe(a.tick);
    expect(b.outcome).toEqual(a.outcome);
    expect(b.snapshots.at(-1)).toEqual(a.snapshots.at(-1));
  });

  it("never lets you run for yourself: your slot is not a runner", () => {
    for (const role of ROLES)
      for (let seed = 1; seed <= 20; seed++) {
        const v = makeVariant(seed, role);
        const s = createSim(v);
        expect(v.runs.map((r) => slotIndex("home", r.slot))).not.toContain(s.ty);
      }
  });

  it("without input the fragment ends: the rival closes you down, it never hangs", () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = runSim(makeVariant(seed, "mid"), []);
      expect(s.phase).toBe("done");
      expect(["tackled", "timeout"]).toContain(s.outcome?.kind);
    }
  });
});

describe("offside is judged at the release of the pass", () => {
  it("level with the second-last rival is onside; ahead of him is offside", () => {
    const s = createSim(makeVariant(3, "mid"));
    const line = offsideLine(s.players, s.ball.pos.y);
    const runner = s.players[slotIndex("home", s.variant.runs[0]!.slot)]!;
    runner.pos = { x: runner.pos.x, y: line };
    expect(isOffside(runner, line)).toBe(false);
    runner.pos = { x: runner.pos.x, y: line + 0.1 };
    expect(isOffside(runner, line)).toBe(true);
    // In your own half nobody is offside.
    runner.pos = { x: runner.pos.x, y: -1 };
    expect(isOffside(runner, -3)).toBe(false);
  });

  it("the ball itself moves the line: nobody is offside behind the ball", () => {
    const s = createSim(makeVariant(3, "mid"));
    const line = offsideLine(s.players, 40);
    expect(line).toBeGreaterThanOrEqual(40);
  });

  it("flags only at the moment of the pass and calls it when the flagged man touches the ball", () => {
    const v = makeVariant(3, "mid");
    const run = v.runs[0]!;
    const to = slotIndex("home", run.slot);
    const s = createSim(v);
    while (s.tick < 60) stepSim(s, []);
    // He is ahead of the line when the ball is played: flagged, then called on the touch.
    const line = offsideLine(s.players, s.ball.pos.y);
    s.players[to]!.pos = { x: run.lane, y: line + 2.5 };
    stepSim(s, [{ tick: s.tick, kind: "pass", to, through: true }]);
    const limit = s.tick + 600;
    while (s.phase !== "done" && s.tick < limit) stepSim(s, []);
    const pass = s.events.find((e) => e.type === "pass");
    expect(pass && pass.type === "pass" ? pass.flagged : []).toContain(to);
    expect(s.outcome?.kind).toBe("offside");
    expect(s.events.some((e) => e.type === "offside")).toBe(true);
  });

  it("the same pass with the man level with the line is not offside", () => {
    const v = makeVariant(3, "mid");
    const run = v.runs[0]!;
    const to = slotIndex("home", run.slot);
    const s = createSim(v);
    while (s.tick < 60) stepSim(s, []);
    const line = offsideLine(s.players, s.ball.pos.y);
    s.players[to]!.pos = { x: run.lane, y: line - 0.2 };
    stepSim(s, [{ tick: s.tick, kind: "pass", to, through: true }]);
    const limit = s.tick + 600;
    while (s.phase !== "done" && s.tick < limit) stepSim(s, []);
    const pass = s.events.find((e) => e.type === "pass");
    expect(pass && pass.type === "pass" ? pass.flagged : [99]).not.toContain(to);
    expect(s.outcome?.kind).not.toBe("offside");
  });
});

describe("timing is the lesson: validated pictures", () => {
  for (const role of ROLES)
    for (const seed of E11_VARIANT_SEEDS[role].slice(0, 4))
      it(`${role} ${seed}: a pass as the runner starts is a chance, the same pass long after is offside`, () => {
        const good = ["goal", "saved", "shotOff"];
        const window = [-30, -15, 0, 15, 30].map((dt) => through(seed, role, dt).outcome?.kind);
        expect(window.filter((k) => good.includes(k!)).length).toBeGreaterThanOrEqual(4);
        const late = [75, 90].map((dt) => through(seed, role, dt).outcome?.kind);
        expect(late).toContain("offside");
      });

  it("picks validated pictures in turn and does not repeat one twice in a row", () => {
    let last: number | null = null;
    for (let played = 0; played < 30; played++) {
      const seed = nextVariantSeed("mid", last, played);
      expect(E11_VARIANT_SEEDS.mid).toContain(seed);
      expect(seed).not.toBe(last);
      last = seed;
    }
  });
});
