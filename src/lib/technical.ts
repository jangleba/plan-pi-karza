import { scoped } from "./store";
import { normalizeTechnicalSettings, validTechnicalDate, validTechnicalResult } from "../engine/technical/planner";
import type { TechnicalResult, TechnicalSettings } from "../engine/technical/types";

const SETTINGS_KEY = "technicalSettings:v2", RESULTS_KEY = "technicalResults:v2";
const read = (key: string): unknown => { try { return JSON.parse(scoped.getItem(key) ?? "null"); } catch { return null; } };
export const loadTechnicalSettings = (): TechnicalSettings => normalizeTechnicalSettings(read(SETTINGS_KEY));
export function saveTechnicalSettings(settings: TechnicalSettings): boolean {
  const text = JSON.stringify(normalizeTechnicalSettings(settings));
  scoped.setItem(SETTINGS_KEY, text);
  return scoped.getItem(SETTINGS_KEY) === text;
}
export function loadTechnicalResults(): TechnicalResult[] {
  const value = read(RESULTS_KEY);
  return Array.isArray(value) ? value.filter(validTechnicalResult).slice(-500) : [];
}
/** Jeden wynik na sesję, rodzinę i warunki; korekta zastępuje wpis. */
export function recordTechnicalResult(result: TechnicalResult, today: string): boolean {
  if (!validTechnicalResult(result) || !validTechnicalDate(today) || result.date > today) return false;
  const key = (r: TechnicalResult) => `${r.sessionId}|${r.progressionKey}`;
  const rows = [...loadTechnicalResults().filter((r) => key(r) !== key(result)), result].slice(-500);
  const text = JSON.stringify(rows);
  scoped.setItem(RESULTS_KEY, text);
  return scoped.getItem(RESULTS_KEY) === text;
}
