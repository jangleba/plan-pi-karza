import { describe, expect, it } from "vitest";
import { parseRestDuration } from "./restTimer";

describe("rest prescriptions from paired strength blocks", () => {
  it("reads the prescribed range without treating the A2 exercise code as seconds", () => {
    expect(parseRestDuration("60–180 s do A2")).toBe(120);
    expect(parseRestDuration("Przerwa po A1/A2: 2–4 min")).toBe(180);
  });
  it("keeps mixed units and never invents a time for a manual cue", () => {
    expect(parseRestDuration("1 min 30 s")).toBe(90);
    expect(parseRestDuration("przejdź płynnie dalej do A2")).toBeNull();
  });
});
