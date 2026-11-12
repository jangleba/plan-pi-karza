import { describe, expect, it } from "vitest";
import { createSim, stepSim } from "./f5Sim";
import { F5_VARIANT_SEEDS, makeVariant, POSITIONS } from "./f5Variants";
import { botInputs, type BotStyle } from "./f5Bot";
import { buildDebrief, RESULT_TEXT, type F5Debrief } from "./f5Debrief";

const debriefOf = (seed: number, pos: (typeof POSITIONS)[number], style: BotStyle) => {
  const s = createSim(makeVariant(seed, pos));
  botInputs(s, style, (st, i) => stepSim(st, i));
  return buildDebrief(s);
};
// Tactics only: no cues about the body or where to look.
const BODY =
  /głow|biodr|ramię|ramion|barki|tułów|stop[aąy]|wzrok|oczy|spójrz|rozejrzyj|patrz|ciał/i;

describe("5v5 debrief", () => {
  const all: F5Debrief[] = [];
  for (const pos of POSITIONS)
    for (const seed of F5_VARIANT_SEEDS[pos].slice(0, 5))
      for (const style of ["pass", "turn", "shield", "careless", "idle"] as const)
        all.push(debriefOf(seed, pos, style));

  it("grades the first touch, the decision and the result apart, with one tip", () => {
    for (const d of all) {
      expect(["good", "ok", "poor"]).toContain(d.execution.grade);
      expect(["good", "ok", "poor"]).toContain(d.choice.grade);
      expect(d.result.text).toBe(RESULT_TEXT[d.outcome]);
      expect(d.tip.length).toBeGreaterThan(20);
    }
    // Separate grades really differ somewhere (a clean touch with a poor decision or back).
    expect(all.some((d) => d.execution.grade !== d.choice.grade)).toBe(true);
  });

  it("accepts several different good solutions", () => {
    const kinds = new Set(all.filter((d) => d.choice.grade === "good").map((d) => d.choice.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });

  it("marks careless play worse than calm play", () => {
    const score = (style: BotStyle) =>
      all
        .filter((_, i) => ["pass", "turn", "shield", "careless", "idle"][i % 5] === style)
        .filter((d) => d.choice.grade === "good").length;
    expect(score("pass")).toBeGreaterThan(score("careless"));
    expect(score("pass")).toBeGreaterThan(score("idle"));
  });

  it("talks about space, rivals and timing only", () => {
    for (const d of all) {
      for (const text of [d.execution.text, d.choice.text, d.result.text, d.tip])
        expect(text).not.toMatch(BODY);
    }
  });
});
