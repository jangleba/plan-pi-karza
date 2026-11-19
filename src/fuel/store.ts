import type { Favorites } from "../engine/favorites";
import type { Food } from "../engine/foods";
import type { Goal } from "../engine";
import { scoped } from "../lib/store";

/** Dziennik, woda, godziny i zakupy – zapis lokalny (do czasu konta). Klucze zgodne z poprzednią wersją Fuel („meals”, „fuelGoal”). */
export interface Meal { id: string; date: string; time: string; name: string; carb: number; protein: number; fat?: number; slot?: string }

function read<T>(key: string, fallback: T): T {
  try { const v = scoped.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write(key: string, v: unknown): void {
  try { scoped.setItem(key, JSON.stringify(v)); } catch { /* brak pamięci */ }
}

export function loadMeals(): Meal[] {
  const raw = read<Array<Partial<Meal>>>("meals", []);
  return raw.map((m, i) => ({ id: m.id ?? `${m.date}-${m.time}-${i}`, date: m.date ?? "", time: m.time ?? "00:00", name: m.name ?? "", carb: m.carb ?? 0, protein: m.protein ?? 0, fat: m.fat, slot: m.slot }));
}
export const saveMeals = (m: Meal[]) => write("meals", m);

/** Cel żywieniowy; dawny cel „Redukcja” został usunięty (aplikacja jest od 16 lat) – zapisana wartość wraca do „Utrzymanie”. */
export const loadGoal = (): Goal => (read<string>("fuelGoal", "maintain") === "gain" ? "gain" : "maintain");
export const saveGoal = (g: Goal) => write("fuelGoal", g);

export const loadWater = (date: string): number => read<number>(`water:${date}`, 0);
export const saveWater = (date: string, ml: number) => write(`water:${date}`, Math.max(0, ml));

/** Godzina treningu/meczu wybrana przez użytkownika dla danego dnia i rodzaju (HH:MM) lub null. */
export const loadStart = (date: string, key = "main"): string | null => read<string | null>(`fuelStart:${date}:${key}`, key === "main" ? read<string | null>(`fuelStart:${date}`, null) : null);
export const saveStart = (date: string, hhmm: string, key = "main") => write(`fuelStart:${date}:${key}`, hhmm);

export interface Recent { food: Food; g: number }
export const loadRecents = (): Recent[] => read<Recent[]>("fuelRecents", []);
export function pushRecent(r: Recent): void {
  const next = [r, ...loadRecents().filter((x) => x.food.id !== r.food.id)].slice(0, 8);
  write("fuelRecents", next);
}

export const loadChecked = (): string[] => read<string[]>("shopChecked", []);
export const saveChecked = (c: string[]) => write("shopChecked", c);

/** Zaznaczone rzeczy w torbie meczowej (po dacie meczu). */
export const loadBag = (date: string): string[] => read<string[]>(`bag:${date}`, []);
export const saveBag = (date: string, ids: string[]) => write(`bag:${date}`, ids);

/** Ulubione produkty i posiłki. */
export const loadFavs = (): Favorites => {
  const v = read<Partial<Favorites>>("fuelFavs", {});
  return { foods: Array.isArray(v.foods) ? v.foods : [], meals: Array.isArray(v.meals) ? v.meals : [] };
};
export const saveFavs = (f: Favorites) => write("fuelFavs", f);
