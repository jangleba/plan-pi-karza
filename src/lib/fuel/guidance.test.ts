import { describe, it, expect } from "vitest";
import {
  emptyFuelData,
  localDate,
  manualFuelContext,
  readFuelBackup,
  createFuelBackup,
  readFuelData,
  writeFuelData,
} from "./experience";
import { foodToleranceIds, fuelDayGuide } from "./guidance";
import { practicalRecipes, createRecipeEntry, relativeFuelTiming } from "./practical";
import { RECIPES } from "./catalog";
const now = new Date("2026-11-01T12:00:00").getTime();
const c = manualFuelContext(localDate(now), "match", 90, "high");
describe("Fuel contextual guide and compatible persistence", () => {
  it("does not invent missed meals or a hydration target", () => {
    const g = fuelDayGuide(c, relativeFuelTiming(120, now)!, now, emptyFuelData());
    expect(g.eaten).toContain("Nie masz dziś wpisanego");
    expect(g.eaten).not.toMatch(/nie jadłeś|brakuje.*g|odwodn/);
    expect(g.drinkMl).toBe(0);
  });
  it("shows the latest actual meal, a partial portion and only today's drinks for the chosen session", () => {
    const d = emptyFuelData();
    const a = createRecipeEntry(RECIPES[0], c.key, "eaten", now - 3600_000, "a");
    const b = { ...a, id: "b", eatenAt: now - 1000, fraction: 0.5 };
    d.entries = [a, b];
    d.drinks = [
      { id: "1", contextKey: c.key, at: now, ml: 250, kind: "water" },
      { id: "2", contextKey: "other", at: now, ml: 500, kind: "sports" },
    ];
    const g = fuelDayGuide(c, relativeFuelTiming(60, now)!, now, d);
    expect(g.last?.id).toBe("b");
    expect(g.eaten).toContain("50%");
    expect(g.drinkMl).toBe(250);
  });
  it("requires two days of recent eaten reports in the same timing window", () => {
    const t = relativeFuelTiming(30, now)!;
    const entry = {
      ...createRecipeEntry(RECIPES[0], c.key, "eaten", now - 60_000, "1"),
      feedback: "heavy" as const,
      phase: "before" as const,
      minutesBefore: 30,
    };
    expect(foodToleranceIds([entry], t, now)).toEqual([]);
    expect(
      foodToleranceIds([entry, { ...entry, id: "2", eatenAt: now - 86_400_000 }], t, now),
    ).toEqual([entry.recipeId]);
    expect(foodToleranceIds([entry, { ...entry, id: "2", minutesBefore: 180 }], t, now)).toEqual(
      [],
    );
    expect(foodToleranceIds([entry, { ...entry, id: "2", status: "selected" }], t, now)).toEqual(
      [],
    );
    expect(
      foodToleranceIds([entry, { ...entry, id: "2", feedback: "comfortable" }], t, now),
    ).toEqual([]);
  });
  it("uses snack candidates during activity, preserving restrictions", () => {
    const d = emptyFuelData();
    d.preferences.diet = "vegan";
    const choices = practicalRecipes({
      context: c,
      timing: { phase: "training", startsAt: now - 60_000 },
      now,
      data: d,
    });
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((r) => r.snack)).toBe(true);
  });
  it("reads an old v3 backup and roundtrips exact new drinks, context and future choices", () => {
    const d = emptyFuelData();
    delete d.drinks;
    expect(readFuelBackup(createFuelBackup(d), "u", now).drinks).toEqual([]);
    const e = {
      ...createRecipeEntry(RECIPES[0], "2026-11-02:planned:1", "selected", now, "future"),
      sessionKind: "match" as const,
    };
    d.entries = [e];
    d.drinks = [{ id: "d", contextKey: c.key, at: now, ml: 330, kind: "water" }];
    const restored = readFuelBackup(createFuelBackup(d), "u", now);
    expect(restored.entries[0]).toEqual(e);
    expect(restored.drinks).toEqual(d.drinks);
    const storage = {
      value: "",
      getItem() {
        return this.value;
      },
      setItem(_k: string, v: string) {
        this.value = v;
      },
    };
    expect(writeFuelData(storage, "u", d, now)).toBe(true);
    expect(readFuelData(storage, "u", now).drinks).toEqual(d.drinks);
  });
  it("rejects invalid drink amounts in backups rather than silently claiming a valid import", () => {
    const d = emptyFuelData();
    d.drinks = [{ id: "d", contextKey: c.key, at: now, ml: -1, kind: "water" }];
    expect(() => readFuelBackup(createFuelBackup(d), "u", now)).toThrow();
  });
});
