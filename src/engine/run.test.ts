import { describe, expect, it } from "vitest";
import { calcMas } from "./mas";
import { masTestSession, runSession } from "./run";

const mas = calcMas(1500); // 5 m/s, 18 km/h

describe("sesje biegowe", () => {
  it("objętość: długie interwały 90% MAS, 450 m w 3 minuty", () => {
    const s = runSession(mas, "volume", "intermediate");
    expect(s.title).toBe("Interwały długie");
    expect(s.blocks[0]!.distanceM).toBe(810);
    expect(s.blocks[0]!.reps).toBe(4);
  });
  it("intensywność: 15/15 przy 105% MAS", () => {
    const s = runSession(mas, "intensity", "advanced");
    expect(s.blocks[0]!.distanceM).toBe(79);
    expect(s.blocks[0]!.reps).toBe(12);
  });
  it("rozładowanie: bieg ciągły 68% MAS", () => {
    const s = runSession(mas, "deload", "beginner");
    expect(s.blocks[0]!.percentMas).toBe(68);
    expect(s.blocks[0]!.reps).toBe(1);
  });
  it("check-in mocny: spokojny bieg zamiast interwałów", () => {
    const s = runSession(mas, "intensity", "advanced", { recovery: 1, feeling: 1, less: false });
    expect(s.title).toBe("Bieg ciągły spokojny");
    expect(s.notes.length).toBeGreaterThan(0);
  });
  it("check-in lekki: mniej powtórzeń", () => {
    const s = runSession(mas, "intensity", "advanced", { recovery: 3, feeling: 3, less: true });
    expect(s.blocks[0]!.reps).toBe(9);
  });
  it("test MAS", () => {
    expect(masTestSession().isTest).toBe(true);
  });
});
