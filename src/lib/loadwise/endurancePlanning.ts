// ============================================================================
// Loadwise — Centralny silnik planowania wydolności (endurance_conditioning).
// ----------------------------------------------------------------------------
// JEDNO źródło prawdy dla: generatora, scoringu, walidatora i naprawy planu.
//
// Twarde zasady:
//   - KAŻDY pełny tydzień musi mieć minimum 1 osobny bodziec endurance_conditioning.
//   - Cel wydolnościowy → liczba endurance zależy od liczby treningów klubowych:
//       0–2 klubowe → 3, 3 klubowe → 2, >3 klubowe → próba 2, absolutne minimum 1.
//   - Trening klubowy NIE liczy się jako endurance.
//   - Endurance NIGDY w dzień klubowy (twarda blokada).
//   - Endurance nie może być ciężkie dzień przed meczem (MD-1) — tylko lekkie.
//   - Przy niskim readiness / bólu → low-impact (rower / basen / easy aerobic).
//   - Youth/beginner → bez agresywnego HIIT i dużej objętości jako domyślnej opcji.
//   - Jeśli nie da się spełnić wymaganej liczby bez dnia klubowego — NIE łamiemy
//     zasady; dodajemy unresolvedIssue.
// ============================================================================

import {
  countSessionsForDay,
  getMaxSessionsPerDay,
  hasAvailableSecondSessionSlot,
  hasClubSession,
  hasEnduranceSession,
  hasMatchSession,
  canAddSessionToDay,
  type AthleteSchedProfile,
  type SchedDay,
  type SchedSession,
  type SchedWeekContext,
  type UserSchedulingSettings,
} from "./dailyScheduling";
import {
  calculateWeeklyMinimumRequirements,
  getRequiredEnduranceSessions as getRequiredEnduranceSessionsBase,
  getAbsoluteMinimumEnduranceSessions,
  getAthleteGoalRules,
  type WeeklyRequirements,
  type WeekRequirementContext,
  type UserRequirementSettings,
} from "./weeklyRequirements";
import {
  createEnduranceSessionVariant as createEnduranceSessionVariantBase,
  createLowImpactEnduranceSession,
  type GeneratedSession,
  type SessionGenContext,
} from "./sessionVariants";
import type { AthleteTrainingProfile } from "./athleteProfile";
import type { PainLocation } from "./types";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

/** Profil zawodnika używany do decyzji o wydolności (nadzbiór schedulera). */
export interface EnduranceAthleteProfile extends AthleteSchedProfile {
  athleteGoal?: string | null;
  readiness?: number | null;
  currentPain?: PainLocation[] | null;
  injuryHistory?: PainLocation[] | null;
  preferredTrainingStyle?: "foundation" | "development" | "performance" | null;
  exerciseSafetyProfile?: { allowAggressiveIntervals?: boolean } | null;
}

export interface EndurancePlacement {
  dayIndex: number;
  score: number;
  forcedLow: boolean;
  reason: string;
}

export interface FindEnduranceDayResult {
  dayIndex: number | null;
  forcedLow: boolean;
  placementReason?: string;
  unresolvedIssue?: string;
}

export interface EnduranceValidationIssue {
  reason: string;
  code: string;
  suggestedSubcategory?: string;
}

export interface EnduranceSessionValidationReport {
  ok: boolean;
  issues: EnduranceValidationIssue[];
  warnings: string[];
}

export interface WeeklyEnduranceValidationReport {
  ok: boolean;
  count: number;
  requiredEnduranceSessions: number;
  absoluteMinimumEnduranceSessions: number;
  onClubDay: number;
  unresolvedIssues: string[];
  warnings: string[];
}

export interface AddMissingEnduranceResult {
  weekPlan: SchedDay[];
  added: number;
  count: number;
  requiredEnduranceSessions: number;
  absoluteMinimumEnduranceSessions: number;
  unresolvedIssues: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpery lokalne
// ---------------------------------------------------------------------------

const LOWER_LIMB_PAIN: PainLocation[] = ["knee", "ankle", "hamstring", "groin", "hip"];

/** Sub-kategorie/tagi uznawane za low-impact / bezpieczne rozwojowo. */
const LOW_IMPACT_SUBCATS = new Set<string>([
  "low_impact_conditioning",
  "bike_conditioning",
  "pool_conditioning",
  "recovery_run",
  "short_aerobic_block",
  "easy_aerobic",
  "easy_run",
  "zone2_aerobic",
]);

/** Sub-kategorie uznawane za agresywny HIIT / dużą objętość. */
const AGGRESSIVE_HIIT_SUBCATS = new Set<string>([
  "aerobic_intervals",
  "extensive_intervals",
  "repeated_tempo",
]);

function isYouthOrBeginner(a?: EnduranceAthleteProfile | null): boolean {
  if (!a) return true;
  const youthStage =
    a.developmentStage === "child_foundation" || a.developmentStage === "early_youth";
  const beginner = a.gymExperienceLevel === "none" || a.gymExperienceLevel === "beginner";
  return youthStage || beginner || a.preferredTrainingStyle === "foundation";
}

function hasLowerLimbPain(a?: EnduranceAthleteProfile | null): boolean {
  const pain = new Set<PainLocation>([...(a?.currentPain ?? []), ...(a?.injuryHistory ?? [])]);
  return LOWER_LIMB_PAIN.some((p) => pain.has(p));
}

function resolveReadiness(a?: EnduranceAthleteProfile | null): number {
  return typeof a?.readiness === "number" ? a.readiness : 6;
}

function dayHasCategory(day: SchedDay, cat: SchedSession["category"]): boolean {
  return (day.sessions ?? []).some((s) => s.category === cat);
}

function isDayBeforeMatch(day: SchedDay): boolean {
  return day.toMatch === 1;
}

function isMatchDay(day: SchedDay): boolean {
  return day.toMatch === 0 || hasMatchSession(day);
}

function isDayAfterMatch(day: SchedDay, weekPlan: SchedDay[]): boolean {
  const i = weekPlan.indexOf(day);
  const prev = i > 0 ? weekPlan[i - 1] : null;
  return !!prev && (prev.toMatch === 0 || hasMatchSession(prev));
}

function speedIsFirst(day: SchedDay): boolean {
  const real = (day.sessions ?? []).filter(
    (s) => s.category !== "rest" && s.category !== "recovery_prehab" && s.category !== "mobility",
  );
  return real.length === 0 || real.every((s) => s.category === "speed_sprint");
}

// ---------------------------------------------------------------------------
// Zliczanie i wymagania
// ---------------------------------------------------------------------------

/** Liczba osobnych bodźców endurance_conditioning w tygodniu. */
export function countEnduranceSessions(weekPlan: SchedDay[]): number {
  return (weekPlan ?? []).reduce(
    (sum, day) =>
      sum + (day.sessions ?? []).filter((s) => s.category === "endurance_conditioning").length,
    0,
  );
}

/**
 * Wymagana liczba endurance — deleguje do centralnego silnika wymagań.
 * Klub NIE liczy się automatycznie jako endurance.
 */
export function getRequiredEnduranceSessions(
  weekContext: WeekRequirementContext,
  userSettings: UserRequirementSettings | null | undefined,
  athleteGoal: string | null | undefined,
  athleteTrainingProfile?: EnduranceAthleteProfile | null,
): number {
  return getRequiredEnduranceSessionsBase(
    weekContext,
    userSettings,
    athleteGoal,
    athleteTrainingProfile ?? undefined,
  );
}

/** Czy tydzień ma wystarczającą liczbę endurance wg wymagań. */
export function hasEnoughEnduranceSessions(
  weekPlan: SchedDay[],
  weeklyRequirements: Pick<WeeklyRequirements, "requiredEnduranceSessions">,
): boolean {
  return countEnduranceSessions(weekPlan) >= (weeklyRequirements?.requiredEnduranceSessions ?? 1);
}

// ---------------------------------------------------------------------------
// Blokada endurance w dni klubowe (twarda zasada)
// ---------------------------------------------------------------------------

/**
 * Usuwa każdą sesję endurance zaplanowaną w dzień klubowy (twarda zasada).
 * Zwraca liczbę usuniętych sesji + zebrane unresolvedIssue.
 */
export function blockEnduranceOnClubDays(
  weekPlan: SchedDay[],
  _weeklyRequirements?: unknown,
): { removed: number; unresolvedIssues: string[] } {
  let removed = 0;
  const unresolvedIssues: string[] = [];
  for (const day of weekPlan ?? []) {
    if (!hasClubSession(day)) continue;
    const before = (day.sessions ?? []).length;
    day.sessions = (day.sessions ?? []).filter((s) => s.category !== "endurance_conditioning");
    const diff = before - day.sessions.length;
    if (diff > 0) {
      removed += diff;
      unresolvedIssues.push(
        "Usunięto endurance z dnia klubowego (endurance nie może być w dzień klubowy).",
      );
    }
  }
  return { removed, unresolvedIssues };
}

// ---------------------------------------------------------------------------
// Bezpieczne miejsca na endurance (scoring)
// ---------------------------------------------------------------------------

/**
 * Zwraca listę dni, w których wolno zaplanować endurance, posortowaną malejąco
 * wg score. Dni klubowe, meczowe oraz dni bez wolnego slotu są wykluczone.
 */
export function getSafeEndurancePlacements(
  weekPlan: SchedDay[],
  weekContext: SchedWeekContext | null | undefined,
  userSettings: UserSchedulingSettings | null | undefined,
  weeklyRequirements?: unknown,
  athleteTrainingProfile?: EnduranceAthleteProfile | null,
): EndurancePlacement[] {
  const goal = getAthleteGoalRules(athleteTrainingProfile?.athleteGoal);
  const placements: EndurancePlacement[] = [];

  (weekPlan ?? []).forEach((day, dayIndex) => {
    // Twarde blokady.
    if (hasClubSession(day)) return; // endurance nigdy w dzień klubowy
    if (isMatchDay(day)) return;
    if (hasEnduranceSession(day)) return; // już ma endurance
    if (!hasAvailableSecondSessionSlot(day, userSettings)) return;

    // MD-1 — tylko lekka wersja (forcedLow), inaczej dopuszczalne pełne.
    const forcedLow = isDayBeforeMatch(day) || isDayAfterMatch(day, weekPlan);

    // Czy dodanie lekkiej sesji jest w ogóle dozwolone (limit / kombinacje).
    const candidate: SchedSession = {
      category: "endurance_conditioning",
      loadLevel: forcedLow ? "low" : "moderate",
    };
    const add = canAddSessionToDay(
      day,
      candidate,
      userSettings,
      weekContext,
      weeklyRequirements,
      athleteTrainingProfile,
    );
    if (!add.allowed) return;

    let score = 50;
    const empty = countSessionsForDay(day) === 0;
    if (empty) score += 25; // wolny dzień bez klubu/meczu
    if (dayHasCategory(day, "gym_strength")) score += 45; // preferowane: endurance + siłownia
    if (dayHasCategory(day, "speed_sprint") && speedIsFirst(day)) score += 10; // szybkość pierwsza
    if (goal.isEnduranceGoal) score += 8;
    if (isDayBeforeMatch(day)) score -= 40; // MD-1 mocno odradzane
    if (isDayAfterMatch(day, weekPlan)) score -= 10; // po meczu tylko lekkie

    const reason = dayHasCategory(day, "gym_strength")
      ? "Wybrano ten dzień dla wydolności — brak klubu/meczu, można połączyć z siłownią."
      : empty
        ? "Wybrano wolny dzień bez klubu i meczu — najlepsze miejsce na wydolność."
        : "Wybrano ten dzień dla wydolności — brak klubu i meczu.";

    placements.push({ dayIndex, score, forcedLow, reason });
  });

  return placements.sort((a, b) => b.score - a.score);
}

/**
 * Znajduje najlepszy dzień na sesję endurance. Nigdy nie wybiera dnia
 * klubowego ani meczowego. Gdy brak bezpiecznego dnia → unresolvedIssue.
 */
export function findBestDayForEnduranceSession(
  weekPlan: SchedDay[],
  weekContext: SchedWeekContext | null | undefined,
  userSettings: UserSchedulingSettings | null | undefined,
  weeklyRequirements?: unknown,
  athleteTrainingProfile?: EnduranceAthleteProfile | null,
): FindEnduranceDayResult {
  const placements = getSafeEndurancePlacements(
    weekPlan,
    weekContext,
    userSettings,
    weeklyRequirements,
    athleteTrainingProfile,
  );
  const best = placements[0];
  if (!best) {
    return {
      dayIndex: null,
      forcedLow: false,
      unresolvedIssue:
        "Nie znaleziono bezpiecznego dnia na endurance bez dnia klubowego — nie łamiemy zasady.",
    };
  }
  return {
    dayIndex: best.dayIndex,
    forcedLow: best.forcedLow,
    placementReason: best.reason,
  };
}

// ---------------------------------------------------------------------------
// Wariant sesji endurance (deleguje do sessionVariants, dokłada obsługę bólu)
// ---------------------------------------------------------------------------

/**
 * Buduje sesję endurance dopasowaną do dnia i profilu. Zwraca `null` gdy dzień
 * jest klubowy/meczowy (endurance zablokowane). Ból kończyn dolnych oraz niski
 * readiness → wymuszony wariant low-impact.
 */
export function createEnduranceSessionVariant(
  ctx: SessionGenContext,
  athleteTrainingProfile?: EnduranceAthleteProfile | null,
): GeneratedSession | null {
  const a = athleteTrainingProfile as AthleteTrainingProfile | null | undefined;

  // Ból kończyn dolnych → od razu low-impact (rower / basen), nie ciężkie bieganie.
  if (hasLowerLimbPain(athleteTrainingProfile) && !ctx.hasClub && ctx.toMatch !== 0) {
    return createLowImpactEnduranceSession(
      { ...ctx, placementReason: ctx.placementReason ?? "Ból kończyny dolnej — wydolność low-impact zamiast biegania." },
      a,
    );
  }

  const built = createEnduranceSessionVariantBase(ctx, a);
  if (!built) return null;

  // Youth/beginner z domyślnym agresywnym HIIT → sprowadź do low-impact.
  if (
    isYouthOrBeginner(athleteTrainingProfile) &&
    (AGGRESSIVE_HIIT_SUBCATS.has(built.subcategory) ||
      built.loadLevel === "high" ||
      built.loadLevel === "very_high")
  ) {
    return createLowImpactEnduranceSession(
      { ...ctx, placementReason: "Youth/beginner — bez agresywnego HIIT, wersja low-impact." },
      a,
    );
  }

  return built;
}

// ---------------------------------------------------------------------------
// Walidacja pojedynczej sesji endurance dla profilu
// ---------------------------------------------------------------------------

/**
 * Sprawdza, czy sesja endurance jest bezpieczna dla profilu:
 *  - youth/beginner nie dostaje agresywnego HIIT ani dużej objętości,
 *  - ból kończyn dolnych → wymagane low-impact,
 *  - MD-1 → tylko lekka wersja.
 */
export function validateEnduranceSessionForAthleteProfile(
  session: GeneratedSession,
  athleteTrainingProfile?: EnduranceAthleteProfile | null,
  ctx: { toMatch?: number | null } = {},
): EnduranceSessionValidationReport {
  const issues: EnduranceValidationIssue[] = [];
  const warnings: string[] = [];

  if (session.category !== "endurance_conditioning") {
    return { ok: true, issues, warnings };
  }

  const youth = isYouthOrBeginner(athleteTrainingProfile);
  const heavy = session.loadLevel === "high" || session.loadLevel === "very_high";
  const aggressive = AGGRESSIVE_HIIT_SUBCATS.has(session.subcategory);

  if (youth && (aggressive || heavy)) {
    issues.push({
      code: "youth_aggressive_hiit",
      reason: "Youth/beginner — agresywny HIIT / duża objętość nie może być domyślną jednostką.",
      suggestedSubcategory: "short_aerobic_block",
    });
  }

  if (hasLowerLimbPain(athleteTrainingProfile) && !LOW_IMPACT_SUBCATS.has(session.subcategory)) {
    issues.push({
      code: "pain_needs_low_impact",
      reason: "Ból kończyny dolnej — wymagane low-impact (rower/basen) zamiast biegania.",
      suggestedSubcategory: "low_impact_conditioning",
    });
  }

  if (ctx.toMatch === 1 && heavy) {
    issues.push({
      code: "heavy_running_md1",
      reason: "MD-1 — ciężkie bieganie jest niedozwolone dzień przed meczem.",
      suggestedSubcategory: "short_aerobic_block",
    });
  }

  return { ok: issues.length === 0, issues, warnings };
}

// ---------------------------------------------------------------------------
// Placement helper — konwersja GeneratedSession → SchedSession
// ---------------------------------------------------------------------------

function toSchedSession(gen: GeneratedSession): SchedSession {
  return {
    category: "endurance_conditioning",
    title: gen.title,
    intensity: gen.intensity,
    loadLevel: gen.loadLevel,
    durationMin: gen.durationMinutes,
    isHeavyConditioning: gen.loadLevel === "high" || gen.loadLevel === "very_high",
    placementReason: gen.placementReason,
  };
}

function buildContextForDay(
  day: SchedDay,
  weekPlan: SchedDay[],
  forcedLow: boolean,
  athlete?: EnduranceAthleteProfile | null,
  placementReason?: string,
): SessionGenContext {
  return {
    hasClub: false,
    toMatch: day.toMatch ?? null,
    isDayAfterMatch: isDayAfterMatch(day, weekPlan),
    readiness: forcedLow ? Math.min(resolveReadiness(athlete), 4) : resolveReadiness(athlete),
    goal: athlete?.athleteGoal ?? undefined,
    placementReason,
  };
}

// ---------------------------------------------------------------------------
// Naprawa planu — dodanie brakujących endurance
// ---------------------------------------------------------------------------

/**
 * Dodaje brakujące sesje endurance do wymaganej liczby, wybierając za każdym
 * razem najbezpieczniejszy dzień (bez klubu / meczu). Jeśli nie da się dojść do
 * wymogu bez łamania zasad — dodaje unresolvedIssue zamiast łamać zasadę.
 */
export function addMissingEnduranceSessions(
  weekPlan: SchedDay[],
  weekContext: WeekRequirementContext & SchedWeekContext,
  userSettings: (UserRequirementSettings & UserSchedulingSettings) | null | undefined,
  weeklyRequirements: WeeklyRequirements,
  athleteTrainingProfile?: EnduranceAthleteProfile | null,
): AddMissingEnduranceResult {
  const unresolvedIssues: string[] = [];
  const warnings: string[] = [];

  // Najpierw twarda zasada: usuń endurance z dni klubowych.
  const cleanup = blockEnduranceOnClubDays(weekPlan, weeklyRequirements);
  unresolvedIssues.push(...cleanup.unresolvedIssues);

  const required = Math.max(1, weeklyRequirements.requiredEnduranceSessions);
  const absoluteMinimum = Math.max(1, weeklyRequirements.absoluteMinimumEnduranceSessions);

  let added = 0;
  let guard = 0;
  while (countEnduranceSessions(weekPlan) < required && guard < 14) {
    guard += 1;
    const best = findBestDayForEnduranceSession(
      weekPlan,
      weekContext,
      userSettings,
      weeklyRequirements,
      athleteTrainingProfile,
    );
    if (best.dayIndex === null) break; // brak bezpiecznego dnia

    const day = weekPlan[best.dayIndex];
    const ctx = buildContextForDay(
      day,
      weekPlan,
      best.forcedLow,
      athleteTrainingProfile,
      best.placementReason,
    );
    const gen = createEnduranceSessionVariant(ctx, athleteTrainingProfile);
    if (!gen) {
      warnings.push(`Nie udało się zbudować sesji endurance dla dnia ${best.dayIndex}.`);
      break;
    }
    day.sessions = [...(day.sessions ?? []), toSchedSession(gen)];
    added += 1;
  }

  const count = countEnduranceSessions(weekPlan);

  if (count < absoluteMinimum) {
    unresolvedIssues.push(
      `Tydzień ma ${count} sesji endurance, absolutne minimum ${absoluteMinimum} — nie da się dodać bez dnia klubowego.`,
    );
  } else if (count < required) {
    unresolvedIssues.push(
      `Tydzień ma ${count} z ${required} wymaganych sesji endurance — brakującej nie da się dodać bez łamania zasad (dzień klubowy/mecz).`,
    );
  }

  return {
    weekPlan,
    added,
    count,
    requiredEnduranceSessions: required,
    absoluteMinimumEnduranceSessions: absoluteMinimum,
    unresolvedIssues,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Walidacja struktury tygodnia pod kątem endurance
// ---------------------------------------------------------------------------

/**
 * Waliduje cały tydzień: liczba endurance, brak endurance w dni klubowe oraz
 * bezpieczeństwo treści dla profilu. Każdy problem → unresolvedIssue.
 */
export function validateWeeklyEnduranceMinimum(
  weekPlan: SchedDay[],
  weekContext: WeekRequirementContext,
  userSettings: UserRequirementSettings | null | undefined,
  weeklyRequirements: WeeklyRequirements,
  athleteTrainingProfile?: EnduranceAthleteProfile | null,
): WeeklyEnduranceValidationReport {
  void weekContext;
  void userSettings;
  const unresolvedIssues: string[] = [];
  const warnings: string[] = [];

  const count = countEnduranceSessions(weekPlan);
  const required = Math.max(1, weeklyRequirements.requiredEnduranceSessions);
  const absoluteMinimum = Math.max(1, weeklyRequirements.absoluteMinimumEnduranceSessions);

  // Endurance w dzień klubowy?
  let onClubDay = 0;
  for (const day of weekPlan ?? []) {
    if (hasClubSession(day) && hasEnduranceSession(day)) {
      onClubDay += (day.sessions ?? []).filter((s) => s.category === "endurance_conditioning").length;
    }
  }
  if (onClubDay > 0) {
    unresolvedIssues.push(
      `${onClubDay} sesji endurance zaplanowano w dzień klubowy — to jest zabronione.`,
    );
  }

  if (count < absoluteMinimum) {
    unresolvedIssues.push(
      `Tydzień ma ${count} sesji endurance, absolutne minimum ${absoluteMinimum}.`,
    );
  } else if (count < required) {
    unresolvedIssues.push(
      `Tydzień ma ${count} z ${required} wymaganych sesji endurance.`,
    );
  }

  return {
    ok: unresolvedIssues.length === 0,
    count,
    requiredEnduranceSessions: required,
    absoluteMinimumEnduranceSessions: absoluteMinimum,
    onClubDay,
    unresolvedIssues,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Re-eksporty pomocnicze (jedno źródło prawdy)
// ---------------------------------------------------------------------------

export {
  calculateWeeklyMinimumRequirements,
  getAbsoluteMinimumEnduranceSessions,
  getAthleteGoalRules,
};
export type { WeeklyRequirements, WeekRequirementContext };
