import { describe, expect, it } from "vitest";
import {
  changedDimensions,
  FP_VARIANT_SEEDS,
  makeVariant,
  nextVariantSeed,
  variantFromId,
} from "./fpVariants";
import { runSim } from "./fpSim";
import { evaluateOptions, OUTCOME_SCORE, sensibleOptions } from "./fpOptions";
import { modelInputs, principleFor } from "./fpDebrief";

/** The checks behind FP_VARIANT_SEEDS: each seed is a real decision problem. */
function checkSeed(seed: number) {
  const v = makeVariant(seed);
  // Without a decision the action is lost (the player has to do something).
  const none = runSim(v, [], { record: false });
  expect(["loss", "timeout"]).toContain(none.outcome!.kind);
  // A clean model action gives at least a forward pass…
  const model = modelInputs(v, principleFor(v));
  expect(model.length).toBe(2);
  const run = runSim(v, model, { idealFrom: model[1]!.tick, record: false });
  expect(OUTCOME_SCORE[run.outcome!.kind]).toBeGreaterThanOrEqual(0.72);
  // …and at that moment more than one option makes sense.
  const options = evaluateOptions(v, [model[0]!], model[1]!.tick);
  expect(sensibleOptions(options).length).toBeGreaterThanOrEqual(2);
}

describe("3v2 variants", () => {
  it("builds the same variant from the same seed, mirrored by side", () => {
    const a = makeVariant(41),
      b = makeVariant(41);
    expect(a).toEqual(b);
    expect(variantFromId(a.id)).toEqual(a);
    expect(variantFromId("fp0-41")).toBeNull();
    for (const seed of FP_VARIANT_SEEDS) {
      const v = makeVariant(seed);
      // Runner on the side opposite the passer, the presser goal side of TY.
      expect(Math.sign(v.start.runner.x - v.start.ty.x)).toBe(v.side);
      expect(v.start.d1.y).toBeGreaterThan(v.start.ty.y);
    }
  });

  it("covers every pressing direction, side shut, partner movement and cover", () => {
    const vs = FP_VARIANT_SEEDS.map(makeVariant);
    for (const key of ["press", "closes", "runner", "support", "cover", "passer"] as const)
      expect(new Set(vs.map((v) => v[key])).size).toBeGreaterThanOrEqual(2);
    expect(new Set(vs.map((v) => v.press)).size).toBe(3);
    expect(new Set(vs.map((v) => v.runner)).size).toBe(3);
  });

  it("changes at least two parts of the problem for the next variant", () => {
    let seed = nextVariantSeed(null, 0);
    for (let played = 1; played < 30; played++) {
      const next = nextVariantSeed(seed, played);
      expect(next).not.toBe(seed);
      expect(changedDimensions(makeVariant(seed), makeVariant(next))).toBeGreaterThanOrEqual(2);
      seed = next;
    }
  });

  const chunks = [0, 12, 24, 36].map((from) => FP_VARIANT_SEEDS.slice(from, from + 12));
  chunks.forEach((chunk, i) =>
    it(
      `validated seeds ${i + 1}/4 are real decision problems`,
      () => chunk.forEach(checkSeed),
      60_000,
    ),
  );
});
