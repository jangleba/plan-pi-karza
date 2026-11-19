import type { Food } from "../engine/foods";
import type { Goal } from "../engine";

/** Dziennik, woda, godziny i zakupy – zapis lokalny (do czasu konta). Klucze zgodne z poprzednią wersją Fuel („meals”, „fuelGoal”). */
export interface Meal { id: string; date: string; time: string; name: string; carb: number; protein: number; slot?: string }

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* brak pamięci */ }
}

export function loadMeals(): Meal[] {
  const raw = read<Array<Partial<Meal>>>("meals", []);
  return raw.map((m, i) => ({ id: m.id ?? `${m.date}-${m.time}-${i}`, date: m.date ?? "", time: m.time ?? "00:00", name: m.name ?? "", carb: m.carb ?? 0, protein: m.protein ?? 0, slot: m.slot }));
}
export const saveMeals = (m: Meal[]) => write("meals", m);

export const loadGoal = (): Goal => read<Goal>("fuelGoal", "maintain");
export const saveGoal = (g: Goal) => write("fuelGoal", g);

export const loadWater = (date: string): number => read<number>(`water:${date}`, 0);
export const saveWater = (date: string, ml: number) => write(`water:${date}`, Math.max(0, ml));

/** Godzina treningu/meczu wybrana przez użytkownika dla danego dnia (HH:MM) lub null. */
export const loadStart = (date: string): string | null => read<string | null>(`fuelStart:${date}`, null);
export const saveStart = (date: string, hhmm: string) => write(`fuelStart:${date}`, hhmm);

export interface Recent { food: Food; g: number }
export const loadRecents = (): Recent[] => read<Recent[]>("fuelRecents", []);
export function pushRecent(r: Recent): void {
  const next = [r, ...loadRecents().filter((x) => x.food.id !== r.food.id)].slice(0, 8);
  write("fuelRecents", next);
}

export const loadChecked = (): string[] => read<string[]>("shopChecked", []);
export const saveChecked = (c: string[]) => write("shopChecked", c);
