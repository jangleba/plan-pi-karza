import {
  FOOD_BY_ID,
  FOODS,
  mealNutrition,
  suggestRecipes,
  foodAllowed,
  type FuelRecipe,
} from "./catalog";
import { normalizeFuelText } from "./assistant";
import type { Profile } from "../loadwise/types";
import {
  localDate,
  minutesToFuelStart,
  type FuelContext,
  type FuelDeviceData,
  type FuelEntry,
  type FuelPreferences,
  type FuelTiming,
  type MealLine,
} from "./experience";
import { foodToleranceIds, sessionRecipeScore } from "./guidance";

export const FUEL_TIME_PRESETS = [30, 60, 120, 180] as const;

export function chooseFuelContext(
  contexts: FuelContext[],
  selected: string | null,
  date: string,
): FuelContext | null {
  const today = contexts.filter((c) => c.date === date);
  return (
    today.find((c) => c.key === selected) ?? today.find((c) => !c.completed) ?? today.at(-1) ?? null
  );
}

export function relativeFuelTiming(minutes: number, now: number): FuelTiming | null {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720 || !Number.isFinite(now))
    return null;
  return { phase: "before", startsAt: now + minutes * 60_000, presetMin: minutes };
}

export function foodPreferenceTerms(preferences: FuelPreferences): string[] {
  return preferences.excludedFoodIds
    .map((id) => FOOD_BY_ID[id]?.label)
    .filter((label): label is string => Boolean(label));
}

export function householdPortion(line: MealLine): string {
  const food = FOOD_BY_ID[line.foodId];
  if (!food) return `${Math.round(line.grams)} g`;
  const units = line.grams / food.unitGrams;
  const rounded = Math.round(units * 2) / 2;
  const count = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(rounded);
  if (food.id === "bread")
    return `≈ ${count} ${rounded === 1 ? "kromka" : rounded < 5 ? "kromki" : "kromek"}`;
  if (food.id === "banana") return `≈ ${count} ${rounded === 1 ? "banan" : "banany"}`;
  if (food.id === "eggs") return `≈ ${count} ${rounded === 1 ? "jajko" : "jajka"}`;
  if (food.id === "ricecakes") return `≈ ${count} wafle`;
  if (food.id === "skyr" && line.grams === 150) return "≈ 1 kubek 150 g";
  if (food.id === "cottage" && line.grams === 200) return "≈ 1 opakowanie 200 g";
  if (food.id === "juice" || food.id === "milk" || food.id === "kefir")
    return `${Math.round(line.grams)} g · sprawdź porcję na etykiecie`;
  if (food.unitLabel === "miseczki")
    return `≈ ${count} miseczki · ${Math.round(line.grams)} g po ugotowaniu`;
  return `${Math.round(line.grams)} g${food.state === "suche" ? " przed przygotowaniem" : ""}`;
}

export function practicalRecipes(input: {
  context: FuelContext;
  timing: FuelTiming;
  now: number;
  data: FuelDeviceData;
  pantry?: string[];
  quick?: boolean;
  store?: boolean;
  restrictions?: string[];
}): FuelRecipe[] {
  const p = input.data.preferences;
  const heavyRecipeIds = foodToleranceIds(
    input.data.entries,
    input.timing,
    input.now,
    input.context.kind,
  );
  const preferences = {
    ...p,
    quick: p.quick || Boolean(input.quick),
    noCook: p.noCook || Boolean(input.store),
    portable: p.portable || Boolean(input.store),
  };
  const candidates = suggestRecipes({
    context: input.context,
    timing: input.timing,
    now: input.now,
    preferences,
    restrictions: input.restrictions ?? [],
    pantry: input.pantry,
    heavyRecipeIds,
  });
  const minutes = minutesToFuelStart(input.timing, input.now);
  const recent = input.data.entries.filter(
    (e) =>
      e.status === "eaten" && e.eatenAt !== null && localDate(e.eatenAt) === localDate(input.now),
  );
  // Remembered preference: a set the athlete marked as comfortable comes back sooner.
  const comfortable = new Set(
    input.data.entries
      .filter((e) => e.status === "eaten" && e.feedback === "comfortable")
      .map((e) => e.recipeId),
  );
  return candidates
    .map((recipe, index) => {
      const n = mealNutrition(recipe.lines);
      const missing = input.pantry?.length
        ? recipe.lines.filter((l) => !input.pantry!.includes(l.foodId)).length
        : 0;
      const repeated = recent.filter((e) => e.recipeId === recipe.id).length;
      const hasProtein = recipe.lines.some((l) => FOOD_BY_ID[l.foodId]?.role === "protein");
      return {
        recipe,
        score:
          -index / 10 -
          missing * 8 -
          repeated * 4 +
          sessionRecipeScore(input.context, input.timing, recipe.lines) -
          (heavyRecipeIds.includes(recipe.id) ? 5 : 0) +
          (comfortable.has(recipe.id) && !heavyRecipeIds.includes(recipe.id) ? 2 : 0) +
          (input.timing.phase === "after" && hasProtein ? 4 : 0) +
          (minutes !== null && minutes <= 90 && n && n.fat <= 10 && n.fiber <= 5 ? 2 : 0) +
          (input.context.load === "high" && minutes !== null && minutes > 90 && n && n.carbs >= 50
            ? 2
            : 0) +
          (input.store && recipe.noCook ? 3 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.recipe);
}

export function completeMeal(
  lines: MealLine[],
  preferences: FuelPreferences,
  phase: FuelTiming["phase"],
  restrictions: string[] = [],
): { foodId: string; reason: string } | null {
  const hasCarb = lines.some((l) => ["carb", "fruit"].includes(FOOD_BY_ID[l.foodId]?.role));
  const hasProtein = lines.some((l) => FOOD_BY_ID[l.foodId]?.role === "protein");
  const options = !hasCarb
    ? ["bread", "banana", "rice", "ricecakes"]
    : (phase === "after" || phase === "ordinary") && !hasProtein
      ? ["skyr", "tofu", "eggs", "tuna"]
      : [];
  const foodId = options.find(
    (id) =>
      !preferences.excludedFoodIds.includes(id) &&
      foodAllowed(FOOD_BY_ID[id], restrictions, preferences.diet),
  );
  return foodId
    ? {
        foodId,
        reason: !hasCarb ? "Możesz dodać źródło węglowodanów." : "Możesz dodać źródło białka.",
      }
    : null;
}

export function createRecipeEntry(
  recipe: FuelRecipe,
  contextKey: string,
  status: FuelEntry["status"],
  now: number,
  id: string,
): FuelEntry {
  return {
    id,
    recipeId: recipe.id,
    title: recipe.title,
    lines: recipe.lines.map((line) => ({ ...line })),
    contextKey,
    status,
    createdAt: now,
    eatenAt: status === "eaten" ? now : null,
    fraction: 1,
    feedback: null,
  };
}

export function packList(
  recipe: Pick<FuelRecipe, "lines">,
): Array<{ label: string; portion: string }> {
  return recipe.lines.map((line) => ({
    label: FOOD_BY_ID[line.foodId]?.label ?? line.foodId,
    portion: householdPortion(line),
  }));
}

export function fuelEntryAllowed(
  entry: Pick<FuelEntry, "lines">,
  preferences: FuelPreferences,
  restrictions: string[],
) {
  return (
    entry.lines.length > 0 &&
    entry.lines.every(
      (line) =>
        Boolean(FOOD_BY_ID[line.foodId]) &&
        !preferences.excludedFoodIds.includes(line.foodId) &&
        foodAllowed(FOOD_BY_ID[line.foodId], restrictions, preferences.diet),
    )
  );
}

/**
 * Fuel no longer keeps allergy data. Older profiles may still carry free-text
 * allergy, intolerance or exclusion terms; they are turned once into the local
 * "Czego nie lubię" list (catalogue food IDs) and are not used in any other way.
 */
export function legacyDislikedFoodIds(profile: Profile | null): string[] {
  const terms = [
    ...(profile?.foodAllergies ?? []),
    ...(profile?.foodIntolerances ?? []),
    ...(profile?.foodExclusions ?? []),
  ]
    .map(normalizeFuelText)
    .filter(Boolean);
  if (!terms.length) return [];
  return FOODS.filter((food) => !foodAllowed(food, terms, "all")).map((food) => food.id);
}
