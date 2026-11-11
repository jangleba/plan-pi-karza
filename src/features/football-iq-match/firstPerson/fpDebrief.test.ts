import { describe, expect, it } from "vitest";
import {
  buildDebrief,
  modelInputs,
  OPTION_LABELS,
  PRINCIPLES,
  principleFor,
  shutSide,
} from "./fpDebrief";
import { FP_VARIANT_SEEDS, makeVariant } from "./fpVariants";
import { runSim, type FpInput } from "./fpSim";
import { evaluateOptions, sensibleOptions } from "./fpOptions";

// IQ teaches tactics only: no cues about body parts, and phone orientation is not "looking".
const BODY = /głow|biodr|ramię|ramion|barki|tułów|stop[aąy]|wzrok|oczy|spójrz|rozejrzyj|patrz/i;

describe("debrief after the action", () => {
  it("judges choice, execution and result separately", () => {
    const v = makeVariant(FP_VARIANT_SEEDS[0]);
    const model = modelInputs(v, principleFor(v));
    const d = buildDebrief(v, model);
    expect(d.choice.grade).toBe("good");
    expect(d.choice.text.length).toBeGreaterThan(5);
    expect(d.execution.text.length).toBeGreaterThan(5);
    expect(d.result.text.length).toBeGreaterThan(5);
    expect(d.tip.length).toBeGreaterThan(10);
    // A good choice stays good even when the action then fails: the choice is judged on a clean pass.
    expect(["good", "ok", "poor"]).toContain(d.execution.grade);
  });

  it("accepts more than one sensible decision", () => {
    let multi = 0;
    for (const seed of FP_VARIANT_SEEDS.slice(0, 6)) {
      const v = makeVariant(seed);
      const model = modelInputs(v, principleFor(v));
      const sensible = sensibleOptions(evaluateOptions(v, [model[0]!], model[1]!.tick));
      if (sensible.length >= 2) multi++;
      // A carry on its own never ends with a pass, so it is judged with the follow-up only in play.
      for (const o of sensible.filter((x) => x.key !== "carry")) {
        const d = buildDebrief(v, [model[0]!, o.input]);
        expect(d.choice.grade).not.toBe("poor");
      }
    }
    expect(multi).toBe(6);
  }, 60_000);

  it("names offside in the tip", () => {
    let found = false;
    for (const seed of FP_VARIANT_SEEDS) {
      if (found) break;
      const v = makeVariant(seed);
      const touch: FpInput = { tick: 20, kind: "touch", dir: -shutSide(v) };
      const base = runSim(v, [touch], { record: false });
      if (base.controlTick === null) continue;
      for (let k = 6; k < 200 && !found; k += 8) {
        for (const lofted of [false, true]) {
          const inputs: FpInput[] = [
            touch,
            {
              tick: base.controlTick + k,
              kind: "pass",
              aim: { kind: "player", id: "runner" },
              lofted,
            },
          ];
          const s = runSim(v, inputs, { record: false });
          if (s.outcome?.kind !== "offside") continue;
          found = true;
          expect(buildDebrief(v, inputs).tip).toMatch(/linią obrony/);
          break;
        }
      }
    }
    expect(found).toBe(true);
  }, 60_000);

  it("never gives body-detail cues in tips, principles or labels", () => {
    const texts = [
      ...Object.values(PRINCIPLES).flatMap((p) => [p.title, p.rule]),
      ...Object.values(OPTION_LABELS),
    ];
    for (const seed of FP_VARIANT_SEEDS.slice(0, 8)) {
      const v = makeVariant(seed);
      const touch: FpInput = { tick: 20, kind: "touch", dir: -shutSide(v) };
      const intoPress: FpInput = { tick: 20, kind: "touch", dir: shutSide(v) * 0.6 };
      for (const inputs of [[], [touch], [intoPress], modelInputs(v, principleFor(v))]) {
        const d = buildDebrief(v, inputs);
        texts.push(d.tip, d.choice.text, d.execution.text, d.result.text);
      }
    }
    for (const t of texts) expect(t).not.toMatch(BODY);
  }, 60_000);
});
