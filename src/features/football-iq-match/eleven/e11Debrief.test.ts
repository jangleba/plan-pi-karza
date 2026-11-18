import { describe, expect, it } from "vitest";
import { runSim, type E11Input } from "./e11Sim";
import { buildDebrief } from "./e11Debrief";
import { makeVariant, slotIndex } from "./e11Variants";

const pass = (seed: number, dt: number) => {
  const v = makeVariant(seed, "mid");
  const run = v.runs[0]!;
  const input: E11Input = {
    tick: run.burst + dt - 19,
    kind: "pass",
    to: slotIndex("home", run.slot),
    through: true,
  };
  return runSim(v, [input]);
};

describe("11v11 debrief", () => {
  it("a pass as the runner starts is graded as good timing, with the numbers behind it", () => {
    const d = buildDebrief(pass(3, 0));
    expect(d.timing.kind).toBe("inTime");
    expect(d.timing.grade).toBe("good");
    expect(d.timing.text).toMatch(/za linią|przed linią/);
    expect(d.choice.grade).toBe("good");
    expect(d.tip).toMatch(/Dobra decyzja/);
  });

  it("a pass after the runner got ahead of the line is offside, explained with the distance", () => {
    const sim = pass(3, 90);
    expect(sim.outcome?.kind).toBe("offside");
    const d = buildDebrief(sim);
    expect(d.timing.kind).toBe("late");
    expect(d.timing.grade).toBe("poor");
    expect(d.timing.text).toMatch(/\d,\d m przed linią/);
    expect(d.problem === "late" || d.problem === "readLine").toBe(true);
    const off = d.moments.find((m) => m.kind === "offside");
    expect(off?.focus.line).not.toBeNull();
    expect(off?.focus.players.length).toBe(1);
  });

  it("a pass before the runner has even started is 'too early'", () => {
    const d = buildDebrief(pass(3, -90));
    expect(d.timing.kind).toBe("early");
    expect(d.problem).toBe("early");
  });

  it("holding the ball until the rival wins it is called out", () => {
    const sim = runSim(makeVariant(3, "mid"), []);
    const d = buildDebrief(sim);
    expect(sim.outcome?.kind).toBe("tackled");
    expect(d.problem).toBe("heldTooLong");
    expect(d.choice.grade).toBe("poor");
  });

  it("tells the story in time order, starting with the start and ending with the result", () => {
    const d = buildDebrief(pass(3, 0));
    const ticks = d.moments.map((m) => m.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    expect(d.moments[0]!.kind).toBe("start");
    expect(d.moments.at(-1)!.kind).toBe("end");
    expect(d.moments.some((m) => m.kind === "run")).toBe(true);
    expect(d.moments.some((m) => m.kind === "pass")).toBe(true);
    for (const m of d.moments) expect(m.text.length).toBeGreaterThan(8);
  });

  it("names the step of the back line when it caused the offside", () => {
    // A trap picture: the line steps up just before the burst.
    const v = makeVariant(6, "mid");
    expect(v.trap).toBe(true);
    const run = v.runs[0]!;
    const sim = runSim(v, [
      { tick: run.burst + 75 - 19, kind: "pass", to: slotIndex("home", run.slot), through: true },
    ]);
    const d = buildDebrief(sim);
    expect(d.moments.some((m) => m.kind === "line")).toBe(true);
  });
});
