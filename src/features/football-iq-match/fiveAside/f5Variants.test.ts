import { describe, expect, it } from "vitest";
import { runSim } from "./f5Sim";
import {
  F5_VARIANT_SEEDS,
  makeVariant,
  nextVariantSeed,
  POSITIONS,
  slotIndex,
  variantFromId,
} from "./f5Variants";

describe("5v5 variants", () => {
  it("every listed seed gives you the keeper's first ball (validated list)", () => {
    for (const pos of POSITIONS) {
      expect(F5_VARIANT_SEEDS[pos].length).toBeGreaterThanOrEqual(20);
      for (const seed of F5_VARIANT_SEEDS[pos]) {
        const s = runSim(makeVariant(seed, pos), [], { record: false });
        const first = s.events.find(
          (e) => (e.type === "control" && e.from !== "start") || e.type === "touch",
        );
        expect(first && "by" in first ? first.by : null, `${pos}-${seed}`).toBe(
          slotIndex("home", pos),
        );
        expect(s.outcome).not.toBeNull();
      }
    }
  }, 60_000);

  it("varies the problem: pressing side, timing, rival shape and partner shape", () => {
    for (const pos of POSITIONS) {
      const vs = F5_VARIANT_SEEDS[pos].map((s) => makeVariant(s, pos));
      expect(new Set(vs.map((v) => v.press)).size).toBe(3);
      expect(new Set(vs.map((v) => v.timing)).size).toBe(3);
      expect(new Set(vs.map((v) => v.rivals)).size).toBe(2);
      expect(new Set(vs.map((v) => v.shape)).size).toBe(2);
    }
  });

  it("the next variant changes at least two parts of the problem", () => {
    const v = makeVariant(F5_VARIANT_SEEDS.pivot[0]!, "pivot");
    const next = makeVariant(nextVariantSeed("pivot", v, 3), "pivot");
    const dims = (x: typeof v) => [x.press, x.timing, x.rivals, x.shape];
    expect(dims(next).filter((d, i) => d !== dims(v)[i]).length).toBeGreaterThanOrEqual(2);
  });

  it("ids round-trip and reject anything else", () => {
    const v = makeVariant(7, "def");
    expect(variantFromId(v.id)).toEqual(v);
    expect(variantFromId("f5v1-keeper-3")).toBeNull();
    expect(variantFromId("fp1-3")).toBeNull();
  });
});
