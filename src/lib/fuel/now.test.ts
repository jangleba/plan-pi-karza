import { describe, expect, it } from "vitest";
import { findRecipe, RECIPES } from "./catalog";
import {
  emptyFuelData,
  localDate,
  manualFuelContext,
  readFuelData,
  writeFuelData,
  type FuelEntry,
} from "./experience";
import { fuelChoiceReason, provenFuelSets, retimeFuelEntries } from "./now";
import { createRecipeEntry, practicalRecipes, relativeFuelTiming } from "./practical";

const now = new Date("2026-11-12T12:00:00").getTime();
const match = manualFuelContext(localDate(now), "match", 90, "high");
const pasta = findRecipe("pasta-tuna") ?? RECIPES.find((r) => !r.snack)!;
const snack = RECIPES.find((r) => r.snack)!;

function eaten(
  id: string,
  recipeId: string,
  at: number,
  extra: Partial<FuelEntry> = {},
): FuelEntry {
  return {
    ...createRecipeEntry(findRecipe(recipeId)!, match.key, "eaten", at, id),
    phase: "before",
    ...extra,
  };
}

describe("fuelChoiceReason", () => {
  it("is one sentence tied to the time left and the session", () => {
    const reason = fuelChoiceReason({
      context: match,
      timing: relativeFuelTiming(120, now)!,
      now,
      recipe: pasta,
    });
    expect(reason.startsWith("Do meczu 2 h:")).toBe(true);
    expect(reason.match(/\./g)).toHaveLength(1);
  });
  it("close to the start only claims low fat and fibre when the set really is", () => {
    const reason = fuelChoiceReason({
      context: match,
      timing: relativeFuelTiming(45, now)!,
      now,
      recipe: snack,
    });
    expect(reason).toMatch(/^Do meczu 45 min: /);
  });
  it("after the session names carbohydrates and protein only when both are there", () => {
    const after = { startsAt: null, phase: "after" as const };
    const withProtein = RECIPES.find(
      (r) => r.lines.some((l) => l.foodId === "skyr") && r.lines.some((l) => l.foodId === "banana"),
    );
    if (withProtein)
      expect(fuelChoiceReason({ context: match, timing: after, now, recipe: withProtein })).toBe(
        "Po meczu: węglowodany i białko na regenerację.",
      );
    expect(
      fuelChoiceReason({
        context: match,
        timing: after,
        now,
        recipe: { lines: [{ foodId: "banana", grams: 120 }] },
      }),
    ).toBe("Po meczu: szybkie węglowodany. Dodaj źródło białka.");
  });
});

describe("provenFuelSets", () => {
  const prefs = emptyFuelData().preferences;
  it("ranks repeated sets first, keeps edited portions and skips sets marked heavy", () => {
    const edited = eaten("a", pasta.id, now - 3_600_000);
    edited.lines = edited.lines.map((l) => ({ ...l, grams: l.grams * 2 }));
    const entries = [
      eaten("b", snack.id, now - 7_200_000),
      eaten("c", snack.id, now - 86_400_000),
      edited,
      eaten("d", RECIPES[2].id, now - 9_000_000, { feedback: "heavy" }),
      eaten("e", RECIPES[2].id, now - 99_000_000),
    ];
    const proven = provenFuelSets(entries, prefs, []);
    expect(proven[0]).toMatchObject({ times: 2 });
    expect(proven[0].entry.id).toBe("b");
    expect(proven.find((p) => p.entry.id === "a")?.entry.lines).toEqual(edited.lines);
    expect(proven.some((p) => p.entry.recipeId === RECIPES[2].id)).toBe(false);
  });
  it("leaves out sets with a product the athlete now dislikes", () => {
    const entry = eaten("a", pasta.id, now - 3_600_000);
    const disliked = { ...prefs, excludedFoodIds: [entry.lines[0].foodId] };
    expect(provenFuelSets([entry], disliked, [])).toHaveLength(0);
  });
});

describe("retimeFuelEntries", () => {
  it("keeps every entry when the start moves and corrects only minutes before", () => {
    const meal = eaten("a", pasta.id, now - 60 * 60_000, { minutesBefore: 120 });
    const other = { ...eaten("b", snack.id, now - 30 * 60_000), contextKey: "other" };
    const moved = relativeFuelTiming(180, now)!;
    const next = retimeFuelEntries([meal, other], match.key, moved);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ id: "a", minutesBefore: 240, title: meal.title });
    expect(next[1]).toBe(other);
  });
  it("does nothing for an ordinary meal or an unknown start", () => {
    const entries = [eaten("a", pasta.id, now - 60_000, { minutesBefore: 10 })];
    expect(retimeFuelEntries(entries, match.key, { startsAt: null, phase: "before" })).toBe(
      entries,
    );
    expect(retimeFuelEntries(entries, match.key, { startsAt: null, phase: "ordinary" })).toBe(
      entries,
    );
  });
});

describe("remembered fit and comfortable sets", () => {
  it("stores today's fit and pantry with the selection and drops invalid ones", () => {
    const data = emptyFuelData();
    data.selection = {
      date: localDate(now),
      contextKey: null,
      manualKind: "match",
      manualDurationMin: 90,
      manualLoad: "high",
      fit: "own",
      pantry: ["rice", "eggs"],
    };
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeFuelData(storage, "u", data, now);
    expect(readFuelData(storage, "u", now).selection).toMatchObject({
      fit: "own",
      pantry: ["rice", "eggs"],
    });
    const raw = JSON.parse(store.get("ballwise:fuel:v3:u")!);
    raw.selection.fit = "everything";
    store.set("ballwise:fuel:v3:u", JSON.stringify(raw));
    expect(readFuelData(storage, "u", now).selection).toBeNull();
  });
  it("brings a set marked comfortable forward in the ranking", () => {
    const timing = relativeFuelTiming(240, now)!;
    const data = emptyFuelData();
    const base = practicalRecipes({ context: match, timing, now, data });
    const later = base[base.length - 1];
    const before = base.indexOf(later);
    data.entries = [
      {
        ...eaten("x", later.id, now - 5 * 86_400_000),
        feedback: "comfortable",
      },
    ];
    const ranked = practicalRecipes({ context: match, timing, now, data });
    expect(ranked.indexOf(later)).toBeLessThan(before);
  });
});
