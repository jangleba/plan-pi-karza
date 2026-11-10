import { describe, expect, it } from "vitest";
import { createJourneyForRules } from "./journeyEngine";
import { generatedSituationBank, situations, situationLayout } from "./situationBank";
import { RETIRED_SITUATION_IDS, VARIANT_SEEDS } from "./situationVariants";
import { generateVariant, MIN_PRESS_GAP, mulberry32, variantShape } from "./variantGenerator";

const isAway = (id: string) => id === "keeper" || /^r\d+$/.test(id);

describe("IQ variant generator", () => {
  it("is a pure function of the seed", () => {
    const base = situations[0].layout;
    expect(generateVariant(base, 7)).toEqual(generateVariant(base, 7));
    expect(generateVariant(base, 7).layout).not.toEqual(generateVariant(base, 8).layout);
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });

  it("keeps the authored situation untouched", () => {
    const before = JSON.stringify(situations);
    for (const s of situations) generateVariant(s.layout, 3);
    expect(JSON.stringify(situations)).toBe(before);
  });

  it("changes the problem with two different transforms, never a mirror", () => {
    for (const s of situations)
      for (const seed of VARIANT_SEEDS[s.key] ?? []) {
        const v = generateVariant(s.layout, seed);
        expect(v.transforms).toHaveLength(2);
        expect(new Set(v.transforms.map((t) => t.kind)).size).toBe(2);
        expect(v.layout.carrier).toBe(s.layout.carrier);
        expect(Object.keys(v.layout.positions).sort()).toEqual(
          Object.keys(s.layout.positions).sort(),
        );
      }
  });

  it("gives every published variant its own transform pair within its situation", () => {
    for (const s of situations) {
      const shapes = (VARIANT_SEEDS[s.key] ?? []).map((seed) =>
        variantShape(generateVariant(s.layout, seed)),
      );
      expect(new Set(shapes).size, s.key).toBe(shapes.length);
    }
  });

  it("starts every variant with the carrier free for a first touch", () => {
    for (const def of generatedSituationBank) {
      const layout = situationLayout(def)!;
      const ball = layout.positions[layout.carrier];
      const gap = Math.min(
        ...Object.entries(layout.positions)
          .filter(([id]) => isAway(id) !== isAway(layout.carrier))
          .map(([, p]) => Math.hypot(p.x - ball.x, p.y - ball.y)),
      );
      expect(gap, def.id).toBeGreaterThanOrEqual(MIN_PRESS_GAP);
    }
  });

  it("builds a playable session from each seeded definition", () => {
    for (const def of generatedSituationBank) {
      const s = createJourneyForRules(def, 9);
      expect(s.world.carrierId).toBe(situationLayout(def)!.carrier);
      expect(s.attackRevision).toBe(3);
    }
  });

  it("offers at least three playable pictures per situation it shows", () => {
    // gk-build and eight-box: no picture yet where TY's choice changes the ball (the keeper's
    // first pass and the cut-back are still pre-picked), so they stay out of the picker.
    const hidden: string[] = [];
    for (const s of situations) {
      const live = [0, 1, 2].filter((c) => !RETIRED_SITUATION_IDS.has(`iqs-${s.key}-${c}`));
      const count = live.length + (VARIANT_SEEDS[s.key]?.length ?? 0);
      if (!count) hidden.push(s.key);
      else expect(count, s.key).toBeGreaterThanOrEqual(3);
    }
    expect(hidden.sort()).toEqual(["eight-box", "gk-build"]);
  });
});
