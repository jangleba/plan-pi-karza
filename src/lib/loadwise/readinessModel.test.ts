import { describe, expect, it } from "vitest";
import { buildReadiness, calculateOverallReadiness, hasMedicalRedFlag } from "./readinessModel";

describe("short readiness check-in", () => {
  it("wylicza gotowość z pięciu krótkich odpowiedzi", () => {
    expect(calculateOverallReadiness({ sleep: 8, fatigue: 3, soreness: 3, stress: 3, jointPain: 0 })).toBe(9);
  });

  it("zapisuje obszar tylko przy zgłoszonym dyskomforcie", () => {
    const base = { sleep: 7, fatigue: 4, soreness: 3, stress: 3 };
    expect(buildReadiness("2026-09-06", { ...base, jointPain: 0, painLocation: "knee" }).painLocation).toBeNull();
    expect(buildReadiness("2026-09-06", { ...base, jointPain: 5, painLocation: "knee" }).painLocation).toBe("knee");
  });

  it("nie zachowuje szczegółów bólu, gdy odpowiedź brzmi nie", () => {
    const r = buildReadiness("2026-09-06", {
      sleep: 7, fatigue: 4, soreness: 3, stress: 3, jointPain: 0,
      painOnset: "today", altersMovement: true, redFlags: ["fainting"],
    });
    expect(r.painOnset).toBeNull();
    expect(r.altersMovement).toBe(false);
    expect(r.redFlags).toEqual([]);
  });

  it("wykrywa zamkniętą listę sygnałów alarmowych", () => {
    expect(hasMedicalRedFlag({ redFlags: [] })).toBe(false);
    expect(hasMedicalRedFlag({ redFlags: ["chest_pain"] })).toBe(true);
  });
});
