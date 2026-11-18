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
  /** Maksymalnie jedna sesja indywidualna (klubowy + 1 indywidualny = 2 w dniu). */
  session: IndividualSession | null;
}

export interface WeekInput {
  /** Poniedziałek tygodnia, ISO. */
  weekStart: string;
  matches: string[];
  clubDays: string[];
  level: Level;
  /** Zawodnik ma mało dni na siłownię – wtedy siła pełna także w MD+1. */
  limitedGymAccess: boolean;
}

export interface WeekPlan {
  days: DayPlan[];
  warnings: string[];
}
