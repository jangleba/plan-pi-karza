import { describe, expect, it } from "vitest";
import { datesForWeek, levelOf, validateProfile } from "./profile";

describe("profil", () => {
  it("poziom ze stażu i wieku", () => {
    expect(levelOf(25, 0)).toBe("beginner");
    expect(levelOf(25, 2)).toBe("intermediate");
    expect(levelOf(25, 5)).toBe("advanced");
    expect(levelOf(17, 5)).toBe("intermediate");
    expect(levelOf(16, 0)).toBe("beginner");
  });
  it("walidacja: 16+, maks. dwa mecze", () => {
    expect(validateProfile({ age: 15 })).toContain("Aplikacja jest dla zawodników od 16 lat.");
    const ok = { age: 20, strengthYears: 1, weightKg: 70, position: "pomocnik" as const, equipment: ["gym" as const], matchWeekdays: [5], clubWeekdays: [] };
    expect(validateProfile(ok)).toEqual([]);
    expect(validateProfile({ ...ok, matchWeekdays: [1, 3, 5] })).toContain("Maksymalnie dwa mecze w tygodniu.");
  });
  it("daty tygodnia z dni tygodnia", () => {
    expect(datesForWeek("2026-11-16", [1, 5])).toEqual(["2026-11-17", "2026-11-21"]);
  });
});
