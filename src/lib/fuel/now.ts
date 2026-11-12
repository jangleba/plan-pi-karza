/**
 * "Co zjeść teraz?" — the short reason under the proposal, quick fits,
 * proven sets and retiming of history. Uses only the rules already used to
 * rank recipes (practical.ts, guidance.ts, catalog.assessMeal); no new
 * nutrition thresholds and no body-mass calculations.
 */
import { FOOD_BY_ID, mealNutrition, type FuelRecipe } from "./catalog";
import {
  minutesToFuelStart,
  type FuelContext,
  type FuelEntry,
  type FuelPreferences,
  type FuelTiming,
} from "./experience";
import { fuelEntryAllowed } from "./practical";

export type FuelFit = "quick" | "store" | "own";
export const FUEL_FITS: ReadonlyArray<{ id: FuelFit; label: string }> = [
  { id: "quick", label: "Mam 5 minut" },
  { id: "store", label: "W sklepie" },
  { id: "own", label: "Mam swoje" },
];
export function isFuelFit(value: unknown): value is FuelFit {
  return value === "quick" || value === "store" || value === "own";
}

export function fuelDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
}

/** One sentence: why this proposal fits the moment. Claims only what the lines satisfy. */
export function fuelChoiceReason(input: {
  context: FuelContext;
  timing: FuelTiming;
  now: number;
  recipe: Pick<FuelRecipe, "lines">;
  nextSession?: boolean;
}): string {
  const { context, timing, recipe } = input;
  const n = mealNutrition(recipe.lines);
  const roles = recipe.lines.map((l) => FOOD_BY_ID[l.foodId]?.role);
  const hasCarb = roles.some((r) => r === "carb" || r === "fruit");
  const hasProtein = roles.includes("protein");
  const match = context.kind === "match";
  if (timing.phase === "training") return "W przerwie: lekkie węglowodany, które już dobrze znasz.";
  if (timing.phase === "after") {
    const label = match ? "Po meczu" : "Po treningu";
    if (input.nextSession && hasCarb)
      return `${label}, przed kolejną sesją: węglowodany${hasProtein ? " i białko" : ""} na szybki powrót sił.`;
    if (hasCarb && hasProtein) return `${label}: węglowodany i białko na regenerację.`;
    if (hasProtein) return `${label}: białko na regenerację. Dodaj pieczywo lub owoc.`;
    return `${label}: szybkie węglowodany. Dodaj źródło białka.`;
  }
  if (timing.phase === "ordinary")
    return hasCarb && hasProtein
      ? "Zwykły posiłek: węglowodany i białko na jednym talerzu."
      : "Zwykły posiłek: dopasuj porcję do apetytu.";
  const minutes = minutesToFuelStart(timing, input.now);
  const until = match ? "Do meczu" : "Do treningu";
  if (minutes === null)
    return hasCarb
      ? `Przed ${match ? "meczem" : "treningiem"}: węglowodany na energię.`
      : "Ustaw godzinę startu, a dopasuję porcję.";
  if (minutes <= 60)
    return n && n.fat <= 10 && n.fiber <= 5
      ? `${until} ${fuelDuration(minutes)}: mała porcja węglowodanów, mało tłuszczu i błonnika.`
      : `${until} ${fuelDuration(minutes)}: mała, prosta porcja, którą dobrze znasz.`;
  if (minutes <= 180) {
    const light = n !== null && n.fat <= 15 && n.fiber <= 8;
    return `${until} ${fuelDuration(minutes)}: węglowodany na energię${light ? ", mało tłuszczu i błonnika" : ""}.`;
  }
  return `${until} ${fuelDuration(minutes)}: pełny posiłek z węglowodanami${hasProtein ? " i białkiem" : ""}${
    context.load === "high" && n && n.carbs >= 50 ? " na cały wysiłek" : ""
  }.`;
}

export interface ProvenFuelSet {
  entry: FuelEntry;
  times: number;
}

function setSignature(entry: Pick<FuelEntry, "recipeId" | "lines">) {
  return `${entry.recipeId}|${entry.lines
    .map((l) => `${l.foodId}:${Math.round(l.grams)}`)
    .sort()
    .join(",")}`;
}

/**
 * Sets the athlete actually ate and did not mark as heavy, most repeated first.
 * Exact edited portions are kept, so "Powtórz" brings back what worked.
 */
export function provenFuelSets(
  entries: FuelEntry[],
  preferences: FuelPreferences,
  restrictions: string[],
  limit = 3,
): ProvenFuelSet[] {
  const heavy = new Set(
    entries.filter((e) => e.status === "eaten" && e.feedback === "heavy").map(setSignature),
  );
  const groups = new Map<string, ProvenFuelSet>();
  for (const entry of entries) {
    if (entry.status !== "eaten" || entry.product || entry.eatenAt === null) continue;
    const key = setSignature(entry);
    if (heavy.has(key) || !fuelEntryAllowed(entry, preferences, restrictions)) continue;
    const group = groups.get(key);
    if (!group) groups.set(key, { entry, times: 1 });
    else {
      group.times += 1;
      if ((entry.eatenAt ?? 0) > (group.entry.eatenAt ?? 0)) group.entry = entry;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.times - a.times || (b.entry.eatenAt ?? 0) - (a.entry.eatenAt ?? 0))
    .slice(0, limit);
}

/**
 * The start time of a session changed: keep every entry, only correct how long
 * before the start each meal of that session was eaten.
 */
export function retimeFuelEntries(
  entries: FuelEntry[],
  contextKey: string,
  timing: FuelTiming,
): FuelEntry[] {
  if (timing.phase !== "before" || timing.startsAt === null) return entries;
  const startsAt = timing.startsAt;
  let changed = false;
  const next = entries.map((entry) => {
    if (
      entry.contextKey !== contextKey ||
      entry.status !== "eaten" ||
      entry.eatenAt === null ||
      (entry.phase !== undefined && entry.phase !== "before")
    )
      return entry;
    const gap = Math.ceil((startsAt - entry.eatenAt) / 60_000);
    const minutesBefore = gap >= 0 && gap <= 1440 ? gap : null;
    if (entry.minutesBefore === minutesBefore) return entry;
    changed = true;
    return { ...entry, minutesBefore };
  });
  return changed ? next : entries;
}
