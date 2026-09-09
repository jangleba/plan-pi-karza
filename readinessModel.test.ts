import { describe, expect, it } from "vitest";
import { buildReadiness, calculateOverallReadiness } from "./readinessModel";

describe("short readiness check-in", () => {
  it("wylicza gotowość z czterech krótkich odpowiedzi", () => {
    expect(calculateOverallReadiness({ sleep: 8, energy: 7, fatigue: 3, jointPain: 0 })).toBe(9);
  });

  it("zapisuje obszar tylko przy zgłoszonym dyskomforcie", () => {
    expect(buildReadiness("2026-09-06", { sleep: 7, energy: 7, fatigue: 4, jointPain: 0, painLocation: "knee" }).painLocation).toBeNull();
    expect(buildReadiness("2026-09-06", { sleep: 7, energy: 7, fatigue: 4, jointPain: 5, painLocation: "knee" }).painLocation).toBe("knee");
  });
});
