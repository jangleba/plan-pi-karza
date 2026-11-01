import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROTOCOLS, attemptPlan, TEST_IDS } from "./protocols";
describe("Lab profile and printed calibration contract", () => {
  it("offers three CMJ, three jumps per leg, two sprints, two long jumps and two 505 per leg", () => {
    expect(attemptPlan(TEST_IDS)).toHaveLength(17);
    expect(PROTOCOLS.map((p) => p.id)).toEqual([
      "cmj",
      "single_leg_cmj",
      "sprint_10m",
      "standing_long_jump",
      "cod_505",
    ]);
    const expected = {
      cmj: [null, null, null],
      single_leg_cmj: ["left", "right", "left", "right", "left", "right"],
      sprint_10m: [null, null],
      standing_long_jump: [null, null],
      cod_505: ["left", "right", "left", "right"],
    };
    for (const id of TEST_IDS) expect(attemptPlan([id]).map((a) => a.side)).toEqual(expected[id]);
  });
  it("prints the physical 20 by 24 cm frame and names the 20 cm start edge unambiguously", () => {
    const start = readFileSync("public/lab-wzorzec.svg", "utf8");
    const range = readFileSync("public/lab-wzorzec-3m.svg", "utf8");
    for (const svg of [start, range]) {
      expect(svg).toContain('width="210mm" height="297mm"');
      expect(svg).toContain('x="5" y="39" width="200" height="240"');
      expect(svg).not.toContain("DŁUGA KRAWĘDŹ MUSI MIEĆ 20");
    }
    expect(start).toContain("LINIA START — 20,0 CM");
    // Centre of the 200 × 240 mm black frame at (5,39), in millimetres.
    expect(range).toContain('cx="105" cy="159"');
  });
});
