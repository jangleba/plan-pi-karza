/**
 * FuelWise — typy danych.
 * Moduł jest w pełni deterministyczny: każdy werdykt powstaje z danych
 * wejściowych i reguł zapisanych w `engine.ts`. Brak losowości i placeholderów.
 */

export type SessionKind =
  | "match"
  | "strength"
  | "speed"
  | "endurance"
  | "football"
  | "recovery"
  | "none";

export type SessionIntensity = "niska" | "umiarkowana" | "wysoka";

/** Porcja deklarowana przez zawodnika. */
export type Portion = "mala" | "normalna" | "duza";

/** Odpowiedź na jedyne pytanie, gdy aplikacja nie zna godziny startu. */
export type TimeBucket = "lt30" | "30_60" | "60_120" | "120_240" | "gt240";

/** Najbliższa jednostka — czytana z modułu Plan przez adapter (read-only). */
export interface FuelSessionInput {
  kind: SessionKind;
  intensity: SessionIntensity | null;
  durationMin: number | null;
  /** Minuty pozostałe do startu (>= 0) — null, gdy aplikacja nie zna godziny. */
  minutesToStart: number | null;
  title: string | null;
  subtitle: string | null;
  date: string | null;
  /** Godzina startu w formacie HH:MM, jeśli faktycznie istnieje w danych. */
  startClock: string | null;
  dayLabel: string | null;
}

/** Kontekst zawodnika — wyłącznie dane, które aplikacja już zna. */
export interface FuelAthleteContext {
  age: number | null;
  position: string | null;
  level: string | null;
  goal: string | null;
  restrictions: string[];
}

export type FoodRole =
  | "carb_fast"
  | "carb_slow"
  | "protein"
  | "fat"
  | "fiber"
  | "drink"
  | "caffeine"
  | "sweets";

export interface ParsedFoodItem {
  key: string;
  label: string;
  roles: FoodRole[];
  /** Obciążenie trawienne pozycji (0–4). */
  heaviness: number;
}

export interface ParsedMeal {
  raw: string;
  items: ParsedFoodItem[];
  unrecognized: string[];
  carbFast: ParsedFoodItem[];
  carbSlow: ParsedFoodItem[];
  protein: ParsedFoodItem[];
  fatHeavy: ParsedFoodItem[];
  fiber: ParsedFoodItem[];
  drinks: ParsedFoodItem[];
  caffeine: ParsedFoodItem[];
  sweets: ParsedFoodItem[];
  /** Sumaryczna ciężkość trawienna 0–10 (bez porcji). */
  heaviness: number;
  hasCarbs: boolean;
  recognized: boolean;
}

export interface FuelRequest {
  session: FuelSessionInput;
  athlete: FuelAthleteContext;
  meal: ParsedMeal;
  portion: Portion;
  /** Wybrany zakres czasu, gdy godzina startu nie jest znana. */
  timeBucket: TimeBucket | null;
  /** Tryb „Mam tylko to” — optymalizujemy wpisany zestaw. */
  onlyThis: boolean;
}

export type Verdict = "PASUJE" | "POPRAW" | "ZOSTAW_NA_POZNIEJ";

export interface FuelResult {
  verdict: Verdict;
  ruleId: string;
  /** Maks. 2 zdania. */
  why: string;
  /** Elementy pasujące do tego momentu. */
  keep: string[];
  /** Jedna najważniejsza korekta. */
  change: string | null;
  /** Konkretna wersja wpisanego posiłku. */
  bestVersion: string;
  /** Maksymalnie jedna alternatywa. */
  alternative: string | null;
  /** Tryb „Mam tylko to”. */
  onlyThis: {
    eatNow: string[];
    eatLess: string[];
    later: string[];
  } | null;
  minutesToStart: number;
  requiredLeadMinutes: number;
}
