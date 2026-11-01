import { describe, expect, it } from "vitest";
import { buildReadiness, calculateOverallReadiness, hasMedicalRedFlag } from "./readinessModel";

describe("short readiness check-in", () => {
  it("wylicza gotowość z pięciu krótkich odpowiedzi", () => {
    expect(
      calculateOverallReadiness({ sleep: 8, fatigue: 3, soreness: 3, stress: 3, jointPain: 0 }),
    ).toBe(8);
  });

  it("zapisuje obszar tylko przy zgłoszonym dyskomforcie", () => {
    const base = { sleep: 7, fatigue: 4, soreness: 3, stress: 3 };
    expect(
      buildReadiness("2026-09-06", { ...base, jointPain: 0, painLocation: "knee" }).painLocation,
    ).toBeNull();
    expect(
      buildReadiness("2026-09-06", { ...base, jointPain: 5, painLocation: "knee" }).painLocation,
    ).toBe("knee");
  });

  it("usuwa nieaktualne szczegóły bólu, ale zachowuje niezależny sygnał alarmowy", () => {
    const r = buildReadiness("2026-09-06", {
      sleep: 7,
      fatigue: 4,
      soreness: 3,
      stress: 3,
      jointPain: 0,
      painOnset: "today",
      altersMovement: true,
      redFlags: ["fainting"],
    });
    expect(r.painOnset).toBeNull();
    expect(r.altersMovement).toBe(false);
    expect(r.redFlags).toEqual(["fainting"]);
    expect(r.overall).toBe(1);
  });

  it("nie ukrywa pojedynczej bardzo złej odpowiedzi w średniej", () => {
    const rested = { sleep: 8, fatigue: 2, soreness: 2, jointPain: 0 };
    expect(calculateOverallReadiness({ ...rested, sleep: 1 })).toBeLessThanOrEqual(3);
    expect(calculateOverallReadiness({ ...rested, fatigue: 9 })).toBeLessThanOrEqual(3);
    expect(calculateOverallReadiness({ ...rested, soreness: 9 })).toBeLessThanOrEqual(3);
    expect(calculateOverallReadiness({ ...rested, jointPain: 7 })).toBeLessThanOrEqual(3);
  });

  it("nie dopisuje dobrej oceny stresu, którego nie zapytano", () => {
    const input = { sleep: 5, fatigue: 5, soreness: 5, jointPain: 0 };
    expect(calculateOverallReadiness(input)).toBe(7);
    expect(buildReadiness("2026-11-02", input).stress).toBe(5);
  });

  it("wykrywa zamkniętą listę sygnałów alarmowych", () => {
    expect(hasMedicalRedFlag({ redFlags: [] })).toBe(false);
    expect(hasMedicalRedFlag({ redFlags: ["chest_pain"] })).toBe(true);
  });
});
