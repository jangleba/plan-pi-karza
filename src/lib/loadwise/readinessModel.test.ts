import { describe, expect, it } from "vitest";
import {
  buildReadiness,
  calculateOverallReadiness,
  hasMedicalRedFlag,
  readinessScore,
} from "./readinessModel";

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

  it("normalizuje odpowiedzi zależne od bólu przed policzeniem wyniku", () => {
    // Ból 5 → „zmienia mój ruch” → ból 0: ukryta odpowiedź nie może dawać overall=1.
    const r = buildReadiness("2026-11-16", {
      sleep: 8,
      fatigue: 3,
      soreness: 2,
      jointPain: 0,
      painLocation: "knee",
      painOnset: "today",
      altersMovement: true,
    });
    expect(r).toMatchObject({ painLocation: null, painOnset: null, altersMovement: false });
    expect(r.overall).toBeGreaterThan(1);
    expect(r.overall).toBe(
      calculateOverallReadiness({ sleep: 8, fatigue: 3, soreness: 2, jointPain: 0 }),
    );
    // Przy zgłoszonym bólu ten sam wybór nadal obniża wynik.
    expect(
      buildReadiness("2026-11-16", {
        sleep: 8,
        fatigue: 3,
        soreness: 2,
        jointPain: 3,
        altersMovement: true,
      }).overall,
    ).toBe(1);
  });

  it("odczyt zapisu daje ten sam wynik co zapis, bez wpływu zastępczego stresu", () => {
    const saved = buildReadiness("2026-11-16", { sleep: 3, fatigue: 8, soreness: 1, jointPain: 0 });
    expect(saved.overall).toBe(7);
    expect(saved.stress).toBe(5);
    expect(readinessScore(saved)).toBe(7);
  });

  it("odczyt nie podnosi zapisanego wyniku i odrzuca uszkodzone rekordy", () => {
    const saved = buildReadiness("2026-11-16", { sleep: 8, fatigue: 3, soreness: 2, jointPain: 0 });
    expect(readinessScore({ ...saved, overall: 3 })).toBe(3);
    expect(readinessScore({ ...saved, overall: 11 })).toBeUndefined();
    expect(readinessScore({ ...saved, redFlags: ["fainting"] })).toBe(1);
    expect(readinessScore(undefined)).toBeUndefined();
  });
});
