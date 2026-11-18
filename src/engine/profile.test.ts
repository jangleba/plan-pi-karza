import { describe, expect, it } from "vitest";
import { datesForWeek, levelOf, validateProfile, weekInCycle } from "./profile";

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
  it("numer tygodnia w cyklu od daty startu", () => {
    expect(weekInCycle("2026-11-18", "2026-11-16")).toBe(1);
    expect(weekInCycle("2026-11-18", "2026-11-23")).toBe(2);
    expect(weekInCycle("2026-11-18", "2026-12-14")).toBe(5);
    expect(weekInCycle("2026-11-18", "2026-12-21")).toBe(1);
    expect(weekInCycle(undefined, "2026-12-21")).toBe(1);
  });
});

import { matchesAround, nextWeekUnlocked } from "./profile";
import { phaseOf } from "./week";
import { sprintTemplateFor } from "./library";
import { positionRepDelta } from "./run";
import { drillsFor } from "./technique";
import { calcMas } from "./mas";
import { runSession } from "./run";

describe("luki silnika", () => {
  it("mecze z sąsiednich tygodni dają fazę MD+1 w poniedziałek po meczu w niedzielę", () => {
    const m = matchesAround("2026-11-23", [6]); // mecz w nd 22.11, nd 29.11, ...
    expect(phaseOf("2026-11-23", m)).toBe("MD+1");
    expect(phaseOf("2026-11-28", m)).toBe("MD-1");
  });
  it("kolejny tydzień odblokowany dopiero po ostatnim meczu", () => {
    expect(nextWeekUnlocked("2026-11-16", [5], "2026-11-21")).toBe(false);
    expect(nextWeekUnlocked("2026-11-16", [5], "2026-11-22")).toBe(true);
    expect(nextWeekUnlocked("2026-11-16", [1, 5], "2026-11-18")).toBe(false);
  });
  it("sprint wg pozycji: skrzydłowy prędkość, pomocnik przyspieszenie i COD; co 3. tydzień zamiana", () => {
    expect(sprintTemplateFor("skrzydlowy", 1)!.id).toBe("sprint-b");
    expect(sprintTemplateFor("pomocnik", 1)!.id).toBe("sprint-a");
    expect(sprintTemplateFor("skrzydlowy", 3)!.id).toBe("sprint-a");
  });
  it("bieganie: pomocnik +1, bramkarz −1 powtórzenie", () => {
    expect(positionRepDelta("pomocnik")).toBe(1);
    expect(positionRepDelta("bramkarz")).toBe(-1);
    const mas = calcMas(1500);
    const base = runSession(mas, "intensity", "intermediate").blocks[0]!.reps;
    expect(runSession(mas, "intensity", "intermediate", undefined, "pomocnik").blocks[0]!.reps).toBe(base + 1);
  });
  it("technika: ćwiczenia pozycji pierwsze, cudze pomijane", () => {
    const st = drillsFor("napastnik").map((d) => d.id);
    expect(st[0]).toBe("run-in-finish");
    expect(st).not.toContain("wall-passing");
    expect(drillsFor("pomocnik").map((d) => d.id)).toContain("wall-passing");
  });
});
