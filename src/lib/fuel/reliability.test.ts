import { describe, expect, it } from "vitest";
import {
  CorruptFuelDataError,
  createFuelBackup,
  emptyFuelData,
  readFuelData,
  readFuelBackup,
  writeFuelData,
} from "./experience";
import { completeMeal, createRecipeEntry, fuelEntryAllowed } from "./practical";
import { FOOD_BY_ID, RECIPES, foodAllowed } from "./catalog";
describe("Fuel durable exact entries", () => {
  it.each(["{bad json", JSON.stringify({ version: 4 })])(
    "preserves unsupported or corrupt raw data: %s",
    (value) => {
      const storage = { getItem: () => value };
      expect(() => readFuelData(storage, "u")).toThrow(CorruptFuelDataError);
    },
  );
  it("applies milk/gluten/vegan/excluded-food restrictions to completion suggestions", () => {
    const p = emptyFuelData().preferences;
    const milk = completeMeal([{ foodId: "rice", grams: 150 }], p, "after", ["mleko"]);
    expect(milk?.foodId).toBe("tofu");
    const gluten = completeMeal([{ foodId: "tofu", grams: 150 }], p, "after", ["gluten"]);
    expect(foodAllowed(FOOD_BY_ID[gluten!.foodId], ["gluten"], "all")).toBe(true);
    p.diet = "vegan";
    p.excludedFoodIds = ["tofu"];
    expect(completeMeal([{ foodId: "rice", grams: 150 }], p, "after", ["mleko"])).toBeNull();
  });
  it("backs up exact edited portions and preferences, while respecting later exclusions", () => {
    const data = emptyFuelData();
    const entry = createRecipeEntry(RECIPES[0], "today", "selected", Date.now(), "one");
    entry.lines = entry.lines.map((line) => ({ ...line, grams: line.grams * 2 }));
    data.entries = [entry];
    data.preferences.portable = true;
    const restored = readFuelBackup(createFuelBackup(data), "u");
    expect(restored.entries[0].lines).toEqual(entry.lines);
    expect(restored.preferences.portable).toBe(true);
    data.preferences.excludedFoodIds = [entry.lines[0].foodId];
    expect(fuelEntryAllowed(entry, data.preferences, [])).toBe(false);
  });
  it("reports failed persistence instead of claiming quota success", () => {
    expect(
      writeFuelData(
        {
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        },
        "u",
        emptyFuelData(),
      ),
    ).toBe(false);
  });
});
