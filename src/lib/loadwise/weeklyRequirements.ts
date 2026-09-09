// ============================================================
// Loadwise — centralny silnik minimalnych wymagań tygodniowych.
//
// JEDNO źródło prawdy dla: generatora planu, walidatora, naprawy planu i
// regeneracji. Wszystkie te miejsca muszą pytać ten moduł o to, ile i jakich
// sesji musi mieć dany tydzień, zamiast liczyć to lokalnie.
//
// Zasady twarde (pełny tydzień):
//   - 2 sesje gym_strength (niezależnie od sezonu, klubu, meczu, celu),
//   - minimum 1 sesja endurance_conditioning,
//   - minimum 1 sesja speed_sprint,
//   - minimum 1 własna sesja ball_technical (klub i mecz jej nie zastępują),
//   - cel szybkościowy → minimum 2 speed_sprint,
//   - cel wydolnościowy → liczba endurance zależy od liczby klubowych,
//   - wiek/poziom NIE kasują kategorii — zmieniają tylko treść/objętość/wariant,
//   - club liczy się do obciążenia, ale nie zastępuje własnego endurance;
//     komplementarny endurance może być drugim slotem u intermediate/advanced.
// ============================================================

import type { DevelopmentStage } from "./athleteProfile";

// ---------------------------------------------------------------------------
// Typy wejścia / wyjścia
// ---------------------------------------------------------------------------

/** Kontekst konkretnego tygodnia planu. */
export interface WeekRequirementContext {
  seasonPhase: string | null | undefined;
  /** Liczba treningów klubowych w tygodniu. */
  clubTrainingCount: number;
  /** Liczba meczów w tygodniu. */
  matchCount: number;
  /**
   * Czy to pełny tydzień treningowy (bez kongestii meczowej / roztrenowania).
   * Domyślnie true. Dla >=2 meczów lub okresu przejściowego przekaż false.
   */
  isFullWeek?: boolean;
}

/** Ustawienia zawodnika istotne dla wymagań (z onboardingu). */
export interface UserRequirementSettings {
  hasGym?: boolean;
  /** Dni treningów klubowych (1=pon … 7=niedz). Źródło prawdy dla liczby klubowych. */
  clubTrainingDays?: number[];
  /** Data najbliższego meczu (yyyy-MM-dd) — pomocnicza dla getMatchCount. */
  matchDate?: string | null;
}

/** Minimalny zestaw danych profilu atlety potrzebny do reguł. */
export interface AthleteRequirementProfile {
  developmentStage?: DevelopmentStage | null;
  /** Poziom bezpieczeństwa contentu: im młodszy/mniej doświadczony, tym niżej. */
  safetyLevel?: "youth_safe" | "developmental" | "performance" | null;
  gymExperienceLevel?: "none" | "beginner" | "intermediate" | "advanced" | null;
  /** Aktywny ból/ograniczenie zgłoszone przez zawodnika. */
  hasActivePain?: boolean;
}

export interface WeeklyRequirements {
  requiredGymSessions: number;
  requiredEnduranceSessions: number;
  absoluteMinimumEnduranceSessions: number;
  requiredSpeedSessions: number;
  requiredBallSessions: number;
  recommendedEnduranceSessions: number;
  recommendedSpeedSessions: number;
  forbidEnduranceOnClubDays: boolean;
  reason: string;
  goalDetected: string;
  isEnduranceGoal: boolean;
  isSpeedGoal: boolean;
  seasonPhase: string | null;
  clubTrainingCount: number;
  matchCount: number;
  athleteDevelopmentStage: DevelopmentStage | null;
  athleteSafetyLevel: "youth_safe" | "developmental" | "performance";
  requiresYouthSafeContent: boolean;
}

export interface AthleteGoalRules {
  goalDetected: string;
  isEnduranceGoal: boolean;
  isSpeedGoal: boolean;
  requiredSpeedSessions: number;
  /** Bazowa liczba endurance dla celu — dokładna wartość liczy tabela klubowa. */
  baseRequiredEnduranceSessions: number;
}

export interface SeasonPhaseRules {
  seasonPhase: string | null;
  /** Czy silnik może redukować intensywność/objętość zamiast usuwać kategorię. */
  allowIntensityReduction: boolean;
  /** Czy to sezon (in-season) — mimo redukcji nadal 2 gym / 1 end / 1 speed. */
  isInSeason: boolean;
  /** Roztrenowanie / powrót — pełne minima nie obowiązują. */
  isReducedLoadPhase: boolean;
}

// ---------------------------------------------------------------------------
// Wykrywanie celu zawodnika (PL + EN, po słowach kluczowych)
// ---------------------------------------------------------------------------

const SPEED_GOAL_KEYWORDS = [
  "szybko", // szybkość / szybki
  "przyspiesz", // przyspieszenie
  "speed",
  "sprint",
  "acceleration",
  "accel",
  "explosiv", // explosiveness
  "first step",
  "first_step",
  "max velocity",
  "max_velocity",
  "top speed",
  "top_speed",
  "change of direction",
  "cod",
  "agility",
  "zwrotno", // zwrotność
  "dynamik", // dynamika
];

const ENDURANCE_GOAL_KEYWORDS = [
  "wydolno", // wydolność
  "kondycj", // kondycja
  "endurance",
  "conditioning",
  "aerobic",
  "vo2",
  "wytrzyma", // wytrzymałość
  "stamina",
  "match fitness",
  "match_fitness",
  "przygotowanie motoryczne",
  "motoryczn",
];

function normalizeGoalString(goal: string | null | undefined): string {
  return (goal ?? "").toString().trim().toLowerCase();
}

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((k) => haystack.includes(k));
}

/**
 * Interpretuje cel zawodnika i zwraca wynikające z niego wymagania szybkości
 * i (bazowo) wydolności. Działa na dowolnym stringu celu (PL/EN, enum).
 */
export function getAthleteGoalRules(athleteGoal: string | null | undefined): AthleteGoalRules {
  const g = normalizeGoalString(athleteGoal);

  const isSpeedGoal = matchesAny(g, SPEED_GOAL_KEYWORDS);
  const isEnduranceGoal = matchesAny(g, ENDURANCE_GOAL_KEYWORDS);

  return {
    goalDetected: g || "general",
    isEnduranceGoal,
    isSpeedGoal,
    requiredSpeedSessions: isSpeedGoal ? 2 : 1,
    baseRequiredEnduranceSessions: 1,
  };
}

// ---------------------------------------------------------------------------
// Reguły sezonu
// ---------------------------------------------------------------------------

export function getSeasonPhaseRules(seasonPhase: string | null | undefined): SeasonPhaseRules {
  const phase = (seasonPhase ?? null) as string | null;
  const isInSeason = phase === "inseason";
  const isReducedLoadPhase = phase === "transition" || phase === "return_injury";

  return {
    seasonPhase: phase,
    // W sezonie i przy roztrenowaniu wolno redukować intensywność/objętość,
    // ale (poza reduced-load) nie wolno usuwać całej kategorii.
    allowIntensityReduction: isInSeason || isReducedLoadPhase,
    isInSeason,
    isReducedLoadPhase,
  };
}

// ---------------------------------------------------------------------------
// Liczniki kontekstu tygodnia
// ---------------------------------------------------------------------------

/**
 * Liczba treningów klubowych w tygodniu. Priorytet: jawne
 * `clubTrainingCount`, potem liczba dni klubowych z ustawień.
 */
export function getClubTrainingCount(
  ctx: WeekRequirementContext | null | undefined,
  settings?: UserRequirementSettings | null,
): number {
  if (ctx && Number.isFinite(ctx.clubTrainingCount)) {
    return Math.max(0, Math.floor(ctx.clubTrainingCount));
  }
  if (settings?.clubTrainingDays) {
    return settings.clubTrainingDays.length;
  }
  return 0;
}

/** Liczba meczów w tygodniu. */
export function getMatchCount(ctx: WeekRequirementContext | null | undefined): number {
  if (ctx && Number.isFinite(ctx.matchCount)) {
    return Math.max(0, Math.floor(ctx.matchCount));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Bezpieczeństwo / etap rozwoju
// ---------------------------------------------------------------------------

function resolveSafetyLevel(
  athlete?: AthleteRequirementProfile | null,
): { level: "youth_safe" | "developmental" | "performance"; youth: boolean } {
  const stage = athlete?.developmentStage ?? null;
  const youthStage = stage === "child_foundation" || stage === "early_youth";
  const beginner =
    athlete?.gymExperienceLevel === "none" || athlete?.gymExperienceLevel === "beginner";

  if (athlete?.safetyLevel) {
    return {
      level: athlete.safetyLevel,
      youth: athlete.safetyLevel === "youth_safe" || youthStage,
    };
  }

  if (youthStage || beginner) {
    return { level: "youth_safe", youth: youthStage || beginner };
  }
  if (stage === "late_youth") {
    return { level: "developmental", youth: false };
  }
  return { level: "performance", youth: false };
}

// ---------------------------------------------------------------------------
// Wymagania szczegółowe (gym / endurance / speed)
// ---------------------------------------------------------------------------

/**
 * TWARDA ZASADA: pełny tydzień = 2 sesje gym_strength. Działa niezależnie od
 * sezonu, liczby klubowych, meczu i celu. Wiek/poziom nie kasują kategorii —
 * zmieniają tylko wariant (u młodego/początkującego to movement foundation /
 * bodyweight strength / stability). Prehab nie liczy się jako gym_strength.
 */
export function getRequiredGymSessions(
  ctx: WeekRequirementContext,
  _settings?: UserRequirementSettings | null,
  athlete?: AthleteRequirementProfile | null,
): number {
  const seasonRules = getSeasonPhaseRules(ctx.seasonPhase);
  const painStatus = athlete?.hasActivePain;

  // Uzgodniony wyjątek: dwa mecze w jednym tygodniu zostawiają co najmniej
  // jedną krótką sesję podtrzymującą zamiast wymuszania dwóch pełnych siłowni.
  if ((ctx.matchCount ?? 0) >= 2) return 1;

  // Powrót po urazie: 0–2 zależnie od aktualnego ograniczenia. Aktywny ból
  // wyłącza obowiązkową siłę, brak bólu przywraca normalne minimum, a brak
  // odpowiedzi zostawia jedną ostrożną ekspozycję.
  if (ctx.seasonPhase === "return_injury") {
    if (painStatus === true) return 0;
    if (painStatus === false) return 2;
    return 1;
  }

  if (ctx.isFullWeek === false) return 1;
  if (seasonRules.isReducedLoadPhase) return 0;
  return 2;
}

/**
 * Liczba endurance. Domyślnie 1, a przy celu wydolnościowym zawsze minimum 2.
 * Klub liczy się do obciążenia, ale nie zmniejsza własnego minimum BallWise.
 */
export function getRequiredEnduranceSessions(
  ctx: WeekRequirementContext,
  settings: UserRequirementSettings | null | undefined,
  athleteGoal: string | null | undefined,
  _athlete?: AthleteRequirementProfile | null,
): number {
  const goalRules = getAthleteGoalRules(athleteGoal);
  if (!goalRules.isEnduranceGoal) return 1;
  void settings;
  return 2;
}

/**
 * Bezwzględne minimum endurance jest identyczne z wymaganiem celu. Dzięki temu
 * walidator nie może uznać tygodnia z jedną wydolnością za poprawny, gdy cel
 * zawodnika wymaga dwóch.
 */
export function getAbsoluteMinimumEnduranceSessions(
  ctx: WeekRequirementContext,
  settings: UserRequirementSettings | null | undefined,
  athleteGoal: string | null | undefined,
  athlete?: AthleteRequirementProfile | null,
): number {
  return getRequiredEnduranceSessions(ctx, settings, athleteGoal, athlete);
}

/**
 * Liczba sesji szybkości. Domyślnie 1, cel szybkościowy → 2.
 */
export function getRequiredSpeedSessions(
  _ctx: WeekRequirementContext,
  _settings: UserRequirementSettings | null | undefined,
  athleteGoal: string | null | undefined,
  _athlete?: AthleteRequirementProfile | null,
): number {
  return getAthleteGoalRules(athleteGoal).requiredSpeedSessions;
}

/**
 * Własna sesja piłkarska jest stałym minimum i nie jest zastępowana przez
 * klub ani mecz. Jedyny wyjątek bezpieczeństwa: początkujący/młody zawodnik,
 * którego wszystkie 7 dni zajmują już stałe punkty (mecze + klub).
 */
export function getRequiredBallSessions(
  ctx: WeekRequirementContext,
  athlete?: AthleteRequirementProfile | null,
): number {
  const fixedDays = getClubTrainingCount(ctx) + getMatchCount(ctx);
  const safety = resolveSafetyLevel(athlete);
  const beginner =
    athlete?.gymExperienceLevel === "none" ||
    athlete?.gymExperienceLevel === "beginner";
  if (fixedDays >= 7 && (beginner || safety.level === "youth_safe")) return 0;
  return 1;
}

/**
 * Czy dokładać dodatkowe endurance ponad minimum bazowe (cel wydolnościowy).
 */
export function shouldAddExtraEnduranceSessions(
  ctx: WeekRequirementContext,
  athleteGoal: string | null | undefined,
  settings?: UserRequirementSettings | null,
  athlete?: AthleteRequirementProfile | null,
): boolean {
  const required = getRequiredEnduranceSessions(ctx, settings, athleteGoal, athlete);
  return required > 1;
}

/**
 * Czy dokładać drugą sesję szybkości (cel szybkościowy).
 */
export function shouldAddSecondSpeedSession(
  ctx: WeekRequirementContext,
  athleteGoal: string | null | undefined,
  settings?: UserRequirementSettings | null,
  athlete?: AthleteRequirementProfile | null,
): boolean {
  return getRequiredSpeedSessions(ctx, settings, athleteGoal, athlete) >= 2;
}

// ---------------------------------------------------------------------------
// Rekomendacje dodatkowych sesji
// ---------------------------------------------------------------------------

export function calculateRecommendedExtraSessions(
  ctx: WeekRequirementContext,
  settings: UserRequirementSettings | null | undefined,
  athleteGoal: string | null | undefined,
  athlete?: AthleteRequirementProfile | null,
): { recommendedEnduranceSessions: number; recommendedSpeedSessions: number } {
  const required = calculateWeeklyMinimumRequirements(ctx, settings, athleteGoal, athlete);
  return {
    recommendedEnduranceSessions: required.requiredEnduranceSessions,
    recommendedSpeedSessions: required.requiredSpeedSessions,
  };
}

// ---------------------------------------------------------------------------
// GŁÓWNA funkcja — jedno źródło prawdy
// ---------------------------------------------------------------------------

export function calculateWeeklyMinimumRequirements(
  weekContext: WeekRequirementContext,
  userSettings: UserRequirementSettings | null | undefined,
  athleteGoal: string | null | undefined,
  athleteTrainingProfile?: AthleteRequirementProfile | null,
): WeeklyRequirements {
  const goalRules = getAthleteGoalRules(athleteGoal);
  const seasonRules = getSeasonPhaseRules(weekContext.seasonPhase);
  const clubTrainingCount = getClubTrainingCount(weekContext, userSettings);
  const matchCount = getMatchCount(weekContext);
  const safety = resolveSafetyLevel(athleteTrainingProfile);

  const requiredGymSessions = getRequiredGymSessions(
    weekContext,
    userSettings,
    athleteTrainingProfile,
  );
  const requiredEnduranceSessions = getRequiredEnduranceSessions(
    weekContext,
    userSettings,
    athleteGoal,
    athleteTrainingProfile,
  );
  const absoluteMinimumEnduranceSessions = getAbsoluteMinimumEnduranceSessions(
    weekContext,
    userSettings,
    athleteGoal,
    athleteTrainingProfile,
  );
  const requiredSpeedSessions = getRequiredSpeedSessions(
    weekContext,
    userSettings,
    athleteGoal,
    athleteTrainingProfile,
  );
  const requiredBallSessions = getRequiredBallSessions(
    weekContext,
    athleteTrainingProfile,
  );

  const reasonParts: string[] = [];
  reasonParts.push(`${requiredGymSessions}× siłownia`);
  reasonParts.push(`${requiredEnduranceSessions}× wydolność`);
  reasonParts.push(`${requiredSpeedSessions}× szybkość`);
  reasonParts.push(`${requiredBallSessions}× własna piłka`);
  if (goalRules.isSpeedGoal) reasonParts.push("cel szybkościowy → 2 szybkości");
  if (goalRules.isEnduranceGoal)
    reasonParts.push(`cel wydolnościowy → endurance wg ${clubTrainingCount} klubowych`);
  if (seasonRules.isInSeason) reasonParts.push("w sezonie: możliwa redukcja objętości, kategorie zostają");
  reasonParts.push("club nie zastępuje własnych minimów BallWise; para możliwa tylko gdy komplementarna");

  return {
    requiredGymSessions,
    requiredEnduranceSessions,
    absoluteMinimumEnduranceSessions,
    requiredSpeedSessions,
    requiredBallSessions,
    recommendedEnduranceSessions: requiredEnduranceSessions,
    recommendedSpeedSessions: requiredSpeedSessions,
    forbidEnduranceOnClubDays: false,
    reason: reasonParts.join("; "),
    goalDetected: goalRules.goalDetected,
    isEnduranceGoal: goalRules.isEnduranceGoal,
    isSpeedGoal: goalRules.isSpeedGoal,
    seasonPhase: seasonRules.seasonPhase,
    clubTrainingCount,
    matchCount,
    athleteDevelopmentStage: athleteTrainingProfile?.developmentStage ?? null,
    athleteSafetyLevel: safety.level,
    requiresYouthSafeContent: safety.youth || safety.level === "youth_safe",
  };
}
