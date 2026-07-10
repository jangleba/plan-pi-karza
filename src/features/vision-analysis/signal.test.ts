import { describe, it, expect } from "vitest";
import { movingAverage, derivative, interpolateShortGaps, argMin, argMax } from "./signal";

describe("signal", () => {
  it("wygładza ruchomą średnią", () => {
    const out = movingAverage([1, 2, 3, 4, 5], 3);
    expect(out).toHaveLength(5);
    expect(out[2]).toBeCloseTo(3, 5);
  });

  it("liczy pochodną po czasie", () => {
    const v = derivative([0, 1, 2, 3], [0, 1, 2, 3]);
    // stały przyrost 1/1 = 1
    expect(v[1]).toBeCloseTo(1, 5);
  });

  it("interpoluje krótkie luki, ale nie długie", () => {
    const short = interpolateShortGaps([1, NaN, 3], 3);
    expect(short[1]).toBeCloseTo(2, 5);
    const long = interpolateShortGaps([1, NaN, NaN, NaN, NaN, 6], 2);
    expect(Number.isNaN(long[2])).toBe(true);
  });

  it("znajduje min/max ignorując NaN", () => {
    expect(argMin([3, NaN, 1, 2])).toBe(2);
    expect(argMax([3, NaN, 1, 5])).toBe(3);
  });
});
