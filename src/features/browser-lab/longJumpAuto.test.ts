import { describe, expect, it } from "vitest";
import { selectLongJumpWindow, type PoseFrame } from "./longJumpAuto";

const pose = (frameIndex: number, x: number): PoseFrame => ({
  frameIndex,
  hip: [x, 0.45],
  shoulders: [x, 0.25],
  heels: [
    [x - 0.02, 0.82],
    [x + 0.02, 0.82],
  ],
  toes: [
    [x - 0.01, 0.84],
    [x + 0.03, 0.84],
  ],
  confidence: 0.9,
  bodyHeight: 0.6,
});

describe("automatic long-jump event proposal", () => {
  it("selects the last stable start and first stable landing around a forward displacement", () => {
    const x = [0.2, 0.2, 0.205, 0.21, 0.3, 0.48, 0.68, 0.79, 0.8, 0.802, 0.801, 0.8];
    const selected = selectLongJumpWindow(x.map((value, index) => {
      const p = pose(10 + index * 10, value);
      if (index >= 4 && index <= 6) {p.hip[1] -= 0.12;p.toes = p.toes.map(([x,y])=>[x,y-0.15]) as PoseFrame["toes"];}
      return p;
    }));
    expect(selected.start.frameIndex).toBe(40);
    expect(selected.end.frameIndex).toBe(80);
    expect(selected.confidence).toBe(0.9);
  });
  it("refuses a clip without a clear forward jump", () => {
    expect(() =>
      selectLongJumpWindow(Array.from({ length: 12 }, (_, index) => pose(index * 10 + 1, 0.3))),
    ).toThrow("wyraźnego skoku");
  });
});
