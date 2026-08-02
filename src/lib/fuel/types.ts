/**
 * Fuel Check — typy danych.
 * Moduł jest w pełni deterministyczny: każdy wynik liczbowy powstaje z danych
 * wejściowych i reguł zapisanych w `engine.ts`. Brak losowości i placeholderów.
 */

export type Sex = "male" | "female" | "unspecified";

export type SessionKind =
  | "match"
  | "strength"
  | "speed"
  | "endurance"
  | "football"
  | "recovery"
  | "none";

export type SessionIntensity = "niska" | "umiarkowana" | "wysoka";

export type MealSize = "none" | "liquid" | "small" | "medium" | "large";

/** Dane zawodnika — część pochodzi z onboardingu, część uzupełnia użytkownik. */
export interface FuelAthleteInput {
  age: number | null;
  sex: Sex | null;
  bodyMassKg: number | null;
  heightCm: number | null;
  position: string | null;
  level: string | null;
  goal: string | null;
}

/** Najbliższa jednostka — czytana z modułu Plan przez adapter (read-only). */
export interface FuelSessionInput {
  kind: SessionKind;
  intensity: SessionIntensity | null;
  durationMin: number | null;
  /** Minuty pozostałe do startu jednostki (>= 0). */
  minutesToStart: number | null;
  title: string | null;
}

/** Obciążenie tygodnia — liczone z planu (read-only). */
export interface FuelWeekLoadInput {
  hardSessions7d: number | null;
  totalMinutes7d: number | null;
}

/** Planowany wybór żywieniowy i kontekst żołądkowo-nawodnieniowy. */
export interface FuelIntakeInput {
  mealSize: MealSize | null;
  plannedCarbsG: number | null;
  fatFiberHeavy: boolean | null;
  caffeine: boolean | null;
  fluidTodayMl: number | null;
  lastMealMinutesAgo: number | null;
  gutIssues: boolean | null;
  restrictions: string[];
}

export interface FuelInput {
  athlete: FuelAthleteInput;
  session: FuelSessionInput;
  weekLoad: FuelWeekLoadInput;
  intake: FuelIntakeInput;
}

export type FuelComponentId = "carbs" | "timing" | "hydration" | "gut";

export interface FuelComponent {
  id: FuelComponentId;
  label: string;
  /** 0–25 punktów; null gdy brakuje danych do policzenia. */
  points: number | null;
  maxPoints: 25;
  /** Jawna reguła, z której wynika liczba. */
  ruleId: string;
  detail: string;
  missing: string[];
}

export interface FuelTargets {
  carbTargetG: number | null;
  carbRuleId: string;
  fluidTargetMl: number | null;
  fluidRuleId: string;
  /** Minimalny odstęp posiłek → wysiłek dla wybranej wielkości posiłku. */
  requiredLeadMinutes: number | null;
  leadRuleId: string;
}

export type FuelBand = "wysoka" | "dobra" | "srednia" | "niska" | "brak_danych";

export interface FuelAssessment {
  /** 0–100, przeskalowane po dostępnych komponentach; null gdy brak danych. */
  score: number | null;
  band: FuelBand;
  /** Udział danych, na których policzono wynik (0–100). */
  dataCompleteness: number;
  components: FuelComponent[];
  targets: FuelTargets;
  energyReadiness: number | null;
  discomfortRisk: number | null;
  hydrationPct: number | null;
  /** Zalecany moment spożycia — minuty przed startem jednostki. */
  eatBeforeStartMin: number | null;
  /** Zalecany moment spożycia jako godzina zegarowa, gdy znany start. */
  eatAtClock: string | null;
  mainProblem: FuelProblem | null;
  correction: FuelCorrection | null;
  missingData: string[];
}

export interface FuelProblem {
  ruleId: string;
  title: string;
  detail: string;
}

export interface FuelCorrection {
  ruleId: string;
  title: string;
  detail: string;
  /** Zmiana wejścia, którą stosuje symulacja „po korekcie”. */
  apply: (input: FuelInput) => FuelInput;
}

export interface FuelComparison {
  before: FuelAssessment;
  after: FuelAssessment | null;
  deltaScore: number | null;
}
