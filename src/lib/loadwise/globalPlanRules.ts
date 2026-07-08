/**
 * globalPlanRules — GLOBALNE TWARDE ZASADY generowania planu Loadwise/TheBallLab.
 *
 * To jest centralna warstwa reguł, która obowiązuje ZAWSZE, niezależnie od
 * kombinacji mainGoal, limitation/secondaryGoal, position, trainingLevel,
 * seasonPhase, competitionLevel, clubSchedule, matchSchedule i gymAccess.
 *
 * Moduł NIE generuje sesji od zera — składa się z czystych, deterministycznych
 * funkcji reguł, które silnik (planEngine) i finalny walidator wywołują na
 * realnym wyjściu generatora (SessionDay[]). Dzięki temu każdy plan przechodzi
 * przez ten sam zestaw twardych zasad zanim trafi do UI.
 *
 * KOLEJNOŚĆ DECYZJI (priorytety planowania):
 *   1. kontuzja / powrót / bardzo wysokie zmęczenie
 *   2. mecz
 *   3. dzień przed meczem
 *   4. treningi klubowe
 *   5. mainGoal (obowiązkowy bodziec tygodnia)
 *   6. gymAccess
 *   7. limitation/secondaryGoal
 *   8. pozycja
 *   9. poziom treningowy
 *   10. okres sezonu
 *   11. poziom rozgrywkowy
 *   12. recovery / mobility / prehab jako uzupełnienie
 *
 * ZASADA NADRZĘDNA: mainGoal ZAWSZE wyznacza obowiązkowy bodziec.
 * limitation/secondaryGoal NIGDY nie może usunąć ani zastąpić mainGoal.
 */

import type {
  Profile,
  Goal,
  Position,
  Level,
  SeasonPhase,
  CompetitionLevel,
  SecondaryLimiter,
  Intensity,
  SessionCategory,
  SessionDay,
} from "./types";
import {
  MAIN_GOAL_RULES,
  LIMITATION_RULES,
  POSITION_RULES,
  LEVEL_RULES,
  SEASON_RULES,
  computeSessionLoad,
  computeWeeklyLoadScore,
  countWeekRoles,
  blockWeekOf,
} from "./planRules";
import {
  isMainGymSession,
  isEnduranceSession,
  isSpeedSession,
  isRecoverySession,
  isClubSession,
  isMatchSession,
  isHeavyLegsSession,
  isHeavyRunningSession,
  isChangeOfDirectionSession,
} from "./sessionClassification";

// ---------------------------------------------------------------------------
// 1. buildTrainingContext — jedno źródło prawdy o zawodniku dla całego silnika.
// ---------------------------------------------------------------------------

export interface TrainingContext {
  mainGoal: Goal;
  limitation: SecondaryLimiter | null;
  position: Position;
  trainingLevel: Level;
  seasonPhase: SeasonPhase;
  competitionLevel: CompetitionLevel;
  /** gymAccess wynika WYŁĄCZNIE z profilu (dostęp do siłowni). */
  gymAccess: boolean;
  clubSchedule: number[]; // 1=Mon ... 7=Sun
  matchSchedule: number[]; // dni meczowe (1..7), jeśli znane
  injuryStatus: {
    hasPainOrInjury: boolean;
    lowerLimbPain: boolean;
    returnAfterBreak: boolean;
  };
  fatigueStatus: {
    highFatigue: boolean;
  };
  age: number;
}

const LOWER_LIMB_PAIN = new Set(["knee", "ankle", "hamstring", "groin", "hip"]);

/** Podkategorie siłowe wymagające sprzętu/siłowni (bodyweight NIE wymaga). */
const GYM_EQUIPMENT_SUBCATS = new Set<string>([
  "lower_strength",
  "upper_strength",
  "full_body_strength",
  "power_maintenance",
  "strength_maintenance",
  "light_full_body",
  "core_strength",
]);

/** Czy sesja to siłownia wymagająca sprzętu (nie wariant z masy ciała). */
export function requiresGymEquipment(session: SessionDay): boolean {
  if (!isMainGymSession(session)) return false;
  return GYM_EQUIPMENT_SUBCATS.has(session.classification?.subcategory ?? "");
}

/** Buduje kontekst treningowy z profilu zawodnika (onboarding). */
export function buildTrainingContext(profile: Profile): TrainingContext {
  const lowerLimbPain =
    (profile.painLocations ?? []).some((p) => LOWER_LIMB_PAIN.has(p)) || false;
  const returnAfterBreak =
    profile.goal === "return" ||
    profile.seasonPhase === "return_injury" ||
    profile.secondaryLimiter === "return";

  const matchSchedule: number[] = [];
  if (typeof profile.usualMatchDay === "number") matchSchedule.push(profile.usualMatchDay);

  return {
    mainGoal: profile.goal,
    limitation: profile.secondaryLimiter,
    position: profile.position,
    trainingLevel: profile.level,
    seasonPhase: profile.seasonPhase,
    competitionLevel: profile.competitionLevel,
    gymAccess: profile.hasGym === true,
    clubSchedule: profile.clubTrainingDays ?? [],
    matchSchedule,
    injuryStatus: {
      hasPainOrInjury: profile.painInjury === true,
      lowerLimbPain,
      returnAfterBreak,
    },
    fatigueStatus: {
      highFatigue: profile.secondaryLimiter === "fatigue",
    },
    age: profile.age,
  };
}

// ---------------------------------------------------------------------------
// 2. getMainGoalRules — obowiązkowe bodźce + zasady gymAccess + fallback.
// ---------------------------------------------------------------------------

export interface GoalRuleView {
  goal: Goal;
  focusLabel: string;
  mandatoryCategories: SessionCategory[];
  mandatoryCount: number;
  /** Czy cel korzysta z siłowni, jeśli gymAccess = true. */
  usesGymWhenAvailable: boolean;
  /** Bodziec zastępczy dla braku siłowni (field/bodyweight/no-equipment). */
  noGymFallbackSubcategory: string;
  /** Bezpieczny domyślny bodziec zgodny z celem (NIE recovery). */
  safeDefaultSubcategory: string;
}

/** Cele, dla których siłownia jest OBOWIĄZKOWA, gdy gymAccess = true. */
const GOAL_USES_GYM: Record<Goal, boolean> = {
  speed: false, // siłownia to wsparcie, nie bodziec obowiązkowy
  agility: false,
  strength: true,
  power: true,
  endurance: false,
  mobility: false,
  general: true,
  matchready: false,
  return: false,
};

const GOAL_NO_GYM_FALLBACK: Record<Goal, string> = {
  speed: "sprint_mechanics",
  agility: "deceleration",
  strength: "bodyweight_strength",
  power: "bodyweight_strength",
  endurance: "easy_aerobic",
  mobility: "mobility",
  general: "bodyweight_strength",
  matchready: "speed_microdose",
  return: "low_impact_conditioning",
};

export function getMainGoalRules(goal: Goal): GoalRuleView {
  const rule = MAIN_GOAL_RULES[goal];
  return {
    goal,
    focusLabel: rule.focusLabel,
    mandatoryCategories: rule.mandatoryCategories,
    mandatoryCount: rule.mandatoryCount,
    usesGymWhenAvailable: GOAL_USES_GYM[goal],
    noGymFallbackSubcategory: GOAL_NO_GYM_FALLBACK[goal],
    safeDefaultSubcategory: rule.safeDefault.subcategory,
  };
}

// ---------------------------------------------------------------------------
// 3. getLimitationRules — wsparcie lub ograniczenie ryzyka, NIE nadpisuje celu.
// ---------------------------------------------------------------------------

export interface LimitationRuleView {
  limitation: SecondaryLimiter | null;
  supportCategory: SessionCategory | null;
  riskNote: string;
  forcesLowImpact: boolean;
  /** Redukcja tygodniowego load (0..1) — używana dla fatigue/return. */
  loadReduction: number;
}

export function getLimitationRules(limitation: SecondaryLimiter | null): LimitationRuleView {
  if (!limitation) {
    return {
      limitation: null,
      supportCategory: null,
      riskNote: "Brak dodatkowego ograniczenia.",
      forcesLowImpact: false,
      loadReduction: 0,
    };
  }
  const rule = LIMITATION_RULES[limitation];
  const loadReduction = limitation === "fatigue" ? 0.25 : limitation === "return" ? 0.35 : 0;
  return {
    limitation,
    supportCategory: rule.supportCategory,
    riskNote: rule.riskNote,
    forcesLowImpact: rule.forcesLowImpact,
    loadReduction,
  };
}

// ---------------------------------------------------------------------------
// 4. getMandatoryWeeklySessions — obowiązkowe sesje wynikające z mainGoal.
// ---------------------------------------------------------------------------

export interface MandatorySessionSpec {
  category: SessionCategory;
  subcategory: string;
  count: number;
  gymRequired: boolean;
}

export function getMandatoryWeeklySessions(context: TrainingContext): MandatorySessionSpec[] {
  const view = getMainGoalRules(context.mainGoal);
  const specs: MandatorySessionSpec[] = [];

  for (const category of view.mandatoryCategories) {
    // gymAccess steruje tym, czy siła to gym czy bodyweight/field.
    if (category === "gym_strength") {
      specs.push({
        category: "gym_strength",
        subcategory: context.gymAccess ? view.safeDefaultSubcategory : "bodyweight_strength",
        count: view.mandatoryCount,
        gymRequired: context.gymAccess,
      });
    } else {
      specs.push({
        category,
        subcategory: view.safeDefaultSubcategory,
        count: view.mandatoryCount,
        gymRequired: false,
      });
    }
  }
  return specs;
}

// ---------------------------------------------------------------------------
// 5. getSupportSessions — sesje wspierające (limitation/position/gym/season).
// ---------------------------------------------------------------------------

export interface SupportSessionSpec {
  category: SessionCategory;
  source: "limitation" | "position" | "season";
  note: string;
}

export function getSupportSessions(context: TrainingContext): SupportSessionSpec[] {
  const specs: SupportSessionSpec[] = [];
  const lim = getLimitationRules(context.limitation);
  if (lim.supportCategory) {
    // limitation NIE może zastąpić mainGoal — dodaje tylko wsparcie.
    let cat = lim.supportCategory;
    if (cat === "gym_strength" && !context.gymAccess) cat = "other"; // bez siłowni: field/bodyweight
    specs.push({ category: cat, source: "limitation", note: lim.riskNote });
  }
  // akcent pozycyjny (nie zmienia celu)
  specs.push({
    category: "other",
    source: "position",
    note: POSITION_RULES[context.position].accent,
  });
  // sezon: w sezonie dokładamy prehab/mobility jako uzupełnienie
  specs.push({
    category: "mobility",
    source: "season",
    note: SEASON_RULES[context.seasonPhase].note,
  });
  return specs;
}

// ---------------------------------------------------------------------------
// 6. scoreSessionLoad — pełny profil obciążenia pojedynczej sesji.
// ---------------------------------------------------------------------------

export interface SessionLoadProfile {
  intensity: Intensity;
  volume: number; // minuty jako proxy objętości
  duration: number;
  neuromuscularLoad: number;
  metabolicLoad: number;
  lowerBodyLoad: number;
  technicalLoad: number;
  recoveryCost: number;
  priority: number; // 1 = najwyższy (mecz), rośnie w dół
  totalScore: number;
}

const INTENSITY_NUM: Record<Intensity, number> = {
  niska: 1,
  umiarkowana: 2,
  wysoka: 3.2,
};

function categoryPriority(cat: SessionCategory | undefined): number {
  switch (cat) {
    case "match":
      return 1;
    case "club":
      return 2;
    case "gym_strength":
    case "speed_sprint":
    case "endurance_conditioning":
      return 3;
    case "mobility":
    case "recovery_prehab":
      return 5;
    default:
      return 4;
  }
}

export function scoreSessionLoad(session: SessionDay): SessionLoadProfile {
  const cls = session.classification;
  const cat = cls?.category;
  const i = INTENSITY_NUM[session.intensity];
  const duration = session.durationMin;
  const volume = duration; // minuty jako proxy objętości

  const heavyLegs = isHeavyLegsSession(session);
  const highRun = isHeavyRunningSession(session);
  const isSpeed = isSpeedSession(session);
  const isEnd = isEnduranceSession(session);
  const isGym = isMainGymSession(session);

  const neuromuscularLoad = (isSpeed || isGym) ? i * 3 : i * 1.2;
  const metabolicLoad = (isEnd || highRun) ? i * 3 : i * 1.1;
  const lowerBodyLoad = heavyLegs || isSpeed || highRun ? i * 2.5 : i * 0.8;
  const technicalLoad = cat === "other" || isSpeed ? i * 1.5 : i * 0.6;
  const recoveryCost = i * (duration / 30) * (isRecoverySession(session) ? 0.3 : 1);

  return {
    intensity: session.intensity,
    volume,
    duration,
    neuromuscularLoad: round1(neuromuscularLoad),
    metabolicLoad: round1(metabolicLoad),
    lowerBodyLoad: round1(lowerBodyLoad),
    technicalLoad: round1(technicalLoad),
    recoveryCost: round1(recoveryCost),
    priority: categoryPriority(cat),
    totalScore: Math.round(computeSessionLoad(session)),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// 7. canPlaceSession — twarde blokady konfliktów następstwa i tego samego dnia.
// ---------------------------------------------------------------------------

export interface PlacementCheck {
  allowed: boolean;
  reason: string | null;
}

function isSpeedSprint(s: SessionDay): boolean {
  return s.classification?.category === "speed_sprint";
}
function dayHasSpeed(day: SessionDay | undefined | null): boolean {
  if (!day) return false;
  return isSpeedSprint(day) || (day.secondSession ? isSpeedSprint(day.secondSession) : false);
}
function oneHasHeavyLegs(s: SessionDay): boolean {
  // Zgodnie z post-passem schedulera: "ciężkie nogi" = tag lower_body_high.
  return (s.loadTags ?? []).includes("lower_body_high");
}
function dayHasHeavyLegs(day: SessionDay | undefined | null): boolean {
  if (!day) return false;
  return (
    oneHasHeavyLegs(day) ||
    (day.secondSession ? oneHasHeavyLegs(day.secondSession) : false)
  );
}
function dayHasMatch(day: SessionDay | undefined | null): boolean {
  if (!day) return false;
  return isMatchSession(day) || day.dayType === "match";
}
function dayHasClub(day: SessionDay | undefined | null): boolean {
  if (!day) return false;
  return isClubSession(day) || day.dayType === "club";
}
function realSessionsOnDay(day: SessionDay | undefined | null): number {
  if (!day) return 0;
  const main = day.dayType === "rest" ? 0 : 1;
  return main + (day.secondSession ? 1 : 0);
}
function isHardSession(session: SessionDay): boolean {
  return (
    session.intensity === "wysoka" &&
    (isSpeedSession(session) ||
      isEnduranceSession(session) ||
      isMainGymSession(session) ||
      isChangeOfDirectionSession(session))
  );
}

/**
 * Sprawdza, czy sesja może wejść w dany dzień tygodnia (indeks dayIndex).
 * Blokuje twarde konflikty następstwa i tego samego dnia.
 */
export function canPlaceSession(
  dayIndex: number,
  session: SessionDay,
  week: SessionDay[],
  _context?: TrainingContext,
): PlacementCheck {
  const prev = dayIndex > 0 ? week[dayIndex - 1] : null;
  const next = dayIndex < week.length - 1 ? week[dayIndex + 1] : null;
  const current = week[dayIndex];

  const isSpeed = isSpeedSession(session);
  const isCOD = isChangeOfDirectionSession(session);
  const isHardCOD = isCOD && session.intensity === "wysoka";
  const isHeavyLower = isHeavyLegsSession(session) && session.intensity !== "niska";
  const isHardEnd = isEnduranceSession(session) && session.intensity === "wysoka";
  const isPlyoHeavy = session.intensity === "wysoka" && (session.loadTags ?? []).includes("plyometric_contacts");

  // max 2 jednostki dziennie
  if (realSessionsOnDay(current) >= 2) {
    return { allowed: false, reason: "Maksymalnie 2 jednostki dziennie." };
  }
  // dwie mocne jednostki sportowe tego samego dnia
  if (isHardSession(session) && current && current.dayType !== "rest" && isHardSession(current)) {
    return { allowed: false, reason: "Dwie mocne jednostki sportowe tego samego dnia są zabronione." };
  }
  // speed + speed tego samego dnia
  if (isSpeed && dayHasSpeed(current)) {
    return { allowed: false, reason: "Dwie jednostki szybkościowe tego samego dnia są zabronione." };
  }
  // speed dzień po speed / dzień przed speed (minimum 1 dzień przerwy)
  if (isSpeed && (dayHasSpeed(prev) || dayHasSpeed(next))) {
    return { allowed: false, reason: "Speed_sprint musi mieć minimum 1 dzień przerwy od kolejnego speed." };
  }
  // speed dzień po ciężkiej siłowni nóg
  if (isSpeed && dayHasHeavyLegs(prev)) {
    return { allowed: false, reason: "Speed dzień po ciężkiej siłowni nóg jest zabroniony." };
  }
  // hard COD dzień po speed / po heavy lower gym
  if (isHardCOD && (dayHasSpeed(prev) || dayHasHeavyLegs(prev))) {
    return { allowed: false, reason: "Hard COD dzień po speed lub ciężkiej siłowni nóg jest zabroniony." };
  }
  // heavy lower gym dzień przed meczem
  if (isHeavyLower && dayHasMatch(next)) {
    return { allowed: false, reason: "Ciężka siłownia nóg dzień przed meczem jest zabroniona." };
  }
  // hard endurance dzień przed meczem
  if (isHardEnd && dayHasMatch(next)) {
    return { allowed: false, reason: "Ciężka wydolność dzień przed meczem jest zabroniona." };
  }
  // heavy plyo dzień po meczu
  if (isPlyoHeavy && dayHasMatch(prev)) {
    return { allowed: false, reason: "Ciężkie plyo dzień po meczu jest zabronione." };
  }
  // dwa ciężkie lower body dni z rzędu
  if (isHeavyLower && dayHasHeavyLegs(prev)) {
    return { allowed: false, reason: "Dwa ciężkie dni dolne z rzędu są zabronione." };
  }
  // club + gym + running jeden dzień
  if (dayHasClub(current)) {
    const addsGym = isMainGymSession(session);
    const addsRun = isEnduranceSession(session) || isHeavyRunningSession(session);
    const currentHasGym = isMainGymSession(current) || (current.secondSession && isMainGymSession(current.secondSession));
    const currentHasRun = isEnduranceSession(current) || (current.secondSession && isEnduranceSession(current.secondSession));
    if ((addsGym && currentHasRun) || (addsRun && currentHasGym)) {
      return { allowed: false, reason: "Club + gym + running w jeden dzień jest zabronione." };
    }
    // club + hard cokolwiek
    if (isHardSession(session)) {
      return { allowed: false, reason: "Trening klubowy + mocna jednostka tego samego dnia jest zabroniony." };
    }
  }

  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// 10. calculateWeeklyLoadScore — wynik obciążenia tygodnia.
// ---------------------------------------------------------------------------

export function calculateWeeklyLoadScore(week: SessionDay[]): number {
  return computeWeeklyLoadScore(week);
}

// ---------------------------------------------------------------------------
// 13. compareWeekSimilarity — podobieństwo dwóch tygodni (0..1).
// ---------------------------------------------------------------------------

function weekSignatureCounts(week: SessionDay[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of week) {
    if (d.dayType === "rest" && d.durationMin === 0) continue;
    const list = [d, ...(d.secondSession ? [d.secondSession] : [])];
    for (const s of list) {
      const cat = s.classification?.category ?? s.dayType;
      const durBucket = Math.round((s.durationMin ?? 0) / 15) * 15;
      const key = `${cat}:${s.intensity}:${durBucket}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Zwraca podobieństwo tygodni 0..1 (multiset overlap / większy rozmiar). */
export function compareWeekSimilarity(weekA: SessionDay[], weekB: SessionDay[]): number {
  const a = weekSignatureCounts(weekA);
  const b = weekSignatureCounts(weekB);
  const keys = new Set([...a.keys(), ...b.keys()]);
  let overlap = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const k of keys) {
    const ca = a.get(k) ?? 0;
    const cb = b.get(k) ?? 0;
    overlap += Math.min(ca, cb);
    sizeA += ca;
    sizeB += cb;
  }
  const denom = Math.max(sizeA, sizeB);
  return denom === 0 ? 0 : overlap / denom;
}

// ---------------------------------------------------------------------------
// 11. validateWeek — twarde zasady pojedynczego tygodnia.
// ---------------------------------------------------------------------------

export interface WeekValidation {
  valid: boolean;
  errors: string[];
}

export function validateWeek(
  week: SessionDay[],
  context: TrainingContext,
  opts: { isFullWeek: boolean } = { isFullWeek: true },
): WeekValidation {
  const errors: string[] = [];
  const view = getMainGoalRules(context.mainGoal);
  const counts = countWeekRoles(week, context.mainGoal);
  const hasMatch = week.some((d) => dayHasMatch(d));

  if (opts.isFullWeek) {
    // 5. mainGoal ma obowiązkową sesję.
    if (counts.mandatory < 1) {
      errors.push(`missing-mandatory-goal-session:${view.focusLabel}`);
    }
    // twarde minimum wydolności zawsze.
    if (counts.endurance < 1) {
      errors.push("missing-endurance");
    }
    // recovery nie może dominować bez powodu.
    const recoveryAllowedToDominate =
      hasMatch ||
      context.injuryStatus.hasPainOrInjury ||
      context.injuryStatus.returnAfterBreak ||
      context.fatigueStatus.highFatigue ||
      context.seasonPhase === "transition";
    if (!recoveryAllowedToDominate && counts.recovery > counts.mandatory + counts.support) {
      errors.push("recovery-dominates");
    }
  }

  // gymAccess=false nie może generować siłowni wymagającej sprzętu
  // (bodyweight_strength jest dozwolony jako wariant bez sprzętu).
  if (!context.gymAccess) {
    const hasEquipGym = week.some(
      (d) => requiresGymEquipment(d) || (d.secondSession ? requiresGymEquipment(d.secondSession) : false),
    );
    if (hasEquipGym) errors.push("gym-generated-without-access");
  }
  // gymAccess=true nie może być ignorowany dla celów, które używają siłowni.
  if (context.gymAccess && view.usesGymWhenAvailable && opts.isFullWeek) {
    const hasGym = week.some(
      (d) => isMainGymSession(d) || (d.secondSession && isMainGymSession(d.secondSession)),
    );
    if (!hasGym) errors.push("gym-access-ignored");
  }

  // Konflikty następstwa/tego-samego-dnia.
  const conflicts = findWeekConflicts(week, context);
  for (const c of conflicts) errors.push(`conflict:${c}`);

  return { valid: errors.length === 0, errors };
}

/** Wykrywa realne konflikty w gotowym tygodniu (bez dodawania sesji). */
export function findWeekConflicts(week: SessionDay[], context: TrainingContext): string[] {
  const conflicts: string[] = [];
  for (let i = 0; i < week.length; i++) {
    const day = week[i];
    if (day.dayType === "rest") continue;
    const prev = i > 0 ? week[i - 1] : null;
    const next = i < week.length - 1 ? week[i + 1] : null;

    // speed dzień po speed
    if (dayHasSpeed(day) && dayHasSpeed(prev)) conflicts.push("speed-after-speed");
    // speed po ciężkiej siłowni nóg
    if (dayHasSpeed(day) && dayHasHeavyLegs(prev)) conflicts.push("speed-after-heavy-legs");
    // heavy lower dzień przed meczem
    if (dayHasHeavyLegs(day) && dayHasMatch(next)) conflicts.push("heavy-lower-before-match");
    // hard endurance dzień przed meczem
    if (
      isEnduranceSession(day) &&
      day.intensity === "wysoka" &&
      dayHasMatch(next)
    )
      conflicts.push("hard-endurance-before-match");
    // dwa ciężkie dolne dni z rzędu
    if (dayHasHeavyLegs(day) && dayHasHeavyLegs(prev)) conflicts.push("two-heavy-lower-in-a-row");
    // club + gym + running jeden dzień
    if (dayHasClub(day)) {
      const gym = isMainGymSession(day) || (day.secondSession && isMainGymSession(day.secondSession));
      const run = isEnduranceSession(day) || (day.secondSession && isEnduranceSession(day.secondSession));
      if (gym && run) conflicts.push("club-gym-running-same-day");
    }
    // dwie mocne jednostki tego samego dnia
    if (day.secondSession && isHardSession(day) && isHardSession(day.secondSession)) {
      conflicts.push("two-hard-sessions-same-day");
    }
  }
  return [...new Set(conflicts)];
}

// ---------------------------------------------------------------------------
// 12. validatePlan — twarde zasady całego 4-tygodniowego bloku.
// ---------------------------------------------------------------------------

export interface PlanValidation {
  valid: boolean;
  errors: string[];
  weekScores: number[];
  weekSimilarityScores: number[]; // podobieństwo kolejnych par tygodni
  weekErrors: string[][];
}

/**
 * Waliduje pełny blok (lista tygodni). Sprawdza obowiązkowe sesje mainGoal,
 * gymAccess, progresję (w1<w2<w3, w4<w3, w3 najwyższy), brak copy-paste
 * (similarity > 75%) i konflikty.
 */
export function validatePlan(weeks: SessionDay[][], context: TrainingContext): PlanValidation {
  const errors: string[] = [];
  const weekErrors: string[][] = [];
  const fullWeeks = weeks.filter((w) => countRealDays(w) === 7);

  // walidacja per tydzień
  weeks.forEach((w) => {
    const isFullWeek = countRealDays(w) === 7;
    const res = validateWeek(w, context, { isFullWeek });
    weekErrors.push(res.errors);
    if (!res.valid) errors.push(...res.errors);
  });

  const weekScores = weeks.map((w) => calculateWeeklyLoadScore(w));

  // progresja bloku — tylko dla pełnego 4-tygodniowego bloku pełnych tygodni.
  if (fullWeeks.length === 4) {
    const s = fullWeeks.map((w) => calculateWeeklyLoadScore(w));
    if (!(s[0] < s[1])) errors.push("progression:w1>=w2");
    if (!(s[1] < s[2])) errors.push("progression:w2>=w3");
    if (!(s[3] < s[2])) errors.push("progression:w4>=w3");
    if (Math.max(...s) !== s[2]) errors.push("progression:w3-not-peak");
    if (!(s[3] > 0)) errors.push("progression:deload-empty");
  }

  // similarity — kolejne pary tygodni nie mogą przekraczać 75%.
  const weekSimilarityScores: number[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const sim = compareWeekSimilarity(weeks[i - 1], weeks[i]);
    weekSimilarityScores.push(round1(sim));
    if (sim > 0.75) errors.push(`copy-paste:w${i}-w${i + 1}`);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    weekScores,
    weekSimilarityScores,
    weekErrors,
  };
}

function countRealDays(week: SessionDay[]): number {
  return week.length;
}

// ---------------------------------------------------------------------------
// Priorytety planowania — deterministyczna lista decyzji dla logów/testów.
// ---------------------------------------------------------------------------

export const PLANNING_PRIORITY_ORDER = [
  "injury_return_fatigue",
  "match",
  "day_before_match",
  "club",
  "main_goal",
  "gym_access",
  "limitation",
  "position",
  "training_level",
  "season_phase",
  "competition_level",
  "recovery_mobility_prehab",
] as const;

export type PlanningPriority = (typeof PLANNING_PRIORITY_ORDER)[number];

/** Numer priorytetu (1 = najwyższy) dla logowania decyzji generatora. */
export function planningPriorityRank(p: PlanningPriority): number {
  return PLANNING_PRIORITY_ORDER.indexOf(p) + 1;
}

// re-export dla wygody testów/integracji
export { blockWeekOf };
