import { describe, expect, it } from "vitest";
import {
  emptyFuelData,
  localDate,
  manualFuelContext,
  minutesToFuelStart,
  readFuelData,
  resolveFuelTiming,
  writeFuelData,
} from "./experience";
import {
  chooseFuelContext,
  completeMeal,
  createRecipeEntry,
  practicalRecipes,
  relativeFuelTiming,
} from "./practical";
import { RECIPES } from "./catalog";
const now = new Date("2026-10-14T12:00:00").getTime();
const context = manualFuelContext(localDate(now), "football", 60, "moderate");

describe("Fuel practical decisions", () => {
  it("stores an absolute start: after 20 minutes a chosen hour leaves 40 minutes", () => {
    const timing = relativeFuelTiming(60, now)!;
    expect(minutesToFuelStart(timing, now + 20 * 60_000)).toBe(40);
    expect(relativeFuelTiming(-1, now)).toBeNull();
    expect(relativeFuelTiming(30.5, now)).toBeNull();
  });
  it("does not mark a session completed just because the clock passed", () => {
    const timing = relativeFuelTiming(30, now)!;
    expect(minutesToFuelStart(timing, now + 31 * 60_000)).toBe(0);
    expect(resolveFuelTiming(context, timing).phase).toBe("before");
    expect(resolveFuelTiming({ ...context, completed: true, endedAt: now }, timing).phase).toBe(
      "after",
    );
  });
  it("chooses the second uncompleted session and still permits explicit selection of the first", () => {
    const first = { ...context, key: "first", completed: true };
    const second = { ...context, key: "second", kind: "strength" as const };
    expect(chooseFuelContext([first, second], null, context.date)?.key).toBe("second");
    expect(chooseFuelContext([first, second], "first", context.date)?.key).toBe("first");
  });
  it("removes every occurrence of an excluded ingredient and applies the exclusion to repeat candidates", () => {
    const data = emptyFuelData();
    data.preferences.excludedFoodIds = ["banana", "skyr"];
    const options = practicalRecipes({ context, timing: relativeFuelTiming(120, now)!, data, now });
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((r) => r.lines.every((l) => !["banana", "skyr"].includes(l.foodId)))).toBe(
      true,
    );
  });
  it("offers a quick snack close to training and never overrides a vegan choice", () => {
    const data = emptyFuelData();
    data.preferences.diet = "vegan";
    const options = practicalRecipes({
      context,
      timing: relativeFuelTiming(30, now)!,
      data,
      now,
      quick: true,
    });
    expect(options.every((r) => r.snack && r.prepMin <= 5)).toBe(true);
    expect(options.some((r) => r.id === "banana-plain-ricecakes")).toBe(true);
    const addition = completeMeal([{ foodId: "rice", grams: 150 }], data.preferences, "after");
    expect(addition?.foodId).toBe("tofu");
  });
  it("keeps planned and eaten entries separate; migrates old v3 preferences without inventing exclusions", () => {
    const data = emptyFuelData();
    data.entries = [createRecipeEntry(RECIPES[0], context.key, "selected", now, "one")];
    const storage = {
      value: "",
      setItem(_k: string, value: string) {
        this.value = value;
      },
      getItem() {
        return this.value;
      },
    };
    writeFuelData(storage, "u1", data, now);
    const restored = readFuelData(storage, "u1", now);
    expect(restored.entries[0].eatenAt).toBeNull();
    const legacy = JSON.parse(storage.value);
    delete legacy.preferences.excludedFoodIds;
    storage.value = JSON.stringify(legacy);
    expect(readFuelData(storage, "u1", now).preferences.excludedFoodIds).toEqual([]);
  });
});
