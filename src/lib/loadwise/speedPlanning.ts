// ============================================================================
// Loadwise — Centralny silnik planowania szybkości (speed_sprint).
// ----------------------------------------------------------------------------
// JEDNO źródło prawdy dla: generatora, scoringu, walidatora i naprawy planu.
//
// Twarde zasady:
//   - KAŻDY pełny tydzień musi mieć minimum 1 bodziec speed_sprint.
//   - Cel szybkościowy (szybkość/przyspieszenie/sprint/COD/agility/...) → min. 2.
//   - Trening klubowy NIE liczy się jako speed_sprint.
//   - Nie usuwamy szybkości przy obciążeniu — degradujemy (microdose/primer/technika).
//   - Niski readiness → krótka, jakościowa wersja (microdose), nie pełna max velocity.
//   - MD-1 → tylko krótki neural primer, nigdy pełna max velocity.
//   - Szybkość nie po ciężkiej wydolności ani jako druga sesja po ciężkiej sile nóg.
//   - Łączona z inną jednostką → szybkość ZAWSZE pierwsza.
//   - Youth/beginner → technika/koordynacja, niska objętość, bez agresywnego COD
//     przy bólu kolana/kostki; historia urazu dwugłowego → ostrożna progresja.
//   - Nie da się spełnić bez łamania zasad → unresolvedIssue, nie łamiemy zasady.
// ============================================================================

import {
  countSessionsForDay,
  hasAvailableSecondSessionSlot,
  hasClubSession,
  hasMatchSession,
  hasSpeedSession,
  countSpeedSessionsForDay,
  wouldCreateDuplicateSpeedDay,
  canAddSessionToDay,
  type AthleteSchedProfile,
  type SchedDay,
  type SchedSession,
  type SchedWeekContext,
  type UserSchedulingSettings,
} from "./dailyScheduling";
import {
  getRequiredSpeedSessions as getRequiredSpeedSessionsBase,
  getAthleteGoalRules,
  type WeeklyRequirements,
  type WeekRequirementContext,
  type UserRequirementSettings,
} from "./weeklyRequirements";
import {
  createSpeedSessionVariant as createSpeedSessionVariantBase,
  createAccelerationDecelerationSession as createAccelerationDecelerationSessionBase,
  createMaxVelocityCODSession as createMaxVelocityCODSessionBase,
  createSpeedMicrodoseSession,
  youthSpeedSession,
  normalizeGeneratedSession,
  type GeneratedSession,
  type SessionGenContext,
} from "./sessionVariants";
import type { AthleteTrainingProfile } from "./athleteProfile";
import type { PainLocation } from "./types";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export interface SpeedAthleteProfile extends AthleteSchedProfile {
  athleteGoal?: string | null;
  readiness?: number | null;
  currentPain?: PainLocation[] | null;
  injuryHistory?: PainLocation[] | null;
  preferredTrainingStyle?: "foundation" | "development" | "performance" | null;
}

export type SpeedFocus =
  | "acceleration_deceleration"
  | "max_velocity_cod"
  | "technical"
  | "primer"
  | "microdose"
  | "unknown";

export interface SpeedPlacement {
  dayIndex: number;
  score: number;
  forcedPrimer: boolean;
  /** Wymuszony downgrade pełnej szybkości do microdose/techniki (ryzyko obciążenia). */
  forcedDowngrade: boolean;
  reason: string;
}

export interface FindSpeedDayResult {
  dayIndex: number | null;
  forcedPrimer: boolean;
  forcedDowngrade?: boolean;
  placementReason?: string;
  unresolvedIssue?: string;
}

export interface SpeedSessionValidationIssue {
  reason: string;
  code: string;
  suggestedSubcategory?: string;
}

export interface SpeedSessionValidationReport {
  ok: boolean;
  issues: SpeedSessionValidationIssue[];
  warnings: string[];
}

export interface WeeklySpeedValidationReport {
  ok: boolean;
  count: number;
  requiredSpeedSessions: number;
  distinctFocusOk: boolean;
  unresolvedIssues: string[];
  warnings: string[];
}

export interface AddMissingSpeedResult {
  weekPlan: SchedDay[];
  added: number;
  count: number;
  requiredSpeedSessions: number;
  unresolvedIssues: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpery lokalne
// ---------------------------------------------------------------------------

const LOWER_LIMB_PAIN: PainLocation[] = ["knee", "ankle"];

const ACCEL_FOCUS = new Set<string>([
  "acceleration_deceleration",
  "acceleration",
  "deceleration",
  "braking",
  "first_step",
  "sprint_mechanics",
]);
const MAXV_FOCUS = new Set<string>([
  "max_velocity_cod",
  "max_velocity",
  "flying_sprints",
  "change_of_direction",
  "agility_speed",
]);
const AGGRESSIVE_COD = new Set<string>([
  "max_velocity_cod",
  "change_of_direction",
  "agility_speed",
]);

function isYouthOrBeginner(a?: SpeedAthleteProfile | null): boolean {
  if (!a) return true;
  const youthStage =
    a.developmentStage === "child_foundation" || a.developmentStage === "early_youth";
  const beginner = a.gymExperienceLevel === "none" || a.gymExperienceLevel === "beginner";
  return youthStage || beginner || a.preferredTrainingStyle === "foundation";
}

function hasKneeAnklePain(a?: SpeedAthleteProfile | null): boolean {
  const pain = new Set<PainLocation>(a?.currentPain ?? []);
  return LOWER_LIMB_PAIN.some((p) => pain.has(p));
}

function hasHamstringHistory(a?: SpeedAthleteProfile | null): boolean {
  const hist = new Set<PainLocation>([...(a?.injuryHistory ?? []), ...(a?.currentPain ?? [])]);
  return hist.has("hamstring");
}

function resolveReadiness(a?: SpeedAthleteProfile | null): number {
  return typeof a?.readiness === "number" ? a.readiness : 6;
}

function dayHasCategory(day: SchedDay, cat: SchedSession["category"]): boolean {
  return (day.sessions ?? []).some((s) => s.category === cat);
}

function dayHasSpeed(day: SchedDay): boolean {
  return hasSpeedSession(day);
}

/**
 * Czy sąsiedni dzień (D-1 lub D+1) ma speed_sprint.
 * TWARDA ZASADA: między dwiema jednostkami speed_sprint musi być min. 1 pełny
 * dzień przerwy — więc dzień bezpośrednio przy istniejącej szybkości jest zablokowany.
 */
function adjacentDayHasSpeed(weekPlan: SchedDay[], dayIndex: number): boolean {
  const prev = dayIndex > 0 ? weekPlan[dayIndex - 1] : null;
  const next = dayIndex < weekPlan.length - 1 ? weekPlan[dayIndex + 1] : null;
  return (!!prev && hasSpeedSession(prev)) || (!!next && hasSpeedSession(next));
}

function prevDayHasHeavyLegs(day: SchedDay, weekPlan: SchedDay[]): boolean {
  const i = weekPlan.indexOf(day);
  const prev = i > 0 ? weekPlan[i - 1] : null;
  return !!prev && dayHasHeavyLegsGym(prev);
}

function weekIsOverloaded(weekPlan: SchedDay[]): boolean {
  let club = 0;
  let match = 0;
  for (const d of weekPlan ?? []) {
    if (hasClubSession(d)) club += 1;
    if (isMatchDay(d)) match += 1;
  }
  return club + match >= 4 || club >= 4 || match >= 2;
}

function dayHasHeavyLegsGym(day: SchedDay): boolean {
  return (day.sessions ?? []).some((s) => s.category === "gym_strength" && s.isHeavyLegs);
}

function dayHasHeavyConditioning(day: SchedDay): boolean {
  return (day.sessions ?? []).some(
    (s) =>
      s.category === "endurance_conditioning" &&
      (s.isHeavyConditioning || s.loadLevel === "high" || s.loadLevel === "very_high"),
  );
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

// ---------------------------------------------------------------------------
// Zliczanie i wymagania
// ---------------------------------------------------------------------------

/** Liczba bodźców speed_sprint w tygodniu (klub NIE liczy się jako speed). */
export function countSpeedSessions(weekPlan: SchedDay[]): number {
  return (weekPlan ?? []).reduce(
    (sum, day) => sum + (day.sessions ?? []).filter((s) => s.category === "speed_sprint").length,
    0,
  );
}

/** Wymagana liczba speed_sprint — deleguje do centralnego silnika wymagań. */
export function getRequiredSpeedSessions(
  weekContext: WeekRequirementContext,
  userSettings: UserRequirementSettings | null | undefined,
  athleteGoal: string | null | undefined,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
): number {
  return getRequiredSpeedSessionsBase(
    weekContext,
    userSettings,
    athleteGoal,
    athleteTrainingProfile ?? undefined,
  );
}

export function hasEnoughSpeedSessions(
  weekPlan: SchedDay[],
  weeklyRequirements: Pick<WeeklyRequirements, "requiredSpeedSessions">,
): boolean {
  return countSpeedSessions(weekPlan) >= (weeklyRequirements?.requiredSpeedSessions ?? 1);
}

// ---------------------------------------------------------------------------
// Klasyfikacja charakteru sesji szybkościowej
// ---------------------------------------------------------------------------

export function classifySpeedFocus(session: GeneratedSession | SchedSession): SpeedFocus {
  const sub = (session as GeneratedSession).subcategory as string | undefined;
  if (sub) {
    if (ACCEL_FOCUS.has(sub)) return "acceleration_deceleration";
    if (MAXV_FOCUS.has(sub)) return "max_velocity_cod";
    if (sub === "technical_speed") return "technical";
    if (sub === "speed_primer") return "primer";
    if (sub === "speed_microdose") return "microdose";
  }
  // fallback po tytule (SchedSession bez subcategory)
  const t = (session.title ?? "").toLowerCase();
  if (t.includes("max") || t.includes("prędkość max") || t.includes("cod") || t.includes("kierunku"))
    return "max_velocity_cod";
  if (t.includes("przyspiesz") || t.includes("hamowanie") || t.includes("accel"))
    return "acceleration_deceleration";
  if (t.includes("primer")) return "primer";
  if (t.includes("microdose")) return "microdose";
  if (t.includes("techni")) return "technical";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Generatory sesji szybkościowej (profil- i kontuzja-aware)
// ---------------------------------------------------------------------------

/** Youth-safe technika szybkości — niezależnie od profilu wymusza wariant techniczny. */
export function createYouthSpeedTechniqueSession(
  ctx: SessionGenContext,
  _athleteTrainingProfile?: SpeedAthleteProfile | null,
): GeneratedSession {
  void _athleteTrainingProfile;
  return youthSpeedSession(ctx);
}

export function createAccelerationDecelerationSession(
  ctx: SessionGenContext,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
): GeneratedSession {
  return createAccelerationDecelerationSessionBase(
    ctx,
    athleteTrainingProfile as AthleteTrainingProfile | null | undefined,
  );
}

/** Max velocity / COD z uwzględnieniem bólu kolana/kostki i historii dwugłowego. */
export function createMaxVelocityCODSession(
  ctx: SessionGenContext,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
): GeneratedSession {
  const a = athleteTrainingProfile as AthleteTrainingProfile | null | undefined;

  // Ból kolana/kostki → bez agresywnego COD, tylko prostoliniowa max velocity.
  if (hasKneeAnklePain(athleteTrainingProfile) && ctx.toMatch !== 1) {
    return normalizeGeneratedSession({
      category: "speed_sprint",
      subcategory: "max_velocity",
      title: "Szybkość: prędkość max prostoliniowa (bez agresywnego COD)",
      description:
        "Ból kolana/kostki — pomijamy agresywne zmiany kierunku. Praca nad prędkością " +
        "maksymalną w linii prostej: build-upy i loty z pełną regeneracją.",
      durationMinutes: 40,
      intensity: "wysoka",
      loadLevel: "high",
      blocks: [
        { name: "Rozgrzewka + build-upy", detail: "15 min" },
        { name: "Flying sprints prostoliniowe", detail: "2–4 x lot 20 m, pełna przerwa" },
        { name: "Transfer z piłką (bez ostrych cięć)", detail: "sprint + akcja" },
      ],
      generatedBy: "engine",
      placementReason:
        ctx.placementReason ?? "Ból kolana/kostki — max velocity bez agresywnego COD.",
      sourceRule: "speed/max_velocity_no_cod",
      athleteProfileApplied: true,
      safetyProfileApplied: true,
    });
  }

  // Historia urazu dwugłowego → ostrożna progresja (submaks build-upy, mniejsza objętość).
  if (hasHamstringHistory(athleteTrainingProfile) && ctx.toMatch !== 1) {
    return normalizeGeneratedSession({
      category: "speed_sprint",
      subcategory: "max_velocity",
      title: "Szybkość: max velocity — ostrożna progresja (historia dwugłowego)",
      description:
        "Historia urazu mięśnia dwugłowego — progresja objętości i intensywności krok po " +
        "kroku. Więcej build-upów, mniej lotów, pełna regeneracja, stop przy spadku jakości.",
      durationMinutes: 40,
      intensity: "umiarkowana",
      loadLevel: "moderate",
      blocks: [
        { name: "Rozszerzona rozgrzewka + aktywacja tylnej taśmy", detail: "18 min" },
        { name: "Build-upy submaksymalne", detail: "4–6 x 30 m progresywnie" },
        { name: "1–2 loty kontrolowane (jeśli jakość dobra)", detail: "lot 15–20 m" },
      ],
      generatedBy: "engine",
      placementReason:
        ctx.placementReason ?? "Historia dwugłowego — ostrożna progresja max velocity.",
      sourceRule: "speed/max_velocity_hamstring_progression",
      athleteProfileApplied: true,
      safetyProfileApplied: true,
    });
  }

  return createMaxVelocityCODSessionBase(ctx, a);
}

/**
 * Główny generator szybkości: slot 1 = accel/decel, slot 2 = max velocity/COD.
 * Youth/beginner, niski readiness i MD-1 → bezpieczny wariant. Uwzględnia
 * kontuzje przez wrappery accel/max-velocity.
 */
export function createSpeedSessionVariant(
  ctx: SessionGenContext,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
): GeneratedSession {
  const a = athleteTrainingProfile as AthleteTrainingProfile | null | undefined;
  if (isYouthOrBeginner(athleteTrainingProfile)) return youthSpeedSession(ctx);
  const readiness =
    typeof ctx.readiness === "number" ? ctx.readiness : resolveReadiness(athleteTrainingProfile);
  if (readiness <= 5) return createSpeedMicrodoseSession(ctx, a);
  const slot = ctx.speedSlot ?? 1;
  if (slot === 2) return createMaxVelocityCODSession(ctx, athleteTrainingProfile);
  if (slot === 1 && (hasKneeAnklePain(athleteTrainingProfile) || hasHamstringHistory(athleteTrainingProfile))) {
    return createAccelerationDecelerationSession(ctx, athleteTrainingProfile);
  }
  return createSpeedSessionVariantBase(ctx, a);
}

// ---------------------------------------------------------------------------
// Walidacja pojedynczej sesji szybkościowej dla profilu
// ---------------------------------------------------------------------------

export function validateSpeedSessionForAthleteProfile(
  session: GeneratedSession,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
  ctx: { toMatch?: number | null } = {},
): SpeedSessionValidationReport {
  const issues: SpeedSessionValidationIssue[] = [];
  const warnings: string[] = [];

  if (session.category !== "speed_sprint") return { ok: true, issues, warnings };

  const focus = classifySpeedFocus(session);
  const youth = isYouthOrBeginner(athleteTrainingProfile);
  const isMaxV = focus === "max_velocity_cod" || session.tags.includes("max_velocity");

  if (youth && isMaxV) {
    issues.push({
      code: "youth_max_velocity",
      reason: "Youth/beginner — duża objętość max velocity nie może być domyślną jednostką.",
      suggestedSubcategory: "technical_speed",
    });
  }

  if (hasKneeAnklePain(athleteTrainingProfile) && AGGRESSIVE_COD.has(session.subcategory)) {
    issues.push({
      code: "cod_with_knee_pain",
      reason: "Ból kolana/kostki — agresywne COD jest niedozwolone.",
      suggestedSubcategory: "max_velocity",
    });
  }

  if (ctx.toMatch === 1 && session.tags.includes("max_velocity")) {
    issues.push({
      code: "max_velocity_md1",
      reason: "MD-1 — pełna max velocity jest niedozwolona dzień przed meczem.",
      suggestedSubcategory: "speed_primer",
    });
  }

  return { ok: issues.length === 0, issues, warnings };
}

// ---------------------------------------------------------------------------
// Bezpieczne miejsca na szybkość (scoring)
// ---------------------------------------------------------------------------

export function getSafeSpeedPlacements(
  weekPlan: SchedDay[],
  weekContext: SchedWeekContext | null | undefined,
  userSettings: UserSchedulingSettings | null | undefined,
  athleteGoal: string | null | undefined,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
): SpeedPlacement[] {
  const goal = getAthleteGoalRules(athleteGoal);
  const placements: SpeedPlacement[] = [];

  (weekPlan ?? []).forEach((day, dayIndex) => {
    // Match day and MD-1 are hard exclusions. A primer is not a hidden
    // replacement for a blocked speed session.
    if (isMatchDay(day) || isDayBeforeMatch(day)) return;
    if (dayHasSpeed(day)) return; // nie dwie szybkości tego samego dnia
    // TWARDA ZASADA: min. 1 dzień przerwy między speed — nie dzień po dniu.
    if (adjacentDayHasSpeed(weekPlan, dayIndex)) return;
    if (!hasAvailableSecondSessionSlot(day, userSettings)) return;
    // Tego samego dnia: nie po ciężkiej sile nóg ani ciężkim conditioning
    // (szybkość musi być świeża i pierwsza — dwa ciężkie bodźce blokuje canAddSessionToDay).
    if (dayHasHeavyLegsGym(day)) return;
    if (dayHasHeavyConditioning(day)) return;

    // KOREKTA: pełna szybkość MOŻE być dzień PO ciężkiej sile nóg — nie blokujemy.
    // Decyduje scoring + downgrade zależny od readiness/bólu/meczu/przeciążenia.
    const afterHeavyLegs = prevDayHasHeavyLegs(day, weekPlan);
    const readiness = resolveReadiness(athleteTrainingProfile);
    const pain =
      hasKneeAnklePain(athleteTrainingProfile) || hasHamstringHistory(athleteTrainingProfile);
    const overloaded = weekIsOverloaded(weekPlan);
    const youthHighLoad = isYouthOrBeginner(athleteTrainingProfile) && (overloaded || afterHeavyLegs);

    const forcedPrimer = isDayBeforeMatch(day);
    // Downgrade pełnej szybkości tylko przy realnym ryzyku — inaczej pełna szybkość.
    const forcedDowngrade =
      forcedPrimer ||
      readiness <= 5 ||
      pain ||
      overloaded ||
      youthHighLoad ||
      (afterHeavyLegs && (readiness <= 6 || isDayBeforeMatch(day)));

    const candidate: SchedSession = {
      category: "speed_sprint",
      loadLevel: forcedPrimer || forcedDowngrade ? "low" : "high",
      isMaxVelocity: !(forcedPrimer || forcedDowngrade),
      isFullSpeed: !(forcedPrimer || forcedDowngrade),
    };
    const add = canAddSessionToDay(
      day,
      candidate,
      userSettings,
      weekContext,
      undefined,
      athleteTrainingProfile,
    );
    if (!add.allowed) return;

    let score = 50;
    const empty = countSessionsForDay(day) === 0;
    if (empty) score += 30; // świeży dzień
    if (!isDayAfterMatch(day, weekPlan)) score += 15;
    if (dayHasCategory(day, "gym_strength")) score += 12; // szybkość przed siłownią
    if (hasClubSession(day)) score += 8; // krótka szybkość przed klubowym
    if (dayHasCategory(day, "endurance_conditioning")) score += 8; // szybkość przed lekką wydolnością
    if (goal.isSpeedGoal) score += 8;
    if (isDayAfterMatch(day, weekPlan)) score -= 20;
    if (afterHeavyLegs) score -= 15; // dzień po ciężkich nogach: gorszy, ale dozwolony
    if (forcedPrimer) score -= 40; // MD-1 tylko primer

    const reason = forcedDowngrade && afterHeavyLegs && !forcedPrimer
      ? "Szybkość dzień po ciężkich nogach — obniżona do microdose/techniki (readiness/ból/przeciążenie)."
      : afterHeavyLegs
        ? "Wybrano ten dzień na pełną szybkość mimo ciężkich nóg wczoraj — readiness i obciążenie OK."
        : dayHasCategory(day, "gym_strength")
          ? "Wybrano ten dzień dla szybkości — świeży, szybkość może być przed siłownią."
          : hasClubSession(day)
            ? "Wybrano krótką szybkość przed treningiem klubowym."
            : dayHasCategory(day, "endurance_conditioning")
              ? "Wybrano ten dzień dla szybkości — przed lekką wydolnością (szybkość pierwsza)."
              : "Wybrano świeży dzień na szybkość.";

    placements.push({ dayIndex, score, forcedPrimer, forcedDowngrade, reason });
  });

  return placements.sort((a, b) => b.score - a.score);
}

export function findBestDayForSpeedSession(
  weekPlan: SchedDay[],
  weekContext: SchedWeekContext | null | undefined,
  userSettings: UserSchedulingSettings | null | undefined,
  athleteGoal: string | null | undefined,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
): FindSpeedDayResult {
  const placements = getSafeSpeedPlacements(
    weekPlan,
    weekContext,
    userSettings,
    athleteGoal,
    athleteTrainingProfile,
  );
  const best = placements[0];
  if (!best) {
    return {
      dayIndex: null,
      forcedPrimer: false,
      unresolvedIssue:
        "Nie znaleziono bezpiecznego dnia na szybkość (mecz/limit/ciężkie obciążenie) — nie łamiemy zasady.",
    };
  }
  return {
    dayIndex: best.dayIndex,
    forcedPrimer: best.forcedPrimer,
    forcedDowngrade: best.forcedDowngrade,
    placementReason: best.reason,
  };
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

function toSchedSession(gen: GeneratedSession): SchedSession {
  const focus = classifySpeedFocus(gen);
  return {
    category: "speed_sprint",
    title: gen.title,
    intensity: gen.intensity,
    loadLevel: gen.loadLevel,
    durationMin: gen.durationMinutes,
    isMaxVelocity: focus === "max_velocity_cod" || gen.tags.includes("max_velocity"),
    isFullSpeed: gen.loadLevel === "high" || gen.loadLevel === "very_high",
    placementReason: gen.placementReason,
  };
}

/** Wstawia szybkość jako PIERWSZĄ jednostkę dnia (szybkość zawsze pierwsza). */
function placeSpeedFirst(day: SchedDay, session: SchedSession): void {
  day.sessions = [session, ...(day.sessions ?? [])];
}

/** Który slot dołożyć, aby nie powielać charakteru sesji. */
function nextSpeedSlot(weekPlan: SchedDay[]): 1 | 2 {
  let hasAccel = false;
  for (const day of weekPlan ?? []) {
    for (const s of day.sessions ?? []) {
      if (s.category !== "speed_sprint") continue;
      if (classifySpeedFocus(s) === "acceleration_deceleration") hasAccel = true;
    }
  }
  return hasAccel ? 2 : 1;
}

function buildContextForDay(
  day: SchedDay,
  weekPlan: SchedDay[],
  slot: 1 | 2,
  athlete?: SpeedAthleteProfile | null,
  placementReason?: string,
): SessionGenContext {
  return {
    hasClub: hasClubSession(day),
    toMatch: day.toMatch ?? null,
    isDayAfterMatch: isDayAfterMatch(day, weekPlan),
    readiness: resolveReadiness(athlete),
    goal: athlete?.athleteGoal ?? undefined,
    speedSlot: slot,
    placementReason,
  };
}

// ---------------------------------------------------------------------------
// Naprawa planu — dodanie brakujących szybkości
// ---------------------------------------------------------------------------

export function addMissingSpeedSessions(
  weekPlan: SchedDay[],
  weekContext: WeekRequirementContext & SchedWeekContext,
  userSettings: (UserRequirementSettings & UserSchedulingSettings) | null | undefined,
  weeklyRequirements: WeeklyRequirements,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
): AddMissingSpeedResult {
  const unresolvedIssues: string[] = [];
  const warnings: string[] = [];

  const required = Math.max(1, weeklyRequirements.requiredSpeedSessions);

  let added = 0;
  let guard = 0;
  while (countSpeedSessions(weekPlan) < required && guard < 14) {
    guard += 1;
    const best = findBestDayForSpeedSession(
      weekPlan,
      weekContext,
      userSettings,
      athleteTrainingProfile?.athleteGoal,
      athleteTrainingProfile,
    );
    if (best.dayIndex === null) break;

    const day = weekPlan[best.dayIndex];
    const slot = nextSpeedSlot(weekPlan);
    const ctx = buildContextForDay(
      day,
      weekPlan,
      slot,
      athleteTrainingProfile,
      best.placementReason,
    );
    // Downgrade (readiness/ból/przeciążenie/po ciężkich nogach z ryzykiem) → microdose.
    const gen = best.forcedDowngrade
      ? createSpeedMicrodoseSession(ctx, athleteTrainingProfile as AthleteTrainingProfile | null | undefined)
      : createSpeedSessionVariant(ctx, athleteTrainingProfile);
    if (!gen) {
      warnings.push(`Nie udało się zbudować sesji szybkości dla dnia ${best.dayIndex}.`);
      break;
    }
    // Defensywnie: nigdy nie twórz drugiej szybkości tego samego dnia.
    const newSession = toSchedSession(gen);
    if (wouldCreateDuplicateSpeedDay(day, newSession)) {
      warnings.push(`Pominięto dodanie drugiej szybkości w dniu ${best.dayIndex}.`);
      break;
    }
    placeSpeedFirst(day, newSession);
    added += 1;
  }

  const count = countSpeedSessions(weekPlan);
  if (count < required) {
    unresolvedIssues.push(
      `Tydzień ma ${count} z ${required} wymaganych sesji szybkości — brakującej nie da się dodać bez łamania zasad (mecz/limit/ciężkie obciążenie).`,
    );
  }

  return {
    weekPlan,
    added,
    count,
    requiredSpeedSessions: required,
    unresolvedIssues,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// TWARDA ZASADA: nigdy dwie jednostki speed_sprint jednego dnia
// (wykrywanie, znajdowanie alternatywnego dnia, naprawa)
// ---------------------------------------------------------------------------

export interface DuplicateSpeedDayValidationReport {
  ok: boolean;
  offendingDayIndices: number[];
  totalExtraSpeedSessions: number;
}

/** Wykrywa dni z więcej niż 1 jednostką speed_sprint. */
export function validateNoDuplicateSpeedSameDay(
  weekPlan: SchedDay[],
): DuplicateSpeedDayValidationReport {
  const offendingDayIndices: number[] = [];
  let totalExtraSpeedSessions = 0;
  (weekPlan ?? []).forEach((day, i) => {
    const n = countSpeedSessionsForDay(day);
    if (n > 1) {
      offendingDayIndices.push(i);
      totalExtraSpeedSessions += n - 1;
    }
  });
  return {
    ok: offendingDayIndices.length === 0,
    offendingDayIndices,
    totalExtraSpeedSessions,
  };
}

// ---------------------------------------------------------------------------
// TWARDA ZASADA: nigdy speed_sprint dzień po dniu (min. 1 dzień przerwy)
// ---------------------------------------------------------------------------

/** Indeksy dni tygodnia, które mają jakąkolwiek jednostkę speed_sprint. */
export function getSpeedDays(weekPlan: SchedDay[]): number[] {
  const out: number[] = [];
  (weekPlan ?? []).forEach((day, i) => {
    if (hasSpeedSession(day)) out.push(i);
  });
  return out;
}

/**
 * Czy dwa dni ze szybkością są zbyt blisko siebie.
 * Zbyt blisko = mniej niż 1 pełny dzień przerwy (różnica indeksów <= 1).
 */
export function areSpeedDaysTooClose(dayIndexA: number, dayIndexB: number): boolean {
  return Math.abs(dayIndexA - dayIndexB) <= 1;
}

export interface SpeedGapValidationReport {
  ok: boolean;
  speedDays: number[];
  /** Pary dni ze szybkością zbyt blisko siebie (np. [ [0,1], [3,4] ]). */
  tooClosePairs: [number, number][];
}

/**
 * Sprawdza, czy między każdymi dwiema jednostkami speed_sprint jest min. 1 dzień
 * przerwy. Wykrywa też speed dzień po dniu.
 */
export function validateMinimumGapBetweenSpeedSessions(
  weekPlan: SchedDay[],
): SpeedGapValidationReport {
  const speedDays = getSpeedDays(weekPlan);
  const tooClosePairs: [number, number][] = [];
  for (let i = 0; i < speedDays.length - 1; i += 1) {
    if (areSpeedDaysTooClose(speedDays[i], speedDays[i + 1])) {
      tooClosePairs.push([speedDays[i], speedDays[i + 1]]);
    }
  }
  return { ok: tooClosePairs.length === 0, speedDays, tooClosePairs };
}

/** Alias jawnie nazwany: speed nigdy dzień po dniu. */
export function validateNoBackToBackSpeedDays(weekPlan: SchedDay[]): SpeedGapValidationReport {
  return validateMinimumGapBetweenSpeedSessions(weekPlan);
}

/**
 * Znajduje inny bezpieczny dzień na przeniesioną szybkość z zachowaniem min. 1
 * dnia przerwy od pozostałych jednostek speed_sprint. getSafeSpeedPlacements już
 * odrzuca dni sąsiadujące ze szybkością, więc wynik automatycznie ma odstęp.
 */
export function findAlternativeDayForSpeedWithGap(
  weekPlan: SchedDay[],
  speedSession: SchedSession,
  context: SpeedRepairContext,
): FindSpeedDayResult {
  return findAlternativeDayForSpeed(weekPlan, speedSession, context);
}

export interface RepairBackToBackSpeedResult {
  weekPlan: SchedDay[];
  moved: number;
  removed: number;
  unresolvedIssues: string[];
}

/**
 * Naprawa speed dzień po dniu:
 *  - dla każdej pary zbyt blisko siebie zostawia wcześniejszą szybkość,
 *  - drugą próbuje PRZENIEŚĆ na dzień z zachowaniem min. 1 dnia przerwy,
 *  - jeśli się nie da → USUWA drugą szybkość i dodaje unresolvedIssue,
 *  - nigdy nie zostawia dwóch speed_sprint dzień po dniu.
 * Idempotentna: uruchomiona dwa razy nie tworzy duplikatów.
 */
export function repairBackToBackSpeedSessions(
  weekPlan: SchedDay[],
  context: SpeedRepairContext,
): RepairBackToBackSpeedResult {
  const unresolvedIssues: string[] = [];
  let moved = 0;
  let removed = 0;

  let guard = 0;
  while (guard < 14) {
    guard += 1;
    const report = validateMinimumGapBetweenSpeedSessions(weekPlan);
    if (report.ok) break;

    const [, laterIndex] = report.tooClosePairs[0];
    const laterDay = weekPlan[laterIndex];
    const extra = (laterDay.sessions ?? []).find((s) => s.category === "speed_sprint");
    if (!extra) break;

    // Wyjmij drugą szybkość z późniejszego dnia.
    laterDay.sessions = (laterDay.sessions ?? []).filter((s) => s !== extra);

    const alt = findAlternativeDayForSpeedWithGap(weekPlan, extra, {
      ...context,
      excludeDayIndex: laterIndex,
    });
    if (
      alt.dayIndex !== null &&
      !wouldCreateDuplicateSpeedDay(weekPlan[alt.dayIndex], extra) &&
      !adjacentDayHasSpeed(weekPlan, alt.dayIndex)
    ) {
      placeSpeedFirst(weekPlan[alt.dayIndex], {
        ...extra,
        placementReason:
          "Przeniesiono szybkość, aby zachować min. 1 dzień przerwy — speed nie może być dzień po dniu.",
      });
      moved += 1;
    } else {
      removed += 1;
      unresolvedIssues.push(
        `Usunięto szybkość z dnia ${laterIndex} — brak dnia z min. 1 dniem przerwy (speed nie może być dzień po dniu).`,
      );
    }
  }

  return { weekPlan, moved, removed, unresolvedIssues };
}


export interface SpeedRepairContext {
  weekContext?: SchedWeekContext | null;
  userSettings?: UserSchedulingSettings | null;
  athleteGoal?: string | null;
  athleteTrainingProfile?: SpeedAthleteProfile | null;
  /** Indeks dnia, którego wykluczamy jako źródło (nie przenoś na ten sam dzień). */
  excludeDayIndex?: number;
}

/**
 * Znajduje inny bezpieczny dzień na przeniesioną jednostkę szybkości.
 * Nigdy nie wskaże dnia, który już ma speed_sprint, ani dnia źródłowego.
 */
export function findAlternativeDayForSpeed(
  weekPlan: SchedDay[],
  _speedSession: SchedSession,
  context: SpeedRepairContext,
): FindSpeedDayResult {
  const placements = getSafeSpeedPlacements(
    weekPlan,
    context.weekContext,
    context.userSettings,
    context.athleteGoal,
    context.athleteTrainingProfile,
  ).filter((p) => p.dayIndex !== context.excludeDayIndex);

  // Relocation is deliberately directional: use the nearest future valid
  // date, never a higher-scoring earlier date.
  const best = placements
    .filter(
      (placement) =>
        context.excludeDayIndex === undefined || placement.dayIndex > context.excludeDayIndex,
    )
    .sort((a, b) => a.dayIndex - b.dayIndex)[0];
  if (!best) {
    return {
      dayIndex: null,
      forcedPrimer: false,
      unresolvedIssue:
        "Brak alternatywnego dnia na przeniesienie drugiej szybkości — nie tworzę duplikatu.",
    };
  }
  return {
    dayIndex: best.dayIndex,
    forcedPrimer: best.forcedPrimer,
    forcedDowngrade: best.forcedDowngrade,
    placementReason: best.reason,
  };
}

export interface RepairDuplicateSpeedResult {
  weekPlan: SchedDay[];
  moved: number;
  removed: number;
  unresolvedIssues: string[];
}

/**
 * Naprawa dni z dwiema jednostkami szybkościowymi:
 *  - zostawia pierwszą (główną) szybkość dnia,
 *  - każdą kolejną próbuje PRZENIEŚĆ na inny bezpieczny dzień,
 *  - jeśli nie da się przenieść → USUWA duplikat i dodaje unresolvedIssue,
 *  - nigdy nie zostawia dwóch speed_sprint w jednym dniu.
 * Idempotentna: uruchomiona dwa razy nie tworzy duplikatów.
 */
export function repairDuplicateSpeedSameDay(
  weekPlan: SchedDay[],
  context: SpeedRepairContext,
): RepairDuplicateSpeedResult {
  const unresolvedIssues: string[] = [];
  let moved = 0;
  let removed = 0;

  (weekPlan ?? []).forEach((day, dayIndex) => {
    let speeds = (day.sessions ?? []).filter((s) => s.category === "speed_sprint");
    if (speeds.length <= 1) return;

    // Zostaw pierwszą, przenoś/usuwaj kolejne.
    const extras = speeds.slice(1);
    for (const extra of extras) {
      // Usuń z dnia źródłowego.
      day.sessions = (day.sessions ?? []).filter((s) => s !== extra);

      const alt = findAlternativeDayForSpeed(weekPlan, extra, {
        ...context,
        excludeDayIndex: dayIndex,
      });
      if (alt.dayIndex !== null && !wouldCreateDuplicateSpeedDay(weekPlan[alt.dayIndex], extra)) {
        const relocated: SchedSession = {
          ...extra,
          placementReason:
            "Przeniesiono drugą szybkość na inny dzień — dwie jednostki szybkości jednego dnia są zabronione.",
        };
        placeSpeedFirst(weekPlan[alt.dayIndex], relocated);
        moved += 1;
      } else {
        removed += 1;
        unresolvedIssues.push(
          `Usunięto zduplikowaną szybkość z dnia ${dayIndex} — brak alternatywnego dnia na przeniesienie.`,
        );
      }
    }
    speeds = (day.sessions ?? []).filter((s) => s.category === "speed_sprint");
  });

  return { weekPlan, moved, removed, unresolvedIssues };
}


// ---------------------------------------------------------------------------

export function validateWeeklySpeedMinimum(
  weekPlan: SchedDay[],
  weekContext: WeekRequirementContext,
  userSettings: UserRequirementSettings | null | undefined,
  weeklyRequirements: WeeklyRequirements,
  athleteTrainingProfile?: SpeedAthleteProfile | null,
): WeeklySpeedValidationReport {
  void weekContext;
  void userSettings;
  void athleteTrainingProfile;
  const unresolvedIssues: string[] = [];
  const warnings: string[] = [];

  const count = countSpeedSessions(weekPlan);
  const required = Math.max(1, weeklyRequirements.requiredSpeedSessions);

  if (count < required) {
    unresolvedIssues.push(`Tydzień ma ${count} z ${required} wymaganych sesji szybkości.`);
  }

  // Dwa dni z szybkością nie powinny mieć identycznego charakteru.
  const focuses: SpeedFocus[] = [];
  for (const day of weekPlan ?? []) {
    for (const s of day.sessions ?? []) {
      if (s.category === "speed_sprint") focuses.push(classifySpeedFocus(s));
    }
  }
  let distinctFocusOk = true;
  if (focuses.length >= 2) {
    const hasAccel = focuses.includes("acceleration_deceleration");
    const hasMaxV = focuses.includes("max_velocity_cod");
    if (!(hasAccel && hasMaxV)) {
      distinctFocusOk = false;
      warnings.push(
        "Przy 2 sesjach szybkości zalecane: 1× acceleration/deceleration i 1× max velocity/COD.",
      );
    }
  }

  return {
    ok: unresolvedIssues.length === 0,
    count,
    requiredSpeedSessions: required,
    distinctFocusOk,
    unresolvedIssues,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Re-eksporty
// ---------------------------------------------------------------------------

export { getAthleteGoalRules };
export type { WeeklyRequirements, WeekRequirementContext };
