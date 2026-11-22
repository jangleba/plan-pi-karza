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
  /**
   * Dni, w których zawodnik zgłosił „nie mogę zrobić dzisiejszych treningów” (check-in, plan). Trening indywidualny z takiego dnia jest
   * przekładany na pierwszy dozwolony dzień nie wcześniejszy niż `since` (dzień zgłoszenia), dzięki czemu przełożona sesja zostaje na swoim
   * miejscu także w kolejnych dniach. Treningu klubowego nie przekładamy (prowadzi go trener).
   */
  skippedDays?: DaySkip[];
  /**
   * Obciążenie tygodnia z własnych jednostek zawodnika (poza aplikacją) i sesji już zrobionych: przy wysokim poziomie kolejne dni po `from`
   * dostają lżejsze wersje sesji, a przy bardzo wysokim także pierwszy wolny dzień zamienia się w regenerację.
   */
  weekLoad?: { level: "ok" | "high" | "veryHigh"; from: string };
}

/** Zgłoszenie „w tym dniu nie mogę trenować”: `date` – dzień, którego dotyczy, `since` – dzień zgłoszenia (ISO). */
export interface DaySkip { date: string; since: string }

/** Skutek zgłoszenia dla jednej sesji indywidualnej: dokąd trafiła (`to`) albo dlaczego nie (`dropped`, `needsYears`). */
export interface SkipMove {
  from: string;
  kind: SessionKind;
  /** Dzień, na który przełożono sesję; null, gdy się nie zmieściła albo nie jest przekładana. */
  to: string | null;
  /** Siła nie zmieściła się, a odblokowałby ją dopiero dzień po meczu przy stażu siłowym od tylu lat. */
  needsYears?: number;
}

export interface WeekPlan {
  days: DayPlan[];
  warnings: string[];
  /** Skutki zgłoszeń „nie mogę” (puste, gdy nic nie zgłoszono). */
  moves: SkipMove[];
}
