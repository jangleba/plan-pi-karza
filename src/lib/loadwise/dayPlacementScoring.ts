// ============================================================================
// Loadwise — Scoring wyboru dnia dla brakujących sesji (gym / endurance / speed).
// ----------------------------------------------------------------------------
// Generator NIE wrzuca brakującej sesji losowo. Każdy dzień tygodnia jest
// oceniany wg zasad sportowych, limitu 2 sesji dziennie, meczu, celu, wieku,
// doświadczenia, readiness i ryzyka przeciążenia. Zwycięzca dostaje
// placementReason; blokady niosą reason; ryzyka niosą warnings.
// ============================================================================

import {
  canAddSessionToDay,
  countSessionsForDay,
  getMaxSessionsPerDay,
  hasAvailableSecondSessionSlot,
  hasClubSession,
  hasEnduranceSession,
  hasMatchSession,
  isTwoADayAllowed,
  isYouthOrBeginner,
  validateTwoADayCombination,
  type AthleteSchedProfile,
  type SchedDay,
  type SchedSession,
  type SchedWeekContext,
  type UserSchedulingSettings,
} from "./dailyScheduling";
import { getAthleteGoalRules } from "./weeklyRequirements";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export type PlacementSessionType = "gym" | "endurance" | "speed";

export interface DayScore {
  dayIndex: number | null;
  score: number;
  blocked: boolean;
  reason?: string;
  warnings: string[];
}

export interface PairResult {
  allowed: boolean;
  reason?: string;
}

export interface PlacementResult {
  dayIndex: number | null;
  session: SchedSession | null;
  score: number;
  reason?: string;
  warnings: string[];
  unresolvedIssue?: string;
}

const BLOCKED = -1_000_000;

// ---------------------------------------------------------------------------
// Helpery lokalne
// ---------------------------------------------------------------------------

function indexOfDay(day: SchedDay, weekPlan: SchedDay[]): number {
  const byRef = (weekPlan ?? []).indexOf(day);
  if (byRef >= 0) return byRef;
  if (typeof day.dayOfWeek === "number") {
    const byDow = (weekPlan ?? []).findIndex((d) => d.dayOfWeek === day.dayOfWeek);
    if (byDow >= 0) return byDow;
  }
  return -1;
}

function prevDayOf(day: SchedDay, weekPlan: SchedDay[]): SchedDay | null {
  const i = indexOfDay(day, weekPlan);
  return i > 0 ? weekPlan[i - 1] : null;
}

function isDayBeforeMatch(day: SchedDay): boolean {
  return day.toMatch === 1;
}

function isMatchDay(day: SchedDay): boolean {
  return day.toMatch === 0 || hasMatchSession(day);
}

function isDayAfterMatch(day: SchedDay, weekPlan: SchedDay[]): boolean {
  const prev = prevDayOf(day, weekPlan);
  return !!prev && (prev.toMatch === 0 || hasMatchSession(prev));
}

function dayHasCategory(day: SchedDay, cat: SchedSession["category"]): boolean {
  return (day.sessions ?? []).some((s) => s.category === cat);
}

function dayHasHeavyLegsGym(day: SchedDay): boolean {
  return (day.sessions ?? []).some((s) => s.category === "gym_strength" && s.isHeavyLegs);
}

function dayHasHeavyRunning(day: SchedDay): boolean {
  return (day.sessions ?? []).some(
    (s) =>
      s.category === "endurance_conditioning" &&
      (s.isHeavyConditioning || s.loadLevel === "high" || s.loadLevel === "very_high"),
  );
}

function dayHasHeavySpeed(day: SchedDay): boolean {
  return (day.sessions ?? []).some(
    (s) => s.category === "speed_sprint" && (s.isMaxVelocity || s.isFullSpeed),
  );
}

function dayHasHighLoad(day: SchedDay): boolean {
  return (day.sessions ?? []).some(
    (s) => s.loadLevel === "high" || s.loadLevel === "very_high" || s.isHeavyLegs || s.isFullSpeed,
  );
}

function speedIsFirst(day: SchedDay): boolean {
  const real = (day.sessions ?? []).filter(
    (s) => s.category !== "rest" && s.category !== "recovery_prehab" && s.category !== "mobility",
  );
  return real.length === 0 || real.every((s) => s.category === "speed_sprint");
}

// ---------------------------------------------------------------------------
// Budowanie kandydatów (profil-aware, youth-safe warianty)
// ---------------------------------------------------------------------------

export function buildCandidateSession(
  sessionType: PlacementSessionType,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): SchedSession {
  const youth = isYouthOrBeginner(athleteTrainingProfile);
  switch (sessionType) {
    case "gym":
      return youth
        ? {
            category: "gym_strength",
            loadLevel: "moderate",
            isHeavyLegs: false,
            title: "Youth-safe strength foundation",
          }
        : { category: "gym_strength", loadLevel: "high", isHeavyLegs: true };
    case "endurance":
      return youth
        ? {
            category: "endurance_conditioning",
            loadLevel: "low",
            title: "Easy aerobic / low-impact",
          }
        : { category: "endurance_conditioning", loadLevel: "moderate" };
    case "speed":
    default:
      return youth
        ? {
            category: "speed_sprint",
            loadLevel: "moderate",
            isMaxVelocity: false,
            isFullSpeed: false,
            title: "Youth-safe acceleration (mała objętość)",
          }
        : {
            category: "speed_sprint",
            loadLevel: "high",
            isMaxVelocity: true,
            isFullSpeed: true,
          };
  }
}

// ---------------------------------------------------------------------------
// canSafelyPairSessions — czy dwie sesje mogą stać w jednym dniu
// ---------------------------------------------------------------------------

export function canSafelyPairSessions(
  existingSession: SchedSession,
  newSession: SchedSession,
  weekContext?: SchedWeekContext | null,
  weeklyRequirements?: unknown,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): PairResult {
  // Klub + wydolność jest ZABLOKOWANE (twarda zasada).
  const cats = [existingSession.category, newSession.category];
  if (cats.includes("club") && cats.includes("endurance_conditioning")) {
    return { allowed: false, reason: "Endurance cannot be scheduled on club training day" };
  }
  const pseudoDay: SchedDay = { sessions: [existingSession] };
  const res = validateTwoADayCombination(
    pseudoDay,
    newSession,
    weekContext,
    weeklyRequirements,
    athleteTrainingProfile,
  );
  return { allowed: res.allowed, reason: res.blockReason };
}

// ---------------------------------------------------------------------------
// isDayBlockedForEndurance — twarda blokada endurance
// ---------------------------------------------------------------------------

export function isDayBlockedForEndurance(
  day: SchedDay,
  _weeklyRequirements?: unknown,
): boolean {
  if (hasClubSession(day)) return true; // klub + wydolność zablokowane
  if (isMatchDay(day)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// getDayPlacementWarnings — ryzyka (nie blokady) dla umieszczenia sesji
// ---------------------------------------------------------------------------

export function getDayPlacementWarnings(
  day: SchedDay,
  candidateSession: SchedSession,
  weekContext: SchedWeekContext | null | undefined,
  weeklyRequirements: unknown,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): string[] {
  void weekContext;
  void weeklyRequirements;
  const warnings: string[] = [];
  const youth = isYouthOrBeginner(athleteTrainingProfile);

  if (isDayBeforeMatch(day)) {
    warnings.push("Dzień bezpośrednio przed meczem — unikaj ciężkich bodźców.");
  }
  if (isMatchDay(day)) {
    warnings.push("Dzień meczowy — nie planuj dodatkowego treningu poza monitoringiem.");
  }
  if (dayHasHighLoad(day)) {
    warnings.push("Dzień ma już sesję o wysokim obciążeniu — druga sesja musi być lekka.");
  }
  if (youth && countSessionsForDay(day) >= 1) {
    warnings.push("Youth/beginner — druga sesja dnia musi być lekka i youth-safe.");
  }
  if (candidateSession.category === "endurance_conditioning" && hasClubSession(day)) {
    warnings.push("Endurance w dzień klubowy jest niedozwolone.");
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// scoreDayForGym
// ---------------------------------------------------------------------------

export function scoreDayForGym(
  day: SchedDay,
  weekPlan: SchedDay[],
  weekContext: SchedWeekContext | null | undefined,
  userSettings: UserSchedulingSettings | null | undefined,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): DayScore {
  const dayIndex = indexOfDay(day, weekPlan);
  const candidate = buildCandidateSession("gym", athleteTrainingProfile);
  const warnings: string[] = [];

  // --- Twarde blokady ---
  if (isMatchDay(day)) {
    return { dayIndex, score: BLOCKED, blocked: true, reason: "Dzień meczowy — brak dodatkowej siłowni.", warnings };
  }
  if (isDayBeforeMatch(day) && candidate.isHeavyLegs) {
    return {
      dayIndex,
      score: BLOCKED,
      blocked: true,
      reason: "Zablokowano ciężką siłę nóg dzień przed meczem.",
      warnings,
    };
  }
  const add = canAddSessionToDay(day, candidate, userSettings, weekContext, undefined, athleteTrainingProfile);
  if (!add.allowed) {
    return { dayIndex, score: BLOCKED, blocked: true, reason: add.blockReason, warnings };
  }
  // Dwie ciężkie siłownie dzień po dniu.
  const prev = prevDayOf(day, weekPlan);
  if (candidate.isHeavyLegs && prev && dayHasHeavyLegsGym(prev)) {
    return {
      dayIndex,
      score: BLOCKED,
      blocked: true,
      reason: "Zablokowano dwie ciężkie siłownie dzień po dniu.",
      warnings,
    };
  }

  // --- Scoring ---
  let score = 50;
  const empty = countSessionsForDay(day) === 0;

  if (empty && !isMatchDay(day)) score += 30; // dzień wolny bez meczu
  if (!dayHasHeavyRunning(day)) score += 10; // dzień bez ciężkiego biegania
  if (!isDayBeforeMatch(day)) score += 15; // nie bezpośrednio przed meczem
  // Oddalenie od drugiej ciężkiej siłowni.
  const nextIdx = dayIndex + 1;
  const nearHeavyGym =
    (prev && dayHasHeavyLegsGym(prev)) ||
    (weekPlan[nextIdx] && dayHasHeavyLegsGym(weekPlan[nextIdx]));
  if (!nearHeavyGym) score += 10;
  if (hasClubSession(day) && isTwoADayAllowed(userSettings)) score += 8; // club + gym gdy 2/dzień
  if (dayHasCategory(day, "speed_sprint") && speedIsFirst(day)) score += 8; // gym po szybkości

  // Obniżenia.
  if (isDayAfterMatch(day, weekPlan) && candidate.isHeavyLegs) {
    score -= 25;
    warnings.push("Dzień po meczu — ciężka siła nóg jest niewskazana.");
  }
  if (prev && dayHasHeavySpeed(prev)) {
    score -= 15;
    warnings.push("Dzień po ciężkiej szybkości — siłownia obciąża zmęczony układ nerwowy.");
  }
  if (dayHasHeavyRunning(day)) {
    score -= 15;
    warnings.push("Dzień z dużą objętością biegania — łączenie z siłownią zwiększa ryzyko.");
  }
  if (dayHasHighLoad(day)) {
    score -= 15;
    warnings.push("Dzień z sesją o wysokim obciążeniu.");
  }
  if (isYouthOrBeginner(athleteTrainingProfile) && !empty && candidate.isHeavyLegs) {
    score -= 20;
    warnings.push("Youth/beginner — druga ciężka sesja jest niewskazana.");
  }

  return { dayIndex, score, blocked: false, warnings };
}

// ---------------------------------------------------------------------------
// scoreDayForEndurance
// ---------------------------------------------------------------------------

export function scoreDayForEndurance(
  day: SchedDay,
  weekPlan: SchedDay[],
  weekContext: SchedWeekContext | null | undefined,
  userSettings: UserSchedulingSettings | null | undefined,
  athleteGoal: string | null | undefined,
  weeklyRequirements: unknown,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): DayScore {
  const dayIndex = indexOfDay(day, weekPlan);
  const candidate = buildCandidateSession("endurance", athleteTrainingProfile);
  const warnings: string[] = [];

  // --- Twarde blokady ---
  if (hasClubSession(day)) {
    return {
      dayIndex,
      score: BLOCKED,
      blocked: true,
      reason: "Endurance cannot be scheduled on club training day",
      warnings,
    };
  }
  if (isMatchDay(day)) {
    return { dayIndex, score: BLOCKED, blocked: true, reason: "Dzień meczowy — brak wydolności.", warnings };
  }
  if (isDayBeforeMatch(day)) {
    return {
      dayIndex,
      score: BLOCKED,
      blocked: true,
      reason: "Zablokowano ciężkie bieganie dzień przed meczem.",
      warnings,
    };
  }
  // Ciężka wydolność po ciężkiej sile nóg.
  const prev = prevDayOf(day, weekPlan);
  if (prev && dayHasHeavyLegsGym(prev) && candidate.loadLevel !== "low") {
    return {
      dayIndex,
      score: BLOCKED,
      blocked: true,
      reason: "Zablokowano ciężką wydolność po ciężkiej sile nóg.",
      warnings,
    };
  }
  const add = canAddSessionToDay(day, candidate, userSettings, weekContext, weeklyRequirements, athleteTrainingProfile);
  if (!add.allowed) {
    return { dayIndex, score: BLOCKED, blocked: true, reason: add.blockReason, warnings };
  }

  // --- Scoring ---
  const goal = getAthleteGoalRules(athleteGoal);
  let score = 50;
  const empty = countSessionsForDay(day) === 0;

  if (empty && !hasClubSession(day) && !isMatchDay(day)) score += 35; // wolny dzień bez klubu/meczu
  if (dayHasCategory(day, "gym_strength")) score += 15; // gym + endurance preferowane
  if (dayHasCategory(day, "speed_sprint") && speedIsFirst(day) && candidate.loadLevel === "low") {
    score += 10; // speed pierwszy, endurance lekki
  }
  if (isDayAfterMatch(day, weekPlan)) {
    if (candidate.loadLevel === "low") {
      score += 5;
      warnings.push("Dzień po meczu — tylko lekka wydolność / bieg regeneracyjny.");
    } else {
      score -= 20;
    }
  }
  if (goal.isEnduranceGoal) score += 8;

  return { dayIndex, score, blocked: false, warnings };
}

// ---------------------------------------------------------------------------
// scoreDayForSpeed
// ---------------------------------------------------------------------------

export function scoreDayForSpeed(
  day: SchedDay,
  weekPlan: SchedDay[],
  weekContext: SchedWeekContext | null | undefined,
  userSettings: UserSchedulingSettings | null | undefined,
  athleteGoal: string | null | undefined,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): DayScore {
  const dayIndex = indexOfDay(day, weekPlan);
  const candidate = buildCandidateSession("speed", athleteTrainingProfile);
  const warnings: string[] = [];
  const youth = isYouthOrBeginner(athleteTrainingProfile);

  // --- Twarde blokady ---
  if (isMatchDay(day)) {
    return { dayIndex, score: BLOCKED, blocked: true, reason: "Dzień meczowy — brak szybkości.", warnings };
  }
  if (isDayBeforeMatch(day) && (candidate.isMaxVelocity || candidate.isFullSpeed)) {
    return {
      dayIndex,
      score: BLOCKED,
      blocked: true,
      reason: "Uniknięto max velocity dzień przed meczem.",
      warnings,
    };
  }
  // Szybkość nie może być drugą sesją po ciężkim treningu (musi być pierwsza).
  if (countSessionsForDay(day) >= 1 && dayHasHighLoad(day)) {
    return {
      dayIndex,
      score: BLOCKED,
      blocked: true,
      reason: "Zablokowano speed_sprint jako drugą sesję po ciężkim treningu.",
      warnings,
    };
  }
  const add = canAddSessionToDay(day, candidate, userSettings, weekContext, undefined, athleteTrainingProfile);
  if (!add.allowed) {
    return { dayIndex, score: BLOCKED, blocked: true, reason: add.blockReason, warnings };
  }

  // --- Scoring ---
  const goal = getAthleteGoalRules(athleteGoal);
  const prev = prevDayOf(day, weekPlan);
  let score = 50;
  const empty = countSessionsForDay(day) === 0;

  if (empty && !isMatchDay(day)) score += 25; // świeży dzień
  if (!isDayAfterMatch(day, weekPlan)) score += 15; // nie po meczu
  if (!(prev && dayHasHeavyLegsGym(prev))) score += 10; // nie po ciężkich nogach
  if (dayHasCategory(day, "gym_strength")) score += 12; // szybkość sortuje się przed siłownią
  if (hasClubSession(day)) score += 8; // krótka szybkość przed klubowym
  if (dayHasCategory(day, "endurance_conditioning")) {
    const endLight = (day.sessions ?? []).some(
      (s) => s.category === "endurance_conditioning" && s.loadLevel === "low",
    );
    if (endLight && speedIsFirst(day)) score += 8; // lekka wydolność po szybkości
  }
  if (goal.isSpeedGoal) score += 8;

  // Obniżenia.
  if (isDayAfterMatch(day, weekPlan)) {
    score -= 20;
    warnings.push("Dzień po meczu — jakość sprintów będzie obniżona.");
  }
  if (prev && dayHasHeavyLegsGym(prev)) {
    score -= 20;
    warnings.push("Dzień po ciężkiej sile nóg — jakość szybkości spadnie.");
  }
  if (dayHasHeavyRunning(day)) {
    score -= 15;
    warnings.push("Dzień z ciężkim conditioning — sprint nie będzie świeży.");
  }
  if (!empty && dayHasHighLoad(day)) {
    score -= 25;
    warnings.push("Szybkość powinna być pierwszą jednostką dnia.");
  }
  if (youth && (candidate.isMaxVelocity || candidate.isFullSpeed)) {
    score -= 30;
    warnings.push("Youth/beginner — duża objętość max velocity jest niewskazana.");
  }

  return { dayIndex, score, blocked: false, warnings };
}

// ---------------------------------------------------------------------------
// placeSessionWithReason
// ---------------------------------------------------------------------------

export function placeSessionWithReason(
  session: SchedSession,
  targetDay: SchedDay,
  reason: string,
): SchedSession {
  const placed: SchedSession = { ...session, placementReason: reason };
  targetDay.sessions = [...(targetDay.sessions ?? []), placed];
  return placed;
}

// ---------------------------------------------------------------------------
// findBestPlacementForSession — ocena wszystkich dni i wybór najlepszego
// ---------------------------------------------------------------------------

function reasonForType(sessionType: PlacementSessionType, day: SchedDay, athlete?: AthleteSchedProfile | null): string {
  const youth = isYouthOrBeginner(athlete);
  switch (sessionType) {
    case "gym":
      if (youth) return "Wybrano youth-safe strength foundation, bo zawodnik jest młody/początkujący.";
      if (hasClubSession(day)) return "Wybrano ten dzień na siłownię przy treningu klubowym, bo dozwolone są 2 treningi dziennie.";
      return "Wybrano ten dzień na siłownię, bo jest wolny, oddalony od meczu i od drugiej ciężkiej siłowni.";
    case "endurance":
      if (dayHasCategory(day, "gym_strength"))
        return "Wybrano ten dzień dla wydolności, bo nie ma treningu klubowego i można połączyć ją z siłownią.";
      return "Wybrano ten dzień dla wydolności, bo nie ma treningu klubowego ani meczu.";
    case "speed":
    default:
      if (dayHasCategory(day, "gym_strength"))
        return "Wybrano ten dzień dla szybkości, bo zawodnik jest świeży i szybkość może być wykonana przed siłownią.";
      if (hasClubSession(day)) return "Wybrano krótką szybkość przed klubowym, bo cel zawodnika to przyspieszenie.";
      if (dayHasCategory(day, "endurance_conditioning"))
        return "Wybrano lekką wydolność po szybkości, żeby nie zaburzyć jakości sprintów.";
      return "Wybrano ten dzień dla szybkości, bo zawodnik może być świeży.";
  }
}

export function findBestPlacementForSession(
  sessionType: PlacementSessionType,
  weekPlan: SchedDay[],
  weekContext: SchedWeekContext | null | undefined,
  userSettings: UserSchedulingSettings | null | undefined,
  athleteGoal: string | null | undefined,
  weeklyRequirements: unknown,
  athleteTrainingProfile?: AthleteSchedProfile | null,
): PlacementResult {
  const scores: DayScore[] = (weekPlan ?? []).map((day) => {
    switch (sessionType) {
      case "gym":
        return scoreDayForGym(day, weekPlan, weekContext, userSettings, athleteTrainingProfile);
      case "endurance":
        return scoreDayForEndurance(
          day,
          weekPlan,
          weekContext,
          userSettings,
          athleteGoal,
          weeklyRequirements,
          athleteTrainingProfile,
        );
      case "speed":
      default:
        return scoreDayForSpeed(
          day,
          weekPlan,
          weekContext,
          userSettings,
          athleteGoal,
          athleteTrainingProfile,
        );
    }
  });

  let best: DayScore | null = null;
  for (const s of scores) {
    if (s.blocked || s.dayIndex === null || s.dayIndex < 0) continue;
    if (!best || s.score > best.score) best = s;
  }

  if (!best || best.dayIndex === null) {
    return {
      dayIndex: null,
      session: null,
      score: BLOCKED,
      warnings: [],
      unresolvedIssue: `Nie znaleziono bezpiecznego dnia na sesję typu ${sessionType}.`,
    };
  }

  const targetDay = weekPlan[best.dayIndex];
  const candidate = buildCandidateSession(sessionType, athleteTrainingProfile);
  const reason = reasonForType(sessionType, targetDay, athleteTrainingProfile);
  const session = placeSessionWithReason(candidate, targetDay, reason);

  return {
    dayIndex: best.dayIndex,
    session,
    score: best.score,
    reason,
    warnings: best.warnings,
  };
}
