export type Level = "beginner" | "intermediate" | "advanced";

export type SessionKind =
  | "strength"
  | "run"
  | "sprint"
  | "technique"
  | "activation"
  | "recovery";

/** Warianty sesji wynikające z reguł dnia meczowego. */
export type SessionVariant = "full" | "upper" | "light";

export interface IndividualSession {
  kind: SessionKind;
  variant: SessionVariant;
  /** Powód po polsku – pokazywany zawodnikowi. */
  reason: string;
  /** Dzień (ISO), z którego sesja została przełożona (zawodnik zgłosił, że wtedy nie zrobi siły). */
  movedFrom?: string;
}

export type Phase = "MD" | "MD-1" | "MD-2" | "MD-3" | "MD+1" | "MD+2" | "free" | "congested";

export interface DayPlan {
  /** Data ISO (YYYY-MM-DD). */
  date: string;
  phase: Phase;
  isMatch: boolean;
  isClub: boolean;
  /** Dzień całkowicie niedostępny: żadnych treningów indywidualnych. */
  isOff?: boolean;
  /** Maksymalnie jedna sesja indywidualna (klubowy + 1 indywidualny = 2 w dniu). */
  session: IndividualSession | null;
}

/** Moment w sezonie. */
export type Season = "preseason" | "inseason" | "offseason";
/** Cel zawodnika na sezon. */
export type SeasonGoal = "speed" | "strength" | "endurance" | "return";

export interface WeekInput {
  /** Poniedziałek tygodnia, ISO. */
  weekStart: string;
  matches: string[];
  clubDays: string[];
  level: Level;
  /** Zawodnik ma mało dni na siłownię – wtedy siła pełna także w MD+1. */
  limitedGymAccess: boolean;
  /** Domyślnie „w sezonie". */
  season?: Season;
  goal?: SeasonGoal;
  /** Drugi cel: dodatkowa sesja tylko, gdy zostanie wolne miejsce. */
  goal2?: SeasonGoal;
  /** Dni niedostępne (ISO). */
  offDays?: string[];
  /**
   * Staż siłowy w latach. Siła dzień po meczu (MD+1) jest ostatnią opcją i wolno ją planować dopiero od `MD1_STRENGTH_MIN_YEARS` lat stażu.
   * Brak wartości = zachowanie dawne (dzień po meczu dozwolony).
   */
  strengthYears?: number;
  /** Dni (ISO), w które zawodnik może iść na siłownię („tylko kilka razy w tygodniu”). Brak = każdy dzień. */
  gymDays?: string[];
  /**
   * Dni, w których zawodnik zgłosił, że nie zrobi siły (check-in, plan): siła z takiego dnia jest przekładana na pierwszy dozwolony dzień
   * nie wcześniejszy niż `since` (dzień zgłoszenia). Dzięki temu przełożona siła zostaje na swoim miejscu także w kolejnych dniach.
   */
  noStrengthDays?: StrengthBlock[];
}

/** Zgłoszenie „w tym dniu nie zrobię siły”: `date` – dzień, którego dotyczy, `since` – dzień zgłoszenia (ISO). */
export interface StrengthBlock { date: string; since: string }

export interface WeekPlan {
  days: DayPlan[];
  warnings: string[];
}
