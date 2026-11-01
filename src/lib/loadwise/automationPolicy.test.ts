import { describe, expect, it } from "vitest";
import { resolveMdPlusOne } from "./automationPolicy";

describe("MD+1 uses observations instead of assuming good readiness", () => {
  it.each([null, Number.NaN, 0, 11])("does not infer readiness from missing/invalid score %s", readiness => {
    const result = resolveMdPlusOne(10, readiness);
    expect(result.mode).toBe("mixed");
    expect(result.durationMin).toBe(25);
    expect(result.reason).toMatch(/Brak oceny gotowości/);
  });

  it.each([null, Number.NaN, -1])("does not treat unknown match minutes %s as a short appearance", minutes => {
    expect(resolveMdPlusOne(minutes, 8).mode).toBe("mixed");
    expect(resolveMdPlusOne(minutes, 8).reason).toMatch(/Brakuje minut/);
  });

  it.each([[60, null], [90, 8], [10, 5], [null, 3]] as const)(
    "preserves recovery from the known limiting observation: minutes %s, readiness %s", (minutes, readiness) => {
      expect(resolveMdPlusOne(minutes, readiness)).toMatchObject({ mode: "recovery", durationMin: 20 });
    },
  );

  it.each([6, 8, 10])("only offers compensation after a known readiness %s and short appearance", readiness => {
    expect(resolveMdPlusOne(10, readiness)).toMatchObject({ mode: "compensation", durationMin: 35 });
  });

  it("keeps the middle match exposure light even at good readiness", () => {
    expect(resolveMdPlusOne(45, 8)).toMatchObject({ mode: "mixed", durationMin: 25 });
  });
});
