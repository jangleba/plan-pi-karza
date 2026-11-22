/** Sprzęt, którego zawodnik NIE ma (np. trap bar, piłka lekarska). Zapis lokalny, bez synchronizacji. */
import { scoped } from "./store";
import { GEAR, type Gear } from "../engine/gear";

const KEY = "missingGear";
const VALID = new Set<string>(GEAR.map(([g]) => g));

export function loadMissingGear(): Gear[] {
  try {
    const v: unknown = JSON.parse(scoped.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? [...new Set(v.filter((x): x is Gear => typeof x === "string" && VALID.has(x)))] : [];
  } catch { return []; }
}
export function saveMissingGear(g: Gear[]): void { scoped.setItem(KEY, JSON.stringify(g)); }
