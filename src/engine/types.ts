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
}

export interface WeekPlan {
  days: DayPlan[];
  warnings: string[];
}
