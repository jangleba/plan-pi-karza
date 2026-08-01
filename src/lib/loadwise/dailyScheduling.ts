// ============================================================================
// Loadwise — Silnik planowania dziennego i tygodniowego (1–2 sesje / dzień).
// ----------------------------------------------------------------------------
// JEDNO źródło prawdy dla decyzji: ile sesji może mieć dzień, czy wolno dodać
// drugą sesję, jak łączyć club + endurance / gym / speed, oraz jak zapewnić
// twardą zasadę: KAŻDY tydzień musi mieć minimum 1 endurance_conditioning
// niezależnie od celu, wieku, poziomu, sezonu i liczby treningów klubowych.
//
// Każda decyzja niesie powód: placementReason / blockReason / adaptationReason
// / timingHint / unresolvedIssue — nigdy nie pomijamy problemu po cichu.
// ============================================================================

import type { DoubleSessions, Intensity, SessionCategory } from "./types";
import type { DevelopmentStage } from "./athleteProfile";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export type SchedLoadLevel = "none" | "low" | "moderate" | "high" | "very_high";

/** Ocena obciążenia treningu klubowego (na bazie RPE / loadLevel). */
export type ClubLoadLevel =
  | "very_light"
  | "light"
  | "moderate"
  | "heavy"
  | "very_heavy";

/** Minimalny, jednoznaczny model sesji na potrzeby schedulera. */
export interface SchedSession {
  id?: string;
  category: SessionCategory;
  title?: string;
  intensity?: Intensity;
  loadLevel?: SchedLoadLevel;
  durationMin?: number;
  /** Ocena RPE treningu (klubowego) przez zawodnika, 1–10. */
  rpe?: number | null;
  isHeavyLegs?: boolean;
  isHeavyConditioning?: boolean;
  isMaxVelocity?: boolean;
  /** Pełna, ciężka sesja szybkościowa (max velocity / duża objętość sprintu). */
  isFullSpeed?: boolean;
  /** Endurance zaplanowane PO treningu klubowym (tylko bardzo lekkie). */
  afterClub?: boolean;
  // --- Powody decyzyjne ---
  placementReason?: string;
  blockReason?: string;
  adaptationReason?: string;
  timingHint?: string;
  unresolvedIssue?: string;
}

export interface SchedDay {
  date?: string;
  dayOfWeek?: number;
  /** Dni do meczu: 0 = mecz, 1 = dzień przed meczem (MD-1). null = brak meczu. */
  toMatch?: number | null;
  sessions: SchedSession[];
}

export interface UserSchedulingSettings {
  /** Jawny limit sesji dziennie (1 lub 2). Ma priorytet. */
  maxSessionsPerDay?: number;
  /** Ustawienie z onboardingu (fallback, gdy brak jawnego limitu). */
  doubleSessionsAllowed?: DoubleSessions;
}

export interface AthleteSchedProfile {
  developmentStage?: DevelopmentStage | null;
  safetyLevel?: "youth_safe" | "developmental" | "performance" | null;
  gymExperienceLevel?: "none" | "beginner" | "intermediate" | "advanced" | null;
}

export interface SchedWeekContext {
  seasonPhase?: string | null;
}

export interface CombinationResult {
  allowed: boolean;
  blockReason?: string;
}

export interface AddSessionResult {
  allowed: boolean;
  blockReason?: string;
  placementReason?: string;
}

export interface WeeklyEnduranceResult {
  valid: boolean;
  count: number;
  minimum: number;
  unresolvedIssue?: string;
}

export interface FindEnduranceDayResult {
  dayIndex: number | null;
  tier: "no_club_no_match" | "gym_or_speed" | "club_fallback" | null;
  placementReason?: string;
  unresolvedIssue?: string;
}

export interface EnduranceOnClubResult {
  allowed: boolean;
  blockReason?: string;
  clubLoad?: ClubLoadLevel;
}

// ---------------------------------------------------------------------------
// Limity dzienne
// ---------------------------------------------------------------------------

export function getMaxSessionsPerDay(userSettings?: UserSchedulingSettings | null): number {
  const explicit = userSettings?.maxSessionsPerDay;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    // Nigdy nie pozwalamy na 3 sesje jednego dnia.
    return Math.max(1, Math.min(2, Math.floor(explicit)));
  }
  switch (userSettings?.doubleSessionsAllowed) {
    case "no":
      return 1;
    case "yes_if_safe":
    case "light_only":
    default:
      // Domyślnie silnik może zaplanować 2 sesje dziennie (bezpieczne
      // kombinacje). Dopiero jawne "no" blokuje drugą sesję.
      return 2;
  }
}

export function isTwoADayAllowed(userSettings?: UserSchedulingSettings | null): boolean {
  return getMaxSessionsPerDay(userSettings) >= 2;
}

const REAL_CATEGORIES: SessionCategory[] = [
  "club",
  "gym_strength",
  "endurance_conditioning",
  "speed_sprint",
  "match",
  "recovery_prehab",
  "mobility",
  "other",
];

function isRealSession(s: SchedSession): boolean {
  return s.category !== "rest" && REAL_CATEGORIES.includes(s.category);
}

export function countSessionsForDay(day: SchedDay): number {
  return (day.sessions ?? []).filter(isRealSession).length;
}

export function hasAvailableSecondSessionSlot(
  day: SchedDay,
  userSettings?: UserSchedulingSettings | null,
): boolean {
  return countSessionsForDay(day) < getMaxSessionsPerDay(userSettings);
}

export function hasClubSession(day: SchedDay): boolean {
  return (day.sessions ?? []).some((s) => s.category === "club");
}

export function hasEnduranceSession(day: SchedDay): boolean {
  return (day.sessions ?? []).some((s) => s.category === "endurance_conditioning");
}

export function hasMatchSession(day: SchedDay): boolean {
  return (day.sessions ?? []).some((s) => s.category === "match");
}

// ---------------------------------------------------------------------------
// Szybkość — twarda zasada: nigdy dwie jednostki speed_sprint jednego dnia
// ---------------------------------------------------------------------------

/** Czy sesja liczy się jako bodziec szybkościowy (speed_sprint w każdym wariancie). */
export function countsAsSpeed(s: SchedSession): boolean {
  return s.category === "speed_sprint";
}

/** Czy dzień ma jakąkolwiek jednostkę speed_sprint. */
export function hasSpeedSession(day: SchedDay): boolean {
  return (day.sessions ?? []).some(countsAsSpeed);
}

/** Ile jednostek speed_sprint jest w danym dniu. */
export function countSpeedSessionsForDay(day: SchedDay): number {
  return (day.sessions ?? []).filter(countsAsSpeed).length;
}

/**
 * Czy dodanie newSession stworzyłoby dzień z dwiema jednostkami szybkościowymi.
 * Zwraca true, jeśli dzień już ma speed_sprint, a nowa sesja też liczy się jako speed.
 */
export function wouldCreateDuplicateSpeedDay(day: SchedDay, newSession: SchedSession): boolean {
  if (!countsAsSpeed(newSession)) return false;
  return hasSpeedSession(day);
}

// ---------------------------------------------------------------------------
// Obciążenie sesji / klubu
// ---------------------------------------------------------------------------

function rpeToLoad(rpe: number): SchedLoadLevel {
  if (rpe <= 3) return "low";
  if (rpe <= 5) return "moderate";
  if (rpe <= 7) return "moderate";
  if (rpe <= 8) return "high";
  return "very_high";
}

function sessionLoadLevel(s: SchedSession): SchedLoadLevel {
  if (s.loadLevel) return s.loadLevel;
  if (typeof s.rpe === "number") return rpeToLoad(s.rpe);
  switch (s.intensity) {
    case "wysoka":
      return "high";
    case "umiarkowana":
      return "moderate";
    case "niska":
      return "low";
    default:
      return "moderate";
  }
}

function isHeavySession(s: SchedSession): boolean {
  if (s.category === "recovery_prehab" || s.category === "mobility" || s.category === "rest") {
    return false;
  }
  if (s.isHeavyLegs || s.isHeavyConditioning || s.isMaxVelocity || s.isFullSpeed) return true;
  const load = sessionLoadLevel(s);
  return load === "high" || load === "very_high";
}

export function getClubSessionLoadLevel(
  session: SchedSession,
  _athlete?: AthleteSchedProfile | null,
): ClubLoadLevel {
  if (typeof session.rpe === "number") {
    const rpe = session.rpe;
    if (rpe <= 2) return "very_light";
    if (rpe <= 4) return "light";
    if (rpe <= 6) return "moderate";
    if (rpe <= 8) return "heavy";
    return "very_heavy";
  }
  switch (sessionLoadLevel(session)) {
    case "none":
    case "low":
      return "light";
    case "moderate":
      return "moderate";
    case "high":
      return "heavy";
    case "very_high":
      return "very_heavy";
    default:
      return "moderate";
  }
}

// ---------------------------------------------------------------------------
// Youth / beginner
// ---------------------------------------------------------------------------

export function isYouthOrBeginner(athlete?: AthleteSchedProfile | null): boolean {
  if (!athlete) return false;
  if (athlete.safetyLevel === "youth_safe") return true;
  if (
    athlete.developmentStage === "child_foundation" ||
    athlete.developmentStage === "early_youth"
  ) {
    return true;
  }
  return athlete.gymExperienceLevel === "none" || athlete.gymExperienceLevel === "beginner";
}

// ---------------------------------------------------------------------------
// Kolejność sesji w dniu
// ---------------------------------------------------------------------------

export function getSessionOrderPriority(session: SchedSession): number {
  switch (session.category) {
    case "match":
      return 0;
    case "speed_sprint":
      return 1;
    case "gym_strength":
      return 2;
    case "endurance_conditioning":
      // Endurance przed klubowym (domyślnie); po klubowym schodzi za club.
      return session.afterClub ? 4.5 : 3;
    case "club":
      return 4;
    case "recovery_prehab":
    case "mobility":
      return 5;
    default:
      return 6;
  }
}

export function sortSessionsWithinDay(day: SchedDay): SchedSession[] {
  return [...(day.sessions ?? [])].sort(
    (a, b) => getSessionOrderPriority(a) - getSessionOrderPriority(b),
  );
}

// ---------------------------------------------------------------------------
// Dozwolone / zablokowane kombinacje w jednym dniu (two-a-day)
// ---------------------------------------------------------------------------

function comboKey(a: SessionCategory, b: SessionCategory): string {
  return [a, b].sort().join("+");
}

const ALLOWED_COMBOS = new Set<string>([
  comboKey("club", "gym_strength"),
  comboKey("club", "speed_sprint"),
  comboKey("club", "endurance_conditioning"),
  comboKey("gym_strength", "endurance_conditioning"),
  comboKey("gym_strength", "speed_sprint"),
  comboKey("speed_sprint", "endurance_conditioning"),
  comboKey("match", "recovery_prehab"),
  // Regeneracja / mobilność / prehab są zawsze dozwolone jako druga sesja.
  comboKey("club", "recovery_prehab"),
  comboKey("club", "mobility"),
  comboKey("gym_strength", "recovery_prehab"),
  comboKey("gym_strength", "mobility"),
  comboKey("speed_sprint", "recovery_prehab"),
  comboKey("speed_sprint", "mobility"),
  comboKey("endurance_conditioning", "recovery_prehab"),
  comboKey("endurance_conditioning", "mobility"),
  comboKey("match", "mobility"),
]);

export function validateTwoADayCombination(
  day: SchedDay,
  newSession: SchedSession,
  weekContext?: SchedWeekContext | null,
  _weeklyRequirements?: unknown,
  athlete?: AthleteSchedProfile | null,
): CombinationResult {
  const existing = (day.sessions ?? []).filter(isRealSession);

  // Twarde: nigdy 3 sesje jednego dnia.
  if (existing.length >= 2) {
    return { allowed: false, blockReason: "Dzień ma już 2 sesje — nie dodaję trzeciej." };
  }
  if (existing.length === 0) return { allowed: true };

  const other = existing[0];
  const toMatch = day.toMatch;

  // Reguły dnia przed meczem (MD-1).
  if (toMatch === 1) {
    if (newSession.isHeavyLegs || other.isHeavyLegs) {
      return { allowed: false, blockReason: "Ciężka siła nóg dzień przed meczem jest zablokowana." };
    }
    if (newSession.isHeavyConditioning || other.isHeavyConditioning) {
      return { allowed: false, blockReason: "Ciężkie bieganie dzień przed meczem jest zablokowane." };
    }
    if (newSession.isMaxVelocity || other.isMaxVelocity) {
      return { allowed: false, blockReason: "Pełna max velocity dzień przed meczem jest zablokowana." };
    }
  }

  const key = comboKey(other.category, newSession.category);
  if (!ALLOWED_COMBOS.has(key)) {
    return {
      allowed: false,
      blockReason: `Kombinacja ${other.category} + ${newSession.category} nie jest dozwolona jako dwie sesje jednego dnia.`,
    };
  }

  // Ciężka siła nóg + ciężkie conditioning tego samego dnia.
  const heavyLegs = newSession.isHeavyLegs || other.isHeavyLegs;
  const heavyCond = newSession.isHeavyConditioning || other.isHeavyConditioning;
  if (heavyLegs && heavyCond) {
    return {
      allowed: false,
      blockReason: "Ciężka siła nóg + ciężkie conditioning tego samego dnia jest zablokowane.",
    };
  }

  // Druga ciężka sesja u youth/beginner (sprawdzane przed ogólną regułą).
  if (isYouthOrBeginner(athlete) && isHeavySession(newSession) && isHeavySession(other)) {
    return {
      allowed: false,
      blockReason: "Zablokowano drugą ciężką sesję, bo zawodnik jest youth/beginner.",
    };
  }

  // Dwa bardzo ciężkie bodźce jednego dnia.
  if (isHeavySession(other) && isHeavySession(newSession)) {
    return { allowed: false, blockReason: "Dwa bardzo ciężkie bodźce jednego dnia są zablokowane." };
  }

  // Dwie pełne sesje szybkościowe jednego dnia.
  if (other.category === "speed_sprint" && newSession.category === "speed_sprint") {
    return { allowed: false, blockReason: "Dwie pełne sesje szybkościowe jednego dnia są zablokowane." };
  }

  // Ciężkie endurance + ciężki club tego samego dnia.
  if (
    key === comboKey("club", "endurance_conditioning") &&
    ((other.category === "club" && isHeavySession(other) && isHeavySession(newSession)) ||
      (newSession.category === "club" && isHeavySession(newSession) && isHeavySession(other)))
  ) {
    return {
      allowed: false,
      blockReason: "Ciężkie endurance + ciężki trening klubowy tego samego dnia jest zablokowane.",
    };
  }




  void weekContext;
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Walidacja limitu dziennego
// ---------------------------------------------------------------------------

export function validateDailySessionLimit(
  day: SchedDay,
  userSettings?: UserSchedulingSettings | null,
): { valid: boolean; unresolvedIssue?: string } {
  const count = countSessionsForDay(day);
  const max = getMaxSessionsPerDay(userSettings);
  if (count > 2) {
    return { valid: false, unresolvedIssue: "Dzień ma więcej niż 2 sesje — to jest zabronione." };
  }
  if (count > max) {
    return {
      valid: false,
      unresolvedIssue: `Dzień ma ${count} sesje, a maxSessionsPerDay = ${max}.`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Główna funkcja decyzyjna — czy wolno dodać sesję do dnia
// ---------------------------------------------------------------------------

export function canAddSessionToDay(
  day: SchedDay,
  session: SchedSession,
  userSettings?: UserSchedulingSettings | null,
  weekContext?: SchedWeekContext | null,
  weeklyRequirements?: unknown,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): AddSessionResult {
  // 1) Limit sesji dziennie.
  if (!hasAvailableSecondSessionSlot(day, userSettings)) {
    const max = getMaxSessionsPerDay(userSettings);
    return {
      allowed: false,
      blockReason:
        max === 1
          ? "Nie dodano drugiej sesji, bo maxSessionsPerDay = 1."
          : "Nie dodano trzeciej sesji, bo maxSessionsPerDay = 2.",
    };
  }

  // 1b) TWARDA ZASADA: nigdy dwie jednostki speed_sprint jednego dnia.
  // Obowiązuje zawsze — niezależnie od celu, wieku i limitu 2 sesji.
  if (wouldCreateDuplicateSpeedDay(day, session)) {
    return {
      allowed: false,
      blockReason:
        "Dzień ma już speed_sprint — druga jednostka szybkościowa tego samego dnia jest zablokowana.",
    };
  }

  // 2) Kombinacja dwóch sesji.
  const combo = validateTwoADayCombination(
    day,
    session,
    weekContext,
    weeklyRequirements,
    athleteTrainingProfile,
  );
  if (!combo.allowed) {
    return { allowed: false, blockReason: combo.blockReason };
  }

  return {
    allowed: true,
    placementReason:
      countSessionsForDay(day) === 0
        ? "Dodano jako pierwsza sesja dnia."
        : "Dodano jako bezpieczna druga sesja dnia.",
  };
}

// ---------------------------------------------------------------------------
// Twarde minimum endurance na tydzień
// ---------------------------------------------------------------------------

export function getMinimumEnduranceSessionsPerWeek(
  _userSettings?: UserSchedulingSettings | null,
  _athlete?: AthleteSchedProfile | null,
): number {
  // TWARDA ZASADA — zawsze minimum 1, niezależnie od wszystkiego.
  return 1;
}

export function countWeeklyEnduranceSessions(weekPlan: SchedDay[]): number {
  return (weekPlan ?? []).reduce(
    (sum, day) => sum + (day.sessions ?? []).filter((s) => s.category === "endurance_conditioning").length,
    0,
  );
}

export function validateWeeklyEnduranceMinimum(
  weekPlan: SchedDay[],
  weeklyRequirements?: { absoluteMinimumEnduranceSessions?: number } | null,
): WeeklyEnduranceResult {
  const minimum = Math.max(
    1,
    weeklyRequirements?.absoluteMinimumEnduranceSessions ?? 1,
  );
  const count = countWeeklyEnduranceSessions(weekPlan);
  if (count >= minimum) {
    return { valid: true, count, minimum };
  }
  return {
    valid: false,
    count,
    minimum,
    unresolvedIssue: `Tydzień ma ${count} sesji endurance, wymagane minimum ${minimum} — nie udało się bezpiecznie dodać.`,
  };
}

// ---------------------------------------------------------------------------
// Endurance w dzień klubowy — dobór miejsca i adaptacja
// ---------------------------------------------------------------------------

export function canPlaceEnduranceOnClubDay(
  day: SchedDay,
  enduranceSession: SchedSession,
  userSettings?: UserSchedulingSettings | null,
  weekContext?: SchedWeekContext | null,
  weeklyRequirements?: unknown,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): EnduranceOnClubResult {
  if (!hasClubSession(day)) {
    return { allowed: false, blockReason: "To nie jest dzień klubowy." };
  }
  if (!hasAvailableSecondSessionSlot(day, userSettings)) {
    return { allowed: false, blockReason: "Brak wolnego slotu na drugą sesję w dniu klubowym." };
  }

  const club = (day.sessions ?? []).find((s) => s.category === "club");
  if (!club) return { allowed: false, blockReason: "Brak treningu klubowego w dniu." };

  const clubLoad = getClubSessionLoadLevel(club, athleteTrainingProfile);

  // Bardzo ciężki club: tylko minimalny recovery flush — jeśli endurance ma być
  // realnym bodźcem, jest to niebezpieczne (unresolved rozstrzyga wyżej).
  if (clubLoad === "very_heavy" && isHeavySession(enduranceSession)) {
    return {
      allowed: false,
      blockReason: "Bardzo ciężki trening klubowy — dozwolony tylko minimalny recovery flush.",
      clubLoad,
    };
  }

  const combo = validateTwoADayCombination(
    day,
    enduranceSession,
    weekContext,
    weeklyRequirements,
    athleteTrainingProfile,
  );
  if (!combo.allowed) {
    return { allowed: false, blockReason: combo.blockReason, clubLoad };
  }

  return { allowed: true, clubLoad };
}

/**
 * Dostosowuje sesję endurance do dnia klubowego wg oceny obciążenia klubu.
 * Zwraca NOWĄ sesję (nie mutuje) z powodami: adaptationReason + timingHint.
 */
export function adaptEnduranceForClubDay(
  day: SchedDay,
  enduranceSession: SchedSession,
  athleteTrainingProfile?: AthleteSchedProfile | null,
  weekContext?: SchedWeekContext | null,
): SchedSession {
  void weekContext;
  const club = (day.sessions ?? []).find((s) => s.category === "club");
  const clubLoad = club ? getClubSessionLoadLevel(club, athleteTrainingProfile) : "moderate";
  const youth = isYouthOrBeginner(athleteTrainingProfile);

  const adapted: SchedSession = { ...enduranceSession };

  // Domyślnie zalecamy endurance PRZED klubowym z zapasem czasu.
  adapted.afterClub = enduranceSession.afterClub ?? false;
  adapted.timingHint =
    "Wykonaj endurance minimum 4–6 godzin przed treningiem klubowym. Jeśli musi być po klubowym — tylko bardzo lekkie / recovery.";

  let level: SchedLoadLevel;
  let note: string;

  switch (clubLoad) {
    case "very_light":
      level = "moderate";
      note = "Klub bardzo lekki — endurance może być normalne, ale kontrolowane.";
      break;
    case "light":
      level = "moderate";
      note = "Klub lekki — endurance lekkie/umiarkowane, krótsze.";
      break;
    case "moderate":
      level = "low";
      note = "Obniżono intensywność endurance, bo trening klubowy był średni — krótkie, lekkie, low-intensity.";
      break;
    case "heavy":
      level = "low";
      adapted.category = "endurance_conditioning";
      note = "Obniżono intensywność endurance, bo zawodnik ocenił trening klubowy jako ciężki — tylko bardzo lekkie low-impact/recovery.";
      break;
    case "very_heavy":
    default:
      level = "low";
      note = "Bardzo ciężki club — endurance zredukowane do minimalnego recovery flush.";
      break;
  }

  // Endurance PO klubowym może być tylko bardzo lekkie.
  if (adapted.afterClub) {
    level = "low";
    note += " Endurance po klubowym — tylko bardzo lekkie / recovery / low-impact.";
  }

  // Youth/beginner: druga sesja krótsza i lżejsza.
  if (youth) {
    level = "low";
    if (typeof adapted.durationMin === "number") {
      adapted.durationMin = Math.min(adapted.durationMin, 25);
    }
    note += " Youth/beginner — druga sesja krótsza, lżejsza lub techniczna.";
  } else if (clubLoad === "heavy" || clubLoad === "very_heavy") {
    if (typeof adapted.durationMin === "number") {
      adapted.durationMin = Math.min(adapted.durationMin, 20);
    }
  }

  adapted.loadLevel = level;
  adapted.intensity = level === "low" ? "niska" : level === "moderate" ? "umiarkowana" : "niska";
  adapted.adaptationReason = note;
  adapted.placementReason =
    "Dodano endurance w dzień klubowy, bo to było jedyne bezpieczne miejsce do spełnienia minimum tygodniowego.";

  return adapted;
}

// ---------------------------------------------------------------------------
// Znajdź najlepszy dzień na endurance
// ---------------------------------------------------------------------------

function dayHasSlot(day: SchedDay, userSettings?: UserSchedulingSettings | null): boolean {
  return hasAvailableSecondSessionSlot(day, userSettings);
}

export function findBestDayForEndurance(
  weekPlan: SchedDay[],
  userSettings?: UserSchedulingSettings | null,
  weekContext?: SchedWeekContext | null,
  weeklyRequirements?: unknown,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): FindEnduranceDayResult {
  const candidate: SchedSession = { category: "endurance_conditioning", loadLevel: "moderate" };

  const eligible = (day: SchedDay): boolean =>
    !hasMatchSession(day) &&
    day.toMatch !== 0 &&
    day.toMatch !== 1 && // nie MD-1
    !hasEnduranceSession(day) &&
    dayHasSlot(day, userSettings);

  // Tier 1 — całkowicie wolny dzień (bez club, bez match, bez innych sesji).
  for (let i = 0; i < (weekPlan ?? []).length; i++) {
    const day = weekPlan[i];
    if (!eligible(day) || hasClubSession(day) || countSessionsForDay(day) > 0) continue;
    const check = canAddSessionToDay(
      day,
      candidate,
      userSettings,
      weekContext,
      weeklyRequirements,
      athleteTrainingProfile,
    );
    if (check.allowed) {
      return {
        dayIndex: i,
        tier: "no_club_no_match",
        placementReason: "Wybrano dzień bez treningu klubowego i bez meczu — najlepsze miejsce na endurance.",
      };
    }
  }

  // Tier 2 — dzień z gym / speed (ale bez club).
  for (let i = 0; i < (weekPlan ?? []).length; i++) {
    const day = weekPlan[i];
    if (!eligible(day) || hasClubSession(day)) continue;
    const hasGymOrSpeed = (day.sessions ?? []).some(
      (s) => s.category === "gym_strength" || s.category === "speed_sprint",
    );
    if (!hasGymOrSpeed) continue;
    const check = canAddSessionToDay(
      day,
      candidate,
      userSettings,
      weekContext,
      weeklyRequirements,
      athleteTrainingProfile,
    );
    if (check.allowed) {
      return {
        dayIndex: i,
        tier: "gym_or_speed",
        placementReason: "Dodano endurance w dzień z gym/speed, bo nie było wolnego dnia bez obciążenia.",
      };
    }
  }

  // Tier 3 — dzień klubowy (fallback, tylko po adaptacji).
  for (let i = 0; i < (weekPlan ?? []).length; i++) {
    const day = weekPlan[i];
    if (hasMatchSession(day) || day.toMatch === 0 || day.toMatch === 1) continue;
    if (!hasClubSession(day) || hasEnduranceSession(day) || !dayHasSlot(day, userSettings)) continue;
    const place = canPlaceEnduranceOnClubDay(
      day,
      { category: "endurance_conditioning", loadLevel: "low" },
      userSettings,
      weekContext,
      weeklyRequirements,
      athleteTrainingProfile,
    );
    if (place.allowed) {
      return {
        dayIndex: i,
        tier: "club_fallback",
        placementReason: "Dodano endurance w dzień klubowy, bo to było jedyne bezpieczne miejsce do spełnienia minimum tygodniowego.",
      };
    }
  }

  return {
    dayIndex: null,
    tier: null,
    unresolvedIssue: "Nie udało się bezpiecznie dodać wymaganego endurance w żadnym dniu tygodnia.",
  };
}
