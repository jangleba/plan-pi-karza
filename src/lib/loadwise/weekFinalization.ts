// ============================================================================
// Loadwise — FINALNY walidator i naprawa tygodnia (twardy gate przed UI).
// ----------------------------------------------------------------------------
// Działa na realnym wyjściu generatora: SessionDay[] (28 dni). Grupuje plan na
// pełne tygodnie kalendarzowe (poniedziałek–niedziela) i gwarantuje minima:
//
//   - gym_strength według liczby treningów klubowych i obciążenia tygodnia,
//   - endurance_conditioning według celu (co najmniej jedna ekspozycja),
//   - speed_sprint według celu (co najmniej jedna ekspozycja),
//   - minimum 1 własna sesja ball_technical.
//
// Krytyczna zasada: pełny tydzień NIGDY nie może wyjść z 0 endurance_conditioning.
// Regeneracja/prehab NIE zastępuje wydolności. Jeśli tydzień ma 0 endurance i
// >1 recovery/prehab, jeden nadmiarowy recovery/prehab zostaje zamieniony na
// endurance_conditioning. Mecz pozostaje blokadą. Dzień klubowy może przyjąć
// lekką, komplementarną sesję u zawodnika intermediate/advanced.
// ============================================================================

import type { Profile, SessionDay, ExerciseItem, DayType } from "./types";
import { isoDayOfWeek, dayName as dayNameOf, parseIso } from "./labels";
import {
  normalizeSessionCategory,
  isEnduranceSession,
  isMainGymSession,
  isBallTechnicalSession,
  isClubSession,
  isMatchSession,
  isRecoverySession,
  isSpeedSession as isClassifiedSpeedSession,
} from "./sessionClassification";
import { assessSpeedLoad, hasRealSpeedExposure } from "./speedLoad";
import {
  getMaxSessionsPerDay,
  isYouthOrBeginner as isYouthOrBeginnerSched,
  type UserSchedulingSettings,
} from "./dailyScheduling";
import { buildAthleteTrainingProfile, getDevelopmentStage } from "./athleteProfile";
import {
  calculateWeeklyMinimumRequirements,
  type WeeklyRequirements,
  type WeekRequirementContext,
} from "./weeklyRequirements";
import {
  buildTrainingContext,
  validateWeek,
} from "./globalPlanRules";
import { canonicalizeGeneratedExercise } from "./exerciseLibrary";
import { buildRunningSessionPrescription } from "@/lib/running/engine";
import { generateFootballSpeedSession } from "./footballSpeedSessionEngine";

const LOWER_LIMB_PAIN = new Set(["knee", "ankle", "hamstring", "groin", "hip"]);

// ---------------------------------------------------------------------------
// Raporty
// ---------------------------------------------------------------------------

export interface AddMissingEnduranceResult {
  weekPlan: SessionDay[];
  added: number;
  converted: number;
  count: number;
  requiredEnduranceSessions: number;
  absoluteMinimumEnduranceSessions: number;
  unresolvedIssues: string[];
}

export interface AddMissingBallResult {
  weekPlan: SessionDay[];
  added: number;
  converted: number;
  count: number;
  requiredBallSessions: number;
  unresolvedIssues: string[];
}

export interface AddMissingSpeedResult {
  weekPlan: SessionDay[];
  added: number;
  converted: number;
  count: number;
  requiredSpeedSessions: number;
  unresolvedIssues: string[];
}

export interface WeekValidationReport {
  ok: boolean;
  finalStatus: "valid" | "invalid";
  gymSessionsCount: number;
  enduranceSessionsCount: number;
  speedSessionsCount: number;
  ballSessionsCount: number;
  requiredGymSessions: number;
  requiredEnduranceSessions: number;
  absoluteMinimumEnduranceSessions: number;
  requiredSpeedSessions: number;
  requiredBallSessions: number;
  noEnduranceOnClubDays: boolean;
  noMoreThanMaxSessionsPerDay: boolean;
  noDuplicateSpeedSameDay: boolean;
  noBackToBackSpeedDays: boolean;
  speedSessionsHaveMinimumOneDayGap: boolean;
  unresolvedIssues: string[];
}

// ---------------------------------------------------------------------------
// Zliczanie (main + secondSession)
// ---------------------------------------------------------------------------

function eachSession(day: SessionDay): SessionDay[] {
  const out: SessionDay[] = [];
  if (day.dayType !== "rest") out.push(day);
  if (day.secondSession) out.push(day.secondSession);
  return out;
}
function isSpeedSession(
  session: SessionDay | null | undefined,
): boolean {
  return hasRealSpeedExposure(session);
}
function realSessionCount(day: SessionDay): number {
  const main = day.dayType === "rest" ? 0 : 1;
  return main + (day.secondSession ? 1 : 0);
}

export function countEnduranceSessions(weekPlan: SessionDay[]): number {
  return weekPlan.reduce(
    (n, d) => n + eachSession(d).filter((s) => isEnduranceSession(s)).length,
    0,
  );
}

function countGymSessions(weekPlan: SessionDay[]): number {
  return weekPlan.reduce(
    (n, d) => n + eachSession(d).filter((s) => isMainGymSession(s)).length,
    0,
  );
}

function countSpeedSessions(weekPlan: SessionDay[]): number {
  return weekPlan.reduce(
    // Tygodniowe minimum realizuje tylko kanoniczna kategoria speed_sprint.
    // RSA pozostaje endurance; jego mechaniczne obciążenie szybkościowe jest
    // używane wyłącznie do bezpiecznego rozstawiania sesji w kalendarzu.
    (n, d) => n + eachSession(d).filter((s) => isClassifiedSpeedSession(s)).length,
    0,
  );
}

export function countBallSessions(weekPlan: SessionDay[]): number {
  return weekPlan.reduce(
    (n, d) => n + eachSession(d).filter((s) => isBallTechnicalSession(s)).length,
    0,
  );
}

// ---------------------------------------------------------------------------
// Konteksty profilu / obciążenia
// ---------------------------------------------------------------------------

function isYouthOrBeginner(profile: Profile): boolean {
  return isYouthOrBeginnerSched({
    developmentStage: getDevelopmentStage(profile.age),
    gymExperienceLevel: profile.gymExperienceLevel ?? null,
    trainingLevel: profile.level,
  });
}

function requiresLightSecondSession(profile: Profile): boolean {
  const stage = getDevelopmentStage(profile.age);
  return (
    stage === "child_foundation" ||
    stage === "early_youth" ||
    profile.level === "beginner"
  );
}

function hasLowerLimbPain(profile: Profile): boolean {
  const pain = [...(profile.painLocations ?? []), ...(profile.injuryHistory ?? [])];
  return profile.painInjury || pain.some((p) => LOWER_LIMB_PAIN.has(p));
}

function isDayBeforeMatch(day: SessionDay): boolean {
  return day.mdLabel === "MD-1";
}

function isDayAfterMatch(day: SessionDay): boolean {
  return day.mdLabel === "MD+1";
}

/** Tydzień przeciążony: duża kongestia klubu/meczu. */
function weekIsOverloaded(weekPlan: SessionDay[]): boolean {
  const club = weekPlan.filter((d) => isClubSession(d)).length;
  const match = weekPlan.filter((d) => isMatchSession(d)).length;
  return club + match >= 4 || club >= 4 || match >= 2;
}

// ---------------------------------------------------------------------------
// Budowa sesji endurance (normalna vs lekka)
// ---------------------------------------------------------------------------

interface EnduranceBuild {
  title: string;
  sessionType: string;
  goalOfSession: string;
  main: ExerciseItem[];
  intensity?: "niska" | "umiarkowana" | "wysoka";
  loadLevel?: "low" | "moderate" | "high";
}

function normalEnduranceBuild(profile: Profile, date: string, index: number): EnduranceBuild {
  const built = buildRunningSessionPrescription({
    fieldMasKmh: profile.fieldMasKmh,
    fieldMasTestedAt: profile.fieldMasTestedAt,
    date,
    sessionIndex: index,
    progressionLevel: profile.runningProgressionLevel,
  });
  return {
    title: built.title,
    sessionType: built.sessionType,
    goalOfSession: built.goal,
    intensity: built.intensity,
    loadLevel: built.loadLevel,
    main: built.main.map((exercise) =>
      canonicalizeGeneratedExercise(
        {
          exerciseId: built.method === "field_mas_test" ? "field_mas_5_min_test" : undefined,
          ...exercise,
        },
        "conditioning",
      ),
    ),
  };
}

function lightEnduranceBuild(profile: Profile): EnduranceBuild {
  if (hasLowerLimbPain(profile)) {
    return {
      title: "Low-impact conditioning (rower / basen)",
      sessionType: "Wytrzymałość — low-impact",
      goalOfSession: "Wydolność bez obciążeń udarowych — ochrona kończyn dolnych.",
      main: [
        { name: "Rower / basen — łatwy tlenowy", prescription: "20–30 min, niska intensywność", cue: "Bez bólu, spokojny oddech." },
      ],
    };
  }
  if (isYouthOrBeginner(profile)) {
    return {
      title: "Krótki blok aerobowy (łatwy)",
      sessionType: "Wytrzymałość — short aerobic block",
      goalOfSession: "Łagodna baza tlenowa dopasowana do młodego/początkującego zawodnika.",
      main: [
        { name: "Łatwy bieg / marszobieg", prescription: "15–20 min, easy aerobic", cue: "Tempo konwersacyjne, zero zrywów." },
      ],
    };
  }
  return {
    title: "Easy aerobic — łatwy bieg tlenowy",
    sessionType: "Wytrzymałość — easy aerobic",
    goalOfSession: "Lekka praca tlenowa zmniejszająca sztywność, bez dokładania zmęczenia.",
    main: [
      { name: "Łatwy bieg tlenowy / rower", prescription: "15–25 min bardzo lekko", cue: "Bardzo lekko, tylko rozruszanie." },
    ],
  };
}

const PLACEMENT_REASON =
  "Zamieniono nadmiarową regenerację/prehab na wydolność, bo pełny tydzień nie może mieć 0 endurance_conditioning.";

/** Buduje znormalizowaną sesję endurance oznaczoną przez finalny walidator. */
function buildEnduranceSessionDay(
  profile: Profile,
  templateDay: SessionDay,
  opts: { light: boolean; index: number; slotLabel?: string | null; placementReason?: string },
): SessionDay {
  const build = opts.light ? lightEnduranceBuild(profile) : normalEnduranceBuild(profile, templateDay.date, opts.index);
  const iso = templateDay.date;
  const name = templateDay.dayName || dayNameOf(parseIso(iso));
  const placementReason = opts.placementReason ?? PLACEMENT_REASON;

  const raw: SessionDay = {
    date: iso,
    dayName: name,
    dayType: "training" as DayType,
    title: build.title,
    goalLabel: "Wydolność",
    intensity: opts.light ? "niska" : (build.intensity ?? "umiarkowana"),
    durationMin: opts.light ? 25 : 45,
    reason: placementReason,
    safetyNote: opts.light
      ? "Wydolność w wersji lekkiej — powód: niski readiness / przeciążenie / MD+1 / młody zawodnik / ból."
      : null,
    whyToday: placementReason,
    sessionType: build.sessionType,
    goalOfSession: build.goalOfSession,
    riskManaged:
      "Kontrolowana wydolność zamiast pustej regeneracji — bez ciężkiego biegania w dni ryzykowne.",
    avoidToday: "Bez twardych interwałów dzień przed meczem i bez łączenia z ciężkimi nogami.",
    mdLabel: templateDay.mdLabel ?? null,
    slotLabel: opts.slotLabel ?? null,
    sections: {
      warmup: [{ name: "Rozgrzewka tlenowa", prescription: "5–8 min trucht + mobilizacja" }],
      main: build.main,
      accessory: [],
      footballTransfer: [],
      cooldown: [{ name: "Wyciszenie", prescription: "5 min trucht + oddech" }],
    },
    secondSession: null,
  };

  const normalized = normalizeSessionCategory(raw);
  if (normalized.classification) {
    if (!opts.light && build.loadLevel) normalized.classification.loadLevel = build.loadLevel;
    normalized.classification.generatedBy = "final-week-validator";
    normalized.classification.repairTag = "missing-endurance";
    normalized.classification.placementReason = placementReason;
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Jedna polityka club + endurance. Ciężka para jest wyjątkiem dla zawodnika
// 17+ na poziomie intermediate/advanced/elite, bez zgłoszonego bólu.
// ---------------------------------------------------------------------------

function profileAllowsHeavyClubEndurance(profile?: Profile): boolean {
  if (!profile || profile.age < 17) return false;
  if (!(["intermediate", "advanced", "elite"] as const).includes(profile.level as "intermediate" | "advanced" | "elite")) {
    return false;
  }
  return !profile.painInjury && (profile.painLocations?.length ?? 0) === 0;
}

function adjacentHasRealSpeedExposure(weekPlan: SessionDay[], index: number): boolean {
  const prev = index > 0 ? weekPlan[index - 1] : null;
  const next = index < weekPlan.length - 1 ? weekPlan[index + 1] : null;
  return Boolean(
    (prev && eachSession(prev).some((session) => hasRealSpeedExposure(session))) ||
    (next && eachSession(next).some((session) => hasRealSpeedExposure(session))),
  );
}

function buildCanonicalSpeedRepair(
  profile: Profile,
  templateDay: SessionDay,
  activation = false,
): SessionDay | null {
  const generated = generateFootballSpeedSession({
    profile,
    date: templateDay.date,
    family: "acceleration",
    readiness: activation || isYouthOrBeginner(profile) ? 5 : 7,
    recentHighSpeedExposure: activation,
    progressionWeek:
      templateDay.speedProgressionWeek ??
      templateDay.blockWeekNumber ??
      templateDay.weekMeta?.blockWeek ??
      1,
  }).session;

  if (!generated) return null;

  const normalized = normalizeSessionCategory({
    ...generated,
    date: templateDay.date,
    dayName: templateDay.dayName || dayNameOf(parseIso(templateDay.date)),
    dayOfWeek: templateDay.dayOfWeek,
    mdLabel: templateDay.mdLabel ?? null,
    slotLabel: templateDay.slotLabel ?? null,
    weekMeta: templateDay.weekMeta,
    blockWeekNumber: templateDay.blockWeekNumber,
    reason:
      "Dodano brakującą kanoniczną sesję szybkościową — klub, mecz i RSA nie zastępują tygodniowego minimum sprintu.",
    whyToday:
      "To najbezpieczniejsze dostępne miejsce z zachowaniem odstępu od innych ekspozycji szybkościowych.",
  });
  if (normalized.classification) {
    normalized.classification.generatedBy = "final-week-validator";
    normalized.classification.repairTag = "missing-speed";
    normalized.classification.placementReason = normalized.reason;
  }
  return normalized;
}

/** Dodaje brakujący sprint przez kanoniczny silnik; RSA nie realizuje minimum sprintu. */
export function addMissingCanonicalSpeedSessions(
  weekPlan: SessionDay[],
  weeklyRequirements: WeeklyRequirements,
  profile: Profile,
): AddMissingSpeedResult {
  const required = Math.max(1, weeklyRequirements.requiredSpeedSessions);
  const unresolvedIssues: string[] = [];
  let added = 0;
  let converted = 0;
  let guard = 0;

  while (countSpeedSessions(weekPlan) < required && guard < 6) {
    guard += 1;

    const openIndex = weekPlan.findIndex(
      (day, index) =>
        !day.isUnavailable &&
        !isClubSession(day) &&
        !isMatchSession(day) &&
        !isDayBeforeMatch(day) &&
        !isDayAfterMatch(day) &&
        !adjacentHasRealSpeedExposure(weekPlan, index) &&
        (day.dayType === "rest" || isRecoverySession(day)),
    );
    if (openIndex >= 0) {
      const rebuilt = buildCanonicalSpeedRepair(profile, weekPlan[openIndex]);
      if (!rebuilt) break;
      weekPlan[openIndex] = rebuilt;
      added += 1;
      continue;
    }

    // W pełnym grafiku sprint ma pierwszeństwo przed lekką piłką/recovery.
    // Piłka jest dokładana ponownie później jako lekki drugi slot.
    const replaceSecondIndex = weekPlan.findIndex(
      (day, index) =>
        !day.isUnavailable &&
        !isClubSession(day) &&
        !isMatchSession(day) &&
        !isDayBeforeMatch(day) &&
        !isDayAfterMatch(day) &&
        !adjacentHasRealSpeedExposure(weekPlan, index) &&
        !eachSession(day).some((session) => hasRealSpeedExposure(session)) &&
        Boolean(
          day.secondSession &&
          (isBallTechnicalSession(day.secondSession) ||
            isRecoverySession(day.secondSession) ||
            (isEnduranceSession(day.secondSession) &&
              day.secondSession.classification?.repairTag === "missing-endurance")),
        ),
    );
    if (replaceSecondIndex >= 0) {
      const host = weekPlan[replaceSecondIndex];
      const rebuilt = buildCanonicalSpeedRepair(profile, host);
      if (!rebuilt) break;
      rebuilt.secondSession = { ...host, secondSession: null, slotLabel: "Sesja 2" };
      rebuilt.slotLabel = "Sesja 1 (szybkość)";
      weekPlan[replaceSecondIndex] = rebuilt;
      converted += 1;
      continue;
    }

    const secondSlotIndex = weekPlan.findIndex(
      (day, index) =>
        !day.isUnavailable &&
        !isClubSession(day) &&
        !isMatchSession(day) &&
        !day.secondSession &&
        !isDayBeforeMatch(day) &&
        !isDayAfterMatch(day) &&
        !adjacentHasRealSpeedExposure(weekPlan, index) &&
        !eachSession(day).some((session) => hasRealSpeedExposure(session)),
    );
    if (secondSlotIndex >= 0) {
      const host = weekPlan[secondSlotIndex];
      const rebuilt = buildCanonicalSpeedRepair(profile, host);
      if (!rebuilt) break;
      rebuilt.secondSession = { ...host, secondSession: null, slotLabel: "Sesja 2" };
      rebuilt.slotLabel = "Sesja 1 (szybkość)";
      weekPlan[secondSlotIndex] = rebuilt;
      added += 1;
      continue;
    }

    // Gęsty tydzień (np. 4 treningi klubowe + mecz) może nie mieć drugiego
    // wolnego dnia. Wtedy dokładamy krótki mikrobodziec szybkościowy jako
    // drugi slot dnia klubowego. Nie zastępuje klubu, nie tworzy 3. sesji,
    // nie wpada przy meczu ani dzień obok innej ekspozycji szybkościowej.
    const clubMicrodoseIndex = weekPlan.findIndex(
      (day, index) =>
        !day.isUnavailable &&
        isClubSession(day) &&
        !isMatchSession(day) &&
        realSessionCount(day) <= 2 &&
        !isDayBeforeMatch(day) &&
        !isDayAfterMatch(day) &&
        !adjacentHasRealSpeedExposure(weekPlan, index) &&
        !eachSession(day).some((session) => hasRealSpeedExposure(session)),
    );
    if (clubMicrodoseIndex >= 0) {
      const host = weekPlan[clubMicrodoseIndex];
      const speed = buildCanonicalSpeedRepair(profile, host, true);
      if (!speed) break;
      speed.slotLabel = "Sesja 2 (mikrobodziec szybkości)";
      speed.reason =
        "Krótki mikrobodziec szybkościowy w gęstym tygodniu — mała objętość, pełny odpoczynek, bez zmęczenia.";
      host.secondSession = speed;
      host.slotLabel = host.slotLabel ?? "Sesja 1 (klub)";
      added += 1;
      continue;
    }

    break;
  }

  const count = countSpeedSessions(weekPlan);
  if (count < required) {
    unresolvedIssues.push(
      `Tydzień ma ${count}/${required} sesji szybkości — brak bezpiecznego miejsca bez łamania odstępów i ochrony meczu.`,
    );
  }
  return { weekPlan, added, converted, count, requiredSpeedSessions: required, unresolvedIssues };
}

export function validateNoEnduranceOnClubDays(weekPlan: SessionDay[], profile?: Profile): { removed: number } {
  let removed = 0;
  for (const day of weekPlan) {
    if (!isClubSession(day)) continue;
    const clubIsHard = eachSession(day).some(
      (session) => isClubSession(session) && session.intensity === "wysoka",
    );
    if (
      day.secondSession &&
      isEnduranceSession(day.secondSession) &&
      ((requiresLightSecondSession(profile ?? ({} as Profile)) &&
        day.secondSession.intensity !== "niska") ||
        (clubIsHard &&
          day.secondSession.intensity === "wysoka" &&
          !profileAllowsHeavyClubEndurance(profile)))
    ) {
      day.secondSession = null;
      day.slotLabel = null;
      removed += 1;
    }
  }
  return { removed };
}

// ---------------------------------------------------------------------------
// Twarda blokada: nigdy dwie jednostki speed_sprint jednego dnia
// ---------------------------------------------------------------------------

export function countSpeedSessionsForDay(day: SessionDay): number {
  return eachSession(day).filter((s) => isSpeedSession(s)).length;
}

/**
 * Naprawa dni z dwiema jednostkami szybkościowymi (main + secondSession = speed).
 * Zostawia główną szybkość, drugą próbuje przenieść na wolny dzień (rest) bez
 * klubu/meczu/szybkości; jeśli się nie da — usuwa duplikat i dodaje unresolvedIssue.
 * Nigdy nie zostawia dwóch speed_sprint w jednym dniu. Idempotentna.
 */
export function repairDuplicateSpeedSameDay(
  weekPlan: SessionDay[],
  profile?: Profile,
): {
  weekPlan: SessionDay[];
  moved: number;
  removed: number;
  unresolvedIssues: string[];
} {
  const unresolvedIssues: string[] = [];
  let moved = 0;
  let removed = 0;

  for (let dayIndex = 0; dayIndex < weekPlan.length; dayIndex += 1) {
    const day = weekPlan[dayIndex];
    if (countSpeedSessionsForDay(day) <= 1) continue;
    // main i secondSession to szybkość — zostaw main, wyjmij secondSession.
    if (day.secondSession && isSpeedSession(day.secondSession)) {
      const duplicate = day.secondSession;
      day.secondSession = null;
      day.slotLabel = null;

      // Szukaj wolnego dnia (rest) bez klubu, meczu i bez szybkości; nie MD-1 dla pełnej szybkości.
      const restTarget = weekPlan.find(
        (d, index) =>
          d !== day &&
          !d.isUnavailable &&
          d.dayType === "rest" &&
          !isClubSession(d) &&
          !isMatchSession(d) &&
          countSpeedSessionsForDay(d) === 0 &&
          !adjacentDayHasSpeed(weekPlan, index) &&
          !isDayBeforeMatch(d),
      );
      if (restTarget) {
        const idx = weekPlan.indexOf(restTarget);
        const relocated: SessionDay = {
          ...duplicate,
          date: restTarget.date,
          dayName: restTarget.dayName || duplicate.dayName,
          dayOfWeek: restTarget.dayOfWeek,
          mdLabel: restTarget.mdLabel ?? null,
          dayType: "training" as DayType,
          slotLabel: null,
          secondSession: null,
          reason:
            "Przeniesiono drugą szybkość na wolny dzień — dwie jednostki szybkości jednego dnia są zabronione.",
          whyToday:
            "Przeniesiono drugą szybkość na wolny dzień — dwie jednostki szybkości jednego dnia są zabronione.",
        };
        const candidate = weekPlan.slice();
        candidate[dayIndex] = { ...day };
        candidate[idx] = relocated;
        if (!passesGlobalWeekGate(candidate, profile)) {
          removed += 1;
          unresolvedIssues.push(
            `Usunięto zduplikowaną szybkość w dniu ${day.date} — przeniesienie narusza globalne reguły tygodnia.`,
          );
          continue;
        }
        weekPlan[idx] = relocated;
        moved += 1;
      } else {
        removed += 1;
        unresolvedIssues.push(
          `Usunięto zduplikowaną szybkość w dniu ${day.date} — brak wolnego dnia na przeniesienie (dwie szybkości jednego dnia są zabronione).`,
        );
      }
    }
  }

  return { weekPlan, moved, removed, unresolvedIssues };
}

// ---------------------------------------------------------------------------
// TWARDA ZASADA: nigdy speed_sprint dzień po dniu (min. 1 dzień przerwy)
// ---------------------------------------------------------------------------

/** Czy dzień ma jakąkolwiek jednostkę speed_sprint (main lub secondSession). */
export function hasSpeedSession(day: SessionDay): boolean {
  return countSpeedSessionsForDay(day) > 0;
}

/** Indeksy dni ze szybkością. */
export function getSpeedDays(weekPlan: SessionDay[]): number[] {
  const out: number[] = [];
  weekPlan.forEach((d, i) => {
    if (hasSpeedSession(d)) out.push(i);
  });
  return out;
}

/** Dwa dni ze szybkością zbyt blisko = mniej niż 1 pełny dzień przerwy. */
export function areSpeedDaysTooClose(dayIndexA: number, dayIndexB: number): boolean {
  return Math.abs(dayIndexA - dayIndexB) <= 1;
}

/** Wykrywa speed dzień po dniu / gap < 1 dzień. */
export function validateNoBackToBackSpeedDays(weekPlan: SessionDay[]): {
  ok: boolean;
  speedDays: number[];
  tooClosePairs: [number, number][];
} {
  const speedDays = getSpeedDays(weekPlan);
  const tooClosePairs: [number, number][] = [];
  for (let i = 0; i < speedDays.length - 1; i += 1) {
    if (areSpeedDaysTooClose(speedDays[i], speedDays[i + 1])) {
      tooClosePairs.push([speedDays[i], speedDays[i + 1]]);
    }
  }
  return { ok: tooClosePairs.length === 0, speedDays, tooClosePairs };
}

/** Alias jawny. */
export const validateMinimumGapBetweenSpeedSessions = validateNoBackToBackSpeedDays;

function adjacentDayHasSpeed(weekPlan: SessionDay[], dayIndex: number): boolean {
  const prev = dayIndex > 0 ? weekPlan[dayIndex - 1] : null;
  const next = dayIndex < weekPlan.length - 1 ? weekPlan[dayIndex + 1] : null;
  return (!!prev && hasSpeedSession(prev)) || (!!next && hasSpeedSession(next));
}

function passesGlobalWeekGate(weekPlan: SessionDay[], profile?: Profile): boolean {
  if (!profile) return true;
  const context = buildTrainingContext(profile);
  return validateWeek(weekPlan, context, { isFullWeek: true }).valid;
}

export function repairSpeedAcrossWeekBoundaries(
  plan: SessionDay[],
  profile?: Profile,
): {
  plan: SessionDay[];
  moved: number;
  removed: number;
  unresolvedIssues: string[];
} {
  let moved = 0;
  let removed = 0;
  const unresolvedIssues: string[] = [];

  for (
    let mondayIndex = 1;
    mondayIndex < plan.length;
    mondayIndex += 1
  ) {
    const previousDay = plan[mondayIndex - 1];
    const monday = plan[mondayIndex];

    const previousDayOfWeek =
      previousDay.dayOfWeek ??
      isoDayOfWeek(parseIso(previousDay.date));

    const mondayDayOfWeek =
      monday.dayOfWeek ??
      isoDayOfWeek(parseIso(monday.date));

    if (
      previousDayOfWeek !== 7 ||
      mondayDayOfWeek !== 1 ||
      !hasSpeedSession(previousDay) ||
      !hasSpeedSession(monday)
    ) {
      continue;
    }

    let weekEnd = mondayIndex + 1;

    while (weekEnd < plan.length) {
      const day = plan[weekEnd];
      const dayOfWeek =
        day.dayOfWeek ??
        isoDayOfWeek(parseIso(day.date));

      if (dayOfWeek === 1) break;
      weekEnd += 1;
    }

    const boundaryWindow = [
      previousDay,
      ...plan.slice(mondayIndex, weekEnd),
    ];

    const result =
      repairBackToBackSpeedSessions(boundaryWindow, profile);

    for (
      let offset = 0;
      offset < boundaryWindow.length;
      offset += 1
    ) {
      plan[mondayIndex - 1 + offset] =
        boundaryWindow[offset];
    }

    moved += result.moved;
    removed += result.removed;
    unresolvedIssues.push(
      ...result.unresolvedIssues,
    );
  }

  return {
    plan,
    moved,
    removed,
    unresolvedIssues,
  };
}
/**
 * Naprawa speed dzień po dniu na realnym planie (SessionDay[]):
 *  - zostawia wcześniejszą szybkość z pary,
 *  - drugą próbuje przenieść na wolny dzień (rest) z zachowaniem min. 1 dnia
 *    przerwy, bez klubu/meczu/szybkości i nie MD-1 dla pełnej szybkości,
 *  - jeśli się nie da → zamienia dzień na rest i dodaje unresolvedIssue.
 * Idempotentna.
 */
export function repairBackToBackSpeedSessions(
  weekPlan: SessionDay[],
  profile?: Profile,
): {
  weekPlan: SessionDay[];
  moved: number;
  removed: number;
  unresolvedIssues: string[];
} {
  const unresolvedIssues: string[] = [];
  let moved = 0;
  let removed = 0;

  const clearSpeedSession = (
    day: SessionDay,
    reason: string,
  ): SessionDay => ({
    ...day,
    dayType: "rest" as DayType,
    title: "Odpoczynek",
    goalLabel: "Regeneracja",
    intensity: "niska",
    durationMin: 0,
    sessionType: "Odpoczynek",
    goalOfSession: "Regeneracja między bodźcami szybkościowymi.",
    slotLabel: null,
    secondSession: day.secondSession ?? null,
    exercises: [],
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    classification: undefined,
    speedGeneratorVersion: undefined,
    speedFamily: undefined,
    speedProgressionWeek: undefined,
    speedRecentPostSkipExerciseIds: undefined,
    reason,
    whyToday: reason,
  });

  let guard = 0;
  while (guard < 14) {
    guard += 1;
    const report = validateNoBackToBackSpeedDays(weekPlan);
    if (report.ok) break;

    const [earlierIndex, laterIndex] = report.tooClosePairs[0];
    const earlierLoad = assessSpeedLoad(weekPlan[earlierIndex]);
    const laterLoad = assessSpeedLoad(weekPlan[laterIndex]);
    // Pełny bodziec (np. RSA) ma pierwszeństwo przed sąsiednią mikrodawką.
    // Wcześniej walidator zawsze usuwał późniejszy dzień, więc prawidłowo
    // zaplanowane RSA mogło zniknąć tylko dlatego, że dzień wcześniej stał
    // opcjonalny primer lub krótki COD.
    const repairIndex =
      laterLoad.exposure === "full" && earlierLoad.exposure !== "full"
        ? earlierIndex
        : laterIndex;
    const laterDay = weekPlan[repairIndex];

    // Preferuj wyjęcie szybkości będącej drugą sesją; inaczej cały główny dzień.
    let duplicate: SessionDay | null = null;
    if (laterDay.secondSession && isSpeedSession(laterDay.secondSession)) {
      duplicate = laterDay.secondSession;
      laterDay.secondSession = null;
      laterDay.slotLabel = null;
    } else if (isSpeedSession(laterDay)) {
      duplicate = { ...laterDay };
    }
    if (!duplicate) break;

    const restTarget = weekPlan.find(
      (d, idx) =>
        idx !== repairIndex &&
        !d.isUnavailable &&
        d.dayType === "rest" &&
        !isClubSession(d) &&
        !isMatchSession(d) &&
        !hasSpeedSession(d) &&
        !adjacentDayHasSpeed(weekPlan, idx) &&
        !isDayBeforeMatch(d),
    );

    if (restTarget) {
      const idx = weekPlan.indexOf(restTarget);
      const relocated: SessionDay = {
        ...duplicate,
        date: restTarget.date,
        dayName: restTarget.dayName || duplicate.dayName,
        dayOfWeek: restTarget.dayOfWeek,
        mdLabel: restTarget.mdLabel ?? null,
        dayType: "training" as DayType,
        slotLabel: null,
        secondSession: null,
        reason:
          "Przeniesiono szybkość, aby zachować min. 1 dzień przerwy — speed nie może być dzień po dniu.",
        whyToday:
          "Przeniesiono szybkość, aby zachować min. 1 dzień przerwy — speed nie może być dzień po dniu.",
      };
      const candidate = weekPlan.slice();
      candidate[idx] = relocated;
      if (isSpeedSession(laterDay)) {
        candidate[repairIndex] = clearSpeedSession(
          laterDay,
          "Szybkość przeniesiona — zachowano min. 1 dzień przerwy między speed.",
        );
      }
      if (!passesGlobalWeekGate(candidate, profile)) {
        if (isSpeedSession(laterDay)) {
          weekPlan[repairIndex] = clearSpeedSession(
            laterDay,
            "Usunięto szybkość — przeniesienie narusza globalne reguły tygodnia.",
          );
        }
        removed += 1;
        unresolvedIssues.push(
          `Usunięto szybkość w dniu ${laterDay.date} — przeniesienie narusza globalne reguły tygodnia.`,
        );
        continue;
      }
      weekPlan[idx] = relocated;
      // Jeśli źródłem był główny dzień (nie secondSession), zamień go na rest.
      if (isSpeedSession(laterDay) && laterDay === weekPlan[repairIndex]) {
        weekPlan[repairIndex] = clearSpeedSession(
          laterDay,
          "Szybkość przeniesiona — zachowano min. 1 dzień przerwy między speed.",
        );
      }
      moved += 1;
    } else {
      // Brak miejsca — zamień późniejszy dzień na rest (usuń szybkość).
      if (isSpeedSession(laterDay) && laterDay === weekPlan[repairIndex] && !laterDay.secondSession) {
        weekPlan[repairIndex] = clearSpeedSession(
          { ...laterDay, secondSession: null },
          "Usunięto szybkość dzień po dniu — brak dnia z min. 1 dniem przerwy.",
        );
      }
      removed += 1;
      unresolvedIssues.push(
        `Usunięto szybkość w dniu ${laterDay.date} — brak dnia z min. 1 dniem przerwy (speed nie może być dzień po dniu).`,
      );
    }
  }

  return { weekPlan, moved, removed, unresolvedIssues };
}


/**
 * Gwarantuje wymaganą liczbę endurance_conditioning w tygodniu.
 *  1. Liczy endurance.
 *  2. Jeśli 0 i są ≥2 recovery/prehab → zamienia nadmiarowy recovery/prehab na endurance.
 *  3. W innym wypadku szuka wolnego dnia (rest) lub wolnego slotu 2. sesji.
 *  4. Mecz jest blokadą; klub może dostać lekki drugi slot u intermediate/advanced.
 *  5. Lekka wersja tylko gdy są powody (readiness/przeciążenie/MD+1/youth/ból).
 */
export function addMissingEnduranceSessions(
  weekPlan: SessionDay[],
  weekContext: WeekRequirementContext,
  userSettings: UserSchedulingSettings | null | undefined,
  weeklyRequirements: WeeklyRequirements,
  profile: Profile,
): AddMissingEnduranceResult {
  const unresolvedIssues: string[] = [];
  void weekContext;
  void userSettings;

  validateNoEnduranceOnClubDays(weekPlan, profile);

  const required = Math.max(1, weeklyRequirements.requiredEnduranceSessions);
  const absoluteMinimum = Math.max(1, weeklyRequirements.absoluteMinimumEnduranceSessions);
  // Slot 2 jest dostępny technicznie dla każdego profilu; jego intensywność
  // ograniczają poziom, wiek, ból i reguły bezpiecznego łączenia bodźców.
  const maxPerDay = getMaxSessionsPerDay({ maxSessionsPerDay: 2 });
  const overloaded = weekIsOverloaded(weekPlan);

  const lowReadinessReasons = (day: SessionDay): boolean =>
    overloaded || isYouthOrBeginner(profile) || hasLowerLimbPain(profile) || isDayAfterMatch(day);

  let added = 0;
  let converted = 0;
  let guard = 0;

  while (countEnduranceSessions(weekPlan) < required && guard < 14) {
    guard += 1;
    const idx = countEnduranceSessions(weekPlan);

    // Cel wydolnościowy: kwalifikowany zawodnik 17+ może świadomie skupić
    // ciężki klub i ciężką wydolność w jednym high-day. Nie robimy tego blisko
    // meczu ani przy bólu; check-in w dniu sesji może później obniżyć wariant.
    if (profile.goal === "endurance" && profileAllowsHeavyClubEndurance(profile)) {
      const highDayClub = weekPlan.find(
        (d) =>
          !d.isUnavailable &&
          isClubSession(d) &&
          !isMatchSession(d) &&
          !d.secondSession &&
          realSessionCount(d) < maxPerDay &&
          !isDayBeforeMatch(d) &&
          !isDayAfterMatch(d) &&
          d.mdLabel !== "MD-2" &&
          d.intensity === "wysoka",
      );
      if (highDayClub) {
        highDayClub.secondSession = buildEnduranceSessionDay(profile, highDayClub, {
          light: false,
          index: idx,
          slotLabel: "Sesja 2 (wydolność)",
          placementReason:
            "Cel wydolnościowy: kontrolowany high-day club + endurance dla zawodnika 17+; check-in może obniżyć obciążenie.",
        });
        highDayClub.slotLabel = highDayClub.slotLabel ?? "Sesja 1 (klub)";
        added += 1;
        continue;
      }
    }

    // Krok 1: zamiana nadmiarowej regeneracji/prehab (≥2 recovery/prehab, 0 endurance).
    const recoveryDays = weekPlan.filter(
      (d) =>
        !d.isUnavailable &&
        isRecoverySession(d) &&
        !isClubSession(d) &&
        !isMatchSession(d),
    );
    const enduranceNow = countEnduranceSessions(weekPlan);
    if (enduranceNow === 0 && recoveryDays.length >= 2) {
      // Wybierz najlepszego kandydata: unikaj MD-1, preferuj nie-MD+1.
      const target =
        recoveryDays.find((d) => !isDayBeforeMatch(d) && !isDayAfterMatch(d)) ??
        recoveryDays.find((d) => !isDayBeforeMatch(d)) ??
        recoveryDays[0];
      const light = isDayBeforeMatch(target) || lowReadinessReasons(target);
      const rebuilt = buildEnduranceSessionDay(profile, target, {
        light,
        index: idx,
        slotLabel: target.slotLabel,
      });
      const targetIndex = weekPlan.indexOf(target);
      rebuilt.secondSession = target.secondSession ?? null;
      weekPlan[targetIndex] = rebuilt;
      converted += 1;
      continue;
    }

    // Krok 2: wolny dzień (rest) bez klubu/meczu.
    const restDay = weekPlan.find(
      (d) =>
        !d.isUnavailable &&
        (d.dayType === "rest" || d.classification?.category === "rest" || /^odpoczynek$/i.test(d.title)) &&
        !isClubSession(d) &&
        !isMatchSession(d),
    );
    if (restDay) {
      const light = isDayBeforeMatch(restDay) || lowReadinessReasons(restDay);
      const rebuilt = buildEnduranceSessionDay(profile, restDay, {
        light,
        index: idx,
        placementReason:
          "Wybrano wolny dzień bez klubu i meczu — najlepsze miejsce na wydolność.",
      });
      weekPlan[weekPlan.indexOf(restDay)] = rebuilt;
      added += 1;
      continue;
    }

    // Krok 3: druga sesja na dniu gym (lub speed jako pierwsze), gdy limit = 2.
    if (maxPerDay >= 2) {
      const host = weekPlan.find(
        (d) =>
          !d.isUnavailable &&
          !isClubSession(d) &&
          !isMatchSession(d) &&
          !d.secondSession &&
          realSessionCount(d) < maxPerDay &&
          (isMainGymSession(d) || (isSpeedSession(d) && !isDayBeforeMatch(d))) &&
          !isEnduranceSession(d),
      );
      if (host) {
        const light =
          isDayBeforeMatch(host) ||
          lowReadinessReasons(host) ||
          requiresLightSecondSession(profile);
        const second = buildEnduranceSessionDay(profile, host, {
          light,
          index: idx,
          slotLabel: light ? "Sesja 2 (lekka)" : "Sesja 2",
          placementReason:
            light
              ? "Dodano wydolność jako drugą lekką sesję dnia — zgodnie z profilem zawodnika."
              : "Dodano pełną wydolność jako drugą, komplementarną sesję dnia.",
        });
        host.secondSession = second;
        host.slotLabel = host.slotLabel ?? "Sesja 1";
        added += 1;
        continue;
      }

      const complementaryHost = !requiresLightSecondSession(profile)
        ? weekPlan.find(
            (d) =>
              !d.isUnavailable &&
              !isClubSession(d) &&
              !isMatchSession(d) &&
              !d.secondSession &&
              realSessionCount(d) < maxPerDay &&
              !isEnduranceSession(d) &&
              !isDayBeforeMatch(d),
          )
        : null;
      if (complementaryHost) {
        complementaryHost.secondSession = buildEnduranceSessionDay(profile, complementaryHost, {
          light: true,
          index: idx,
          slotLabel: "Sesja 2 (lekka wydolność)",
          placementReason: "Dodano spokojny, komplementarny bieg w wolnym drugim slocie dnia.",
        });
        complementaryHost.slotLabel = complementaryHost.slotLabel ?? "Sesja 1";
        added += 1;
        continue;
      }

      // Krok 4: klub + endurance. Domyślnie lekko; kwalifikowany zawodnik 17+
      // może utrzymać pełny bodziec poza bliskością meczu i przy braku bólu.
      // Klub liczy się do obciążenia, ale nie zastępuje własnej sesji biegowej.
      const clubHost = weekPlan.find(
        (d) =>
          !d.isUnavailable &&
          isClubSession(d) &&
          !isMatchSession(d) &&
          !d.secondSession &&
          realSessionCount(d) < maxPerDay &&
          !isDayBeforeMatch(d),
      );
      if (clubHost) {
        const fullClubEndurance =
          !requiresLightSecondSession(profile) &&
          profileAllowsHeavyClubEndurance(profile) &&
          clubHost.mdLabel !== "MD-2" &&
          !isDayAfterMatch(clubHost);
        clubHost.secondSession = buildEnduranceSessionDay(profile, clubHost, {
          light: !fullClubEndurance,
          index: idx,
          slotLabel: fullClubEndurance ? "Sesja 2 (wydolność)" : "Sesja 2 (lekka wydolność)",
          placementReason: fullClubEndurance
            ? "Pełna wydolność w dniu klubowym dla zawodnika 17+ o odpowiednim poziomie; klub nie zastępuje minimum BallWise."
            : "Lekki bieg uzupełniający w dniu klubowym — klub nie zastępuje minimum BallWise i nie tworzy drugiej ciężkiej sesji.",
        });
        clubHost.slotLabel = clubHost.slotLabel ?? "Sesja 1 (klub)";
        added += 1;
        continue;
      }
    }

    // Brak bezpiecznego miejsca.
    break;
  }

  const count = countEnduranceSessions(weekPlan);
  if (count < absoluteMinimum) {
    unresolvedIssues.push(
      `Tydzień ma ${count} endurance, absolutne minimum ${absoluteMinimum} — brak bezpiecznego dnia bez klubu/meczu.`,
    );
  } else if (count < required) {
    unresolvedIssues.push(
      `Tydzień ma ${count} z ${required} wymaganych endurance — brakującej nie da się dodać bez łamania zasad.`,
    );
  }

  return {
    weekPlan,
    added,
    converted,
    count,
    requiredEnduranceSessions: required,
    absoluteMinimumEnduranceSessions: absoluteMinimum,
    unresolvedIssues,
  };
}

// ---------------------------------------------------------------------------
// Własna sesja piłkarska — minimum niezależne od klubu i meczu
// ---------------------------------------------------------------------------

function buildBallSessionDay(
  templateDay: SessionDay,
  opts: { slotLabel?: string | null; placementReason?: string },
): SessionDay {
  const placementReason =
    opts.placementReason ??
    "Dodano własną sesję piłkarską — klub i mecz liczą się do obciążenia, ale jej nie zastępują.";
  const raw: SessionDay = {
    date: templateDay.date,
    dayName: templateDay.dayName || dayNameOf(parseIso(templateDay.date)),
    dayType: "training" as DayType,
    title: "Własna technika z piłką + reakcja",
    goalLabel: "Piłka",
    intensity: "niska",
    durationMin: 30,
    reason: placementReason,
    safetyNote: null,
    whyToday: placementReason,
    sessionType: "Technika z piłką — własna sesja",
    goalOfSession:
      "Minimum 30 minut własnej pracy z piłką. Zawodnik wybiera ćwiczenia, a Trener reakcji dostarcza bodźce wizualne.",
    riskManaged:
      "Niska intensywność planowana wokół stałych punktów tygodnia; bez automatycznej oceny jakości wykonania.",
    avoidToday:
      "Nie zamieniaj tej sesji w dodatkowy maksymalny sprint ani ciężki trening kondycyjny.",
    mdLabel: templateDay.mdLabel ?? null,
    slotLabel: opts.slotLabel ?? null,
    sections: {
      warmup: [
        {
          name: "Swobodne prowadzenie piłki",
          prescription: "5 min",
          cue: "Obie nogi, stopniowo zwiększaj zakres ruchu.",
        },
      ],
      main: [
        {
          name: "Własny blok techniczny",
          prescription: "Łącznie minimum 30 min sesji",
          cue: "Wybierz element, który chcesz poprawić: prowadzenie, pierwszy kontakt, zwód, podanie albo wykończenie.",
        },
        {
          name: "Trener reakcji BallWise",
          prescription: "Uruchamiaj w wybranych fragmentach",
          cue: "Telefon pokazuje kierunek, kolor lub zamknięty sektor. Ty przypisujesz bodźcowi konkretną akcję z piłką.",
        },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: [
        {
          name: "Spokojne zakończenie z piłką",
          prescription: "2–3 min",
          cue: "Obniż tempo i zakończ bez dodatkowego zmęczenia.",
        },
      ],
    },
    secondSession: null,
  };

  const normalized = normalizeSessionCategory(raw);
  if (normalized.classification) {
    normalized.classification.generatedBy = "final-week-validator";
    normalized.classification.repairTag = "missing-ball";
    normalized.classification.placementReason = placementReason;
  }
  return normalized;
}

/**
 * Gwarantuje własną sesję piłkarską bez uznawania klubu lub meczu za zamiennik.
 * To zawsze lekka sesja techniczna, dlatego może wejść także jako drugi slot
 * u youth/beginner. Ograniczenie dla tej grupy dotyczy dwóch CIĘŻKICH sesji,
 * a nie bezpiecznej, niskointensywnej pracy z piłką.
 */
export function addMissingBallSessions(
  weekPlan: SessionDay[],
  weeklyRequirements: WeeklyRequirements,
  profile: Profile,
): AddMissingBallResult {
  const required = weeklyRequirements.requiredBallSessions;
  const unresolvedIssues: string[] = [];
  let added = 0;
  let converted = 0;
  let guard = 0;

  while (countBallSessions(weekPlan) < required && guard < 4) {
    guard += 1;

    const restTarget = weekPlan.find(
      (day) =>
        !day.isUnavailable &&
        day.dayType === "rest" &&
        !isMatchSession(day) &&
        !isClubSession(day) &&
        !isDayBeforeMatch(day) &&
        !isDayAfterMatch(day),
    ) ?? weekPlan.find(
      (day) =>
        !day.isUnavailable &&
        day.dayType === "rest" &&
        !isMatchSession(day) &&
        !isClubSession(day),
    );

    if (restTarget) {
      const rebuilt = buildBallSessionDay(restTarget, {
        placementReason:
          "Wybrano wolny dzień na minimum 30 minut własnej pracy z piłką.",
      });
      weekPlan[weekPlan.indexOf(restTarget)] = rebuilt;
      added += 1;
      continue;
    }

    const recoveryTarget = weekPlan.find(
      (day) =>
        !day.isUnavailable &&
        isRecoverySession(day) &&
        !day.secondSession &&
        !isMatchSession(day) &&
        !isClubSession(day) &&
        !isDayBeforeMatch(day) &&
        !isDayAfterMatch(day),
    );
    if (recoveryTarget) {
      weekPlan[weekPlan.indexOf(recoveryTarget)] = buildBallSessionDay(recoveryTarget, {
        placementReason:
          "Zamieniono lekki dzień na niskointensywną własną technikę z piłką.",
      });
      converted += 1;
      continue;
    }

    const isSafeBallHost = (day: SessionDay, allowMd1: boolean): boolean =>
      !day.isUnavailable &&
      !isMatchSession(day) &&
      !day.secondSession &&
      realSessionCount(day) < 2 &&
      !isBallTechnicalSession(day) &&
      !eachSession(day).some((session) => hasRealSpeedExposure(session)) &&
      (allowMd1 || !isDayBeforeMatch(day));

    const secondSlotHost =
      weekPlan.find((day) => isSafeBallHost(day, false)) ??
      weekPlan.find((day) => isSafeBallHost(day, true));

    if (secondSlotHost) {
      secondSlotHost.secondSession = buildBallSessionDay(secondSlotHost, {
        slotLabel: "Sesja 2 (własna piłka — lekka)",
        placementReason:
          "Dodano lekką, komplementarną własną sesję piłkarską w drugim slocie dnia.",
      });
      secondSlotHost.slotLabel = secondSlotHost.slotLabel ?? "Sesja 1";
      added += 1;
      continue;
    }

    break;
  }

  const count = countBallSessions(weekPlan);
  if (count < required) {
    unresolvedIssues.push(
      `Tydzień ma ${count}/${required} własnych sesji piłkarskich — brak bezpiecznego miejsca bez łamania stałych punktów tygodnia.`,
    );
  }

  return {
    weekPlan,
    added,
    converted,
    count,
    requiredBallSessions: required,
    unresolvedIssues,
  };
}

// ---------------------------------------------------------------------------
// Naprawa brakujących sesji siłowni (analogicznie do endurance)
// ---------------------------------------------------------------------------

export interface AddMissingGymResult {
  weekPlan: SessionDay[];
  added: number;
  converted: number;
  count: number;
  requiredGymSessions: number;
  unresolvedIssues: string[];
}

/**
 * Buduje minimalną sesję siłowni do wstawienia przez finalny walidator.
 * Lekka (primer / utrzymanie siły) — nie ciężka, nie bodyweight-only.
 */
function buildGymSessionDay(
  profile: Profile,
  templateDay: SessionDay,
  opts: { light: boolean; slotLabel?: string | null; placementReason?: string },
): SessionDay {
  const youth = isYouthOrBeginner(profile);
  const title = youth
    ? "Siła bazowa (masa ciała)"
    : opts.light
      ? "Primer siłowy (utrzymanie)"
      : "Siła ogólna";
  const sessionType = youth ? "Siła — masa ciała" : "Siła / moc";
  const goalOfSession = youth
    ? "Nauka wzorców ruchowych i siła bazowa z masą ciała."
    : opts.light
      ? "Utrzymanie siły i aktywacja nerwowo-mięśniowa bez dużego zmęczenia."
      : "Rozwój siły dolnych partii i stabilizacji.";
  const intensity = opts.light || youth ? "umiarkowana" as const : "wysoka" as const;
  const durationMin = opts.light ? 30 : youth ? 40 : 50;
  const placementReason = opts.placementReason ??
    "Dodano brakującą sesję siłowni, aby spełnić minimum tego tygodnia.";

  const raw: SessionDay = {
    date: templateDay.date,
    dayName: templateDay.dayName || dayNameOf(parseIso(templateDay.date)),
    dayType: "training" as DayType,
    title,
    goalLabel: "Siła",
    intensity,
    durationMin,
    reason: placementReason,
    safetyNote: opts.light
      ? "Lekki wariant siłowy — primer / utrzymanie."
      : null,
    whyToday: placementReason,
    sessionType,
    goalOfSession,
    riskManaged: "Kontrolowane obciążenie — bez ciężkich nóg w dniach ryzykownych.",
    avoidToday: "Bez ciężkich nóg na 48 h przed meczem.",
    mdLabel: templateDay.mdLabel ?? null,
    slotLabel: opts.slotLabel ?? null,
    sections: {
      warmup: [
        canonicalizeGeneratedExercise(
          { exerciseId: "hip_mobility_flow", name: "Rozgrzewka dynamiczna", prescription: "5–8 min mobilizacja" },
          "mobility",
        ),
      ],
      main: youth
        ? [
            canonicalizeGeneratedExercise(
              { exerciseId: "bodyweight_squat", name: "Przysiad z masą ciała", prescription: "3 × 10", cue: "Kolana w linii stóp." },
              "strength",
            ),
            canonicalizeGeneratedExercise(
              { exerciseId: "plank", name: "Plank", prescription: "3 × 30 s", cue: "Napięty brzuch, biodra w linii." },
              "trunk",
            ),
          ]
        : [
            canonicalizeGeneratedExercise(
              { exerciseId: "goblet_squat", name: "Przysiad goblet", prescription: "3 × 8", rest: "90 s", cue: "Pełen zakres." },
              "strength",
            ),
            canonicalizeGeneratedExercise(
              { exerciseId: "romanian_deadlift_db", name: "RDL / Hip hinge", prescription: "3 × 8", rest: "75 s", cue: "Biodra w tył, proste plecy." },
              "strength",
            ),
          ],
      accessory: [
        canonicalizeGeneratedExercise(
          { exerciseId: "side_plank", name: "Stabilizacja core", prescription: "2 × 30 s plank boczny", cue: "Linia ciała prosta." },
          "trunk",
        ),
      ],
      footballTransfer: [],
      cooldown: [
        canonicalizeGeneratedExercise(
          { exerciseId: "static_stretch_cooldown", name: "Rozciąganie", prescription: "5 min" },
          "mobility",
        ),
      ],
    },
    secondSession: null,
  };

  const normalized = normalizeSessionCategory(raw);
  if (normalized.classification) {
    normalized.classification.generatedBy = "final-week-validator";
    normalized.classification.repairTag = "missing-gym";
    normalized.classification.placementReason = placementReason;
  }
  return normalized;
}

/**
 * Gwarantuje wymaganą liczbę gym_strength w tygodniu.
 *  1. Liczy gym.
 *  2. Szuka wolnego dnia (rest) bez klubu/meczu/szybkości sąsiedniego gym.
 *  3. Próbuje zamienić nadmiarowy recovery/prehab na gym (jeśli 0 gym).
 *  4. Nigdy w dzień meczowy, nigdy 3. sesja dnia, nigdy 2 gym z rzędu.
 */
export function addMissingGymSessions(
  weekPlan: SessionDay[],
  weeklyRequirements: WeeklyRequirements,
  profile: Profile,
): AddMissingGymResult {
  const unresolvedIssues: string[] = [];

  if (!profile.hasGym) {
    // Brak dostępu do siłowni — minima gym nie obowiązują.
    return {
      weekPlan,
      added: 0,
      converted: 0,
      count: countGymSessions(weekPlan),
      requiredGymSessions: 0,
      unresolvedIssues,
    };
  }

  const required = weeklyRequirements.requiredGymSessions;
  const maxPerDay = getMaxSessionsPerDay({ maxSessionsPerDay: 2 });

  let added = 0;
  let converted = 0;
  let guard = 0;

  const adjacentHasGym = (idx: number): boolean => {
    const prev = idx > 0 ? weekPlan[idx - 1] : null;
    const next = idx < weekPlan.length - 1 ? weekPlan[idx + 1] : null;
    return (
      (!!prev && eachSession(prev).some((s) => isMainGymSession(s))) ||
      (!!next && eachSession(next).some((s) => isMainGymSession(s)))
    );
  };

  while (countGymSessions(weekPlan) < required && guard < 8) {
    guard += 1;

    // Krok 1: wolny dzień (rest) bez klubu/meczu, nie sąsiadujący z gym.
    const restIdx = weekPlan.findIndex(
      (d, i) =>
        !d.isUnavailable &&
        d.dayType === "rest" &&
        !isClubSession(d) &&
        !isMatchSession(d) &&
        !isDayBeforeMatch(d) &&
        !adjacentHasGym(i),
    );
    if (restIdx >= 0) {
      const light = isDayBeforeMatch(weekPlan[restIdx]) || isYouthOrBeginner(profile);
      const rebuilt = buildGymSessionDay(profile, weekPlan[restIdx], {
        light,
        placementReason:
          `Wybrano wolny dzień na brakującą siłownię — wymagane minimum: ${required}.`,
      });
      rebuilt.secondSession = weekPlan[restIdx].secondSession ?? null;
      weekPlan[restIdx] = rebuilt;
      added += 1;
      continue;
    }

    // Krok 2: zamiana nadmiarowego recovery/prehab na gym (jeśli jest ≥2 recovery i brak gym).
    if (countGymSessions(weekPlan) <required) {
      const recoveryDays = weekPlan
        .map((d, i) => ({ d, i }))
        .filter(
          ({ d, i }) =>
            !d.isUnavailable &&
            isRecoverySession(d) &&
            !isClubSession(d) &&
            !isMatchSession(d) &&
            !isDayBeforeMatch(d) &&
            !adjacentHasGym(i),
        );
      if (recoveryDays.length >= 1) {
        const target = recoveryDays[0];
        const light = isYouthOrBeginner(profile);
        const rebuilt = buildGymSessionDay(profile, target.d, {
          light,
          placementReason:
            "Zamieniono nadmiarowy recovery/prehab na siłownię — pełny tydzień wymaga gym_strength.",
        });
        rebuilt.secondSession = target.d.secondSession ?? null;
        weekPlan[target.i] = rebuilt;
        converted += 1;
        continue;
      }
    }

    // Krok 3: druga sesja na dniu klubowym, gdy limit = 2 i combo jest bezpieczna.
    if (maxPerDay >= 2) {
      const hostIdx = weekPlan.findIndex(
        (d, i) =>
          !d.isUnavailable &&
          !isMatchSession(d) &&
          !d.secondSession &&
          realSessionCount(d) < maxPerDay &&
          !isDayBeforeMatch(d) &&
          !adjacentHasGym(i) &&
          !eachSession(d).some((s) => isMainGymSession(s)),
      );
      if (hostIdx >= 0) {
        const host = weekPlan[hostIdx];
        const light = requiresLightSecondSession(profile);
        const second = buildGymSessionDay(profile, host, {
          light,
          slotLabel: light ? "Sesja 2 (siłownia lekka)" : "Sesja 2 (siłownia)",
          placementReason:
            light
              ? "Dodano siłownię jako drugą lekką sesję dnia — zgodnie z profilem zawodnika."
              : "Dodano pełną siłownię jako drugą, komplementarną sesję dnia.",
        });
        host.secondSession = second;
        host.slotLabel = host.slotLabel ?? "Sesja 1";
        added += 1;
        continue;
      }
    }
// Krok 4: pełny grafik bez wolnego slotu.
    // Zastąp nadmiarową sesję, ale zachowaj minimum
    // wydolności, szybkości i ekspozycji z piłką.
    const enduranceCount =
      countEnduranceSessions(weekPlan);
    const speedCount =
      countSpeedSessions(weekPlan);

    const ballCount = weekPlan.reduce(
      (total, day) =>
        total +
        eachSession(day).filter(
          (session) =>
            session.classification?.subcategory ===
            "ball_technical",
        ).length,
      0,
    );

    const replacementPriority = (
      session: SessionDay,
    ): number => {
      const category =
        session.classification?.category;
      const subcategory =
        session.classification?.subcategory;

      if (
        category === "recovery_prehab" ||
        category === "mobility"
      ) {
        return 0;
      }

      if (
        category === "speed_sprint" &&
        [
          "change_of_direction",
          "deceleration",
          "agility_speed",
        ].includes(subcategory ?? "")
      ) {
        return 1;
      }

      if (category === "endurance_conditioning") {
        return 2;
      }

      if (category === "speed_sprint") {
        return 3;
      }

      return 4;
    };

    const replaceableIdx =
      weekPlan
        .map((day, index) => ({ day, index }))
        .filter(({ day, index }) => {
          if (day.isUnavailable) return false;
          if (day.dayType !== "training") return false;
          if (
            isClubSession(day) ||
            isMatchSession(day)
          ) {
            return false;
          }
          if (
            isDayBeforeMatch(day) ||
            isDayAfterMatch(day)
          ) {
            return false;
          }
          if (
            adjacentHasGym(index) ||
            isMainGymSession(day) ||
            day.secondSession
          ) {
            return false;
          }

          const category =
            day.classification?.category;
          const subcategory =
            day.classification?.subcategory;

          if (category === "endurance_conditioning") {
            return (
              enduranceCount >
              Math.max(
                1,
                weeklyRequirements
                  .absoluteMinimumEnduranceSessions,
              )
            );
          }

          if (category === "speed_sprint") {
            return (
              speedCount >
              weeklyRequirements.requiredSpeedSessions
            );
          }

          if (subcategory === "ball_technical") {
            return ballCount > weeklyRequirements.requiredBallSessions;
          }

          return (
            category === "recovery_prehab" ||
            category === "mobility" ||
            category === "other"
          );
        })
        .sort(
          (a, b) =>
            replacementPriority(a.day) -
            replacementPriority(b.day),
        )[0]?.index ?? -1;

    if (replaceableIdx >= 0) {
      const rebuilt = buildGymSessionDay(
        profile,
        weekPlan[replaceableIdx],
        {
          light: isYouthOrBeginner(profile),
          placementReason:
            "Zastąpiono nadmiarową sesję brakującą siłownią bez naruszania minimum szybkości, wydolności i piłki.",
        },
      );

      weekPlan[replaceableIdx] = rebuilt;
      converted += 1;
      continue;
    }
    // Brak bezpiecznego miejsca.
    break;
  }

  const count = countGymSessions(weekPlan);
  if (count < required) {
    unresolvedIssues.push(
      `Tydzień ma ${count}/${required} siłowni — brak bezpiecznego dnia na dodanie brakującej sesji gym.`,
    );
  }

  return {
    weekPlan,
    added,
    converted,
    count,
    requiredGymSessions: required,
    unresolvedIssues,
  };
}

// ---------------------------------------------------------------------------
// Finalny hard gate
// ---------------------------------------------------------------------------

export function assertFinalPlanMeetsMinimums(
  weekPlan: SessionDay[],
  weeklyRequirements: WeeklyRequirements,
  profile?: Profile,
): WeekValidationReport {
  const unresolvedIssues: string[] = [];

  const gymSessionsCount = countGymSessions(weekPlan);
  const enduranceSessionsCount = countEnduranceSessions(weekPlan);
  const speedSessionsCount = countSpeedSessions(weekPlan);
  const ballSessionsCount = countBallSessions(weekPlan);

  const requiredGymSessions = weeklyRequirements.requiredGymSessions;
  const requiredEnduranceSessions = weeklyRequirements.requiredEnduranceSessions;
  const absoluteMinimumEnduranceSessions = Math.max(
    1,
    weeklyRequirements.absoluteMinimumEnduranceSessions,
  );
  const requiredSpeedSessions = weeklyRequirements.requiredSpeedSessions;
  const requiredBallSessions = weeklyRequirements.requiredBallSessions;

  const noEnduranceOnClubDays = profileAllowsHeavyClubEndurance(profile) || !weekPlan.some(
    (d) =>
      isClubSession(d) &&
      eachSession(d).some(
        (s) =>
          isEnduranceSession(s) &&
          s.intensity === "wysoka" &&
          eachSession(d).some(
            (club) => isClubSession(club) && club.intensity === "wysoka",
          ),
      ),
  );
  const noMoreThanMaxSessionsPerDay = !weekPlan.some((d) => realSessionCount(d) > 2);
  const noDuplicateSpeedSameDay = !weekPlan.some(
    (d) => eachSession(d).filter((s) => isSpeedSession(s)).length > 1,
  );
  const gapReport = validateNoBackToBackSpeedDays(weekPlan);
  const noBackToBackSpeedDays = gapReport.ok;
  const speedSessionsHaveMinimumOneDayGap = gapReport.ok;

  if (gymSessionsCount < requiredGymSessions)
    unresolvedIssues.push(`Za mało siłowni: ${gymSessionsCount}/${requiredGymSessions}.`);
  if (enduranceSessionsCount < absoluteMinimumEnduranceSessions)
    unresolvedIssues.push(
      `Za mało wydolności: ${enduranceSessionsCount}/${absoluteMinimumEnduranceSessions}.`,
    );
  if (speedSessionsCount < requiredSpeedSessions)
    unresolvedIssues.push(`Za mało szybkości: ${speedSessionsCount}/${requiredSpeedSessions}.`);
  if (ballSessionsCount < requiredBallSessions)
    unresolvedIssues.push(`Za mało własnej piłki: ${ballSessionsCount}/${requiredBallSessions}.`);
  if (!noEnduranceOnClubDays) unresolvedIssues.push("Zbyt ciężki endurance w dzień klubowy.");
  if (!noMoreThanMaxSessionsPerDay) unresolvedIssues.push("Dzień z 3 sesjami.");
  if (!noDuplicateSpeedSameDay) unresolvedIssues.push("Dwie szybkości tego samego dnia.");
  if (!noBackToBackSpeedDays) unresolvedIssues.push("Szybkość dzień po dniu (brak min. 1 dnia przerwy).");

  // Twardy gate: 0 endurance = plan NIGDY nie może być valid.
  const enduranceOk = enduranceSessionsCount >= absoluteMinimumEnduranceSessions;
  const ok = unresolvedIssues.length === 0 && enduranceOk;

  return {
    ok,
    finalStatus: ok ? "valid" : "invalid",
    gymSessionsCount,
    enduranceSessionsCount,
    speedSessionsCount,
    ballSessionsCount,
    requiredGymSessions,
    requiredEnduranceSessions,
    absoluteMinimumEnduranceSessions,
    requiredSpeedSessions,
    requiredBallSessions,
    noEnduranceOnClubDays,
    noMoreThanMaxSessionsPerDay,
    noDuplicateSpeedSameDay,
    noBackToBackSpeedDays,
    speedSessionsHaveMinimumOneDayGap,
    unresolvedIssues,
  };
}

// ---------------------------------------------------------------------------
// Orkiestracja: walidacja + naprawa jednego tygodnia
// ---------------------------------------------------------------------------

function weekContextFor(weekPlan: SessionDay[], profile: Profile): WeekRequirementContext {
  const clubTrainingCount = weekPlan.filter((d) => isClubSession(d)).length;
  const matchCount = weekPlan.filter((d) => isMatchSession(d)).length;
  return {
    seasonPhase: profile.seasonPhase,
    clubTrainingCount,
    matchCount,
    isFullWeek: matchCount < 2,
  };
}

export function requirementsFor(weekPlan: SessionDay[], profile: Profile): WeeklyRequirements {
  const ctx = weekContextFor(weekPlan, profile);
  const athlete = buildAthleteTrainingProfile(profile);
  return calculateWeeklyMinimumRequirements(
    ctx,
    { hasGym: profile.hasGym, clubTrainingDays: profile.clubTrainingDays, matchDate: profile.matchDate },
    profile.goal,
    {
      developmentStage: athlete.developmentStage,
      gymExperienceLevel: athlete.gymExperienceLevel,
      hasActivePain:
        profile.painInjury ||
        (profile.painLocations?.length ?? 0) > 0,
    },
  );
}

/**
 * FINALNY krok przed pokazaniem tygodnia w UI: usuwa endurance z dni klubowych,
 * dodaje brakujące endurance i zwraca raport hard-gate.
 */
export function validateAndRepairWeekPlan(
  weekPlan: SessionDay[],
  profile: Profile,
  weeklyRequirements?: WeeklyRequirements,
): { weekPlan: SessionDay[]; requirements: WeeklyRequirements; report: WeekValidationReport } {
  const requirements = weeklyRequirements ?? requirementsFor(weekPlan, profile);
  const ctx = weekContextFor(weekPlan, profile);

  // TWARDA ZASADA: nigdy dwie jednostki speed_sprint jednego dnia — naprawa przed assertem.
  repairDuplicateSpeedSameDay(weekPlan, profile);
  // TWARDA ZASADA: nigdy speed dzień po dniu — min. 1 dzień przerwy.
  repairBackToBackSpeedSessions(weekPlan, profile);

  validateNoEnduranceOnClubDays(weekPlan, profile);
  // Najpierw siłownia i szybkość, ponieważ ich naprawy mogą przebudować cały dzień.
  addMissingGymSessions(weekPlan, requirements, profile);
  addMissingCanonicalSpeedSessions(weekPlan, requirements, profile);
  // Speed ma pierwszeństwo w gęstym kalendarzu i może zastąpić wcześniejszy
  // drugi slot. Ponownie domykamy siłę, zanim przejdziemy do endurance/piłki.
  addMissingGymSessions(weekPlan, requirements, profile);
  repairDuplicateSpeedSameDay(weekPlan, profile);
  repairBackToBackSpeedSessions(weekPlan, profile);
  // Endurance dodajemy jako ostatnie: późniejsza naprawa innej kategorii nie może
  // po cichu skasować właśnie spełnionego minimum.
  addMissingEnduranceSessions(
    weekPlan,
    ctx,
    { maxSessionsPerDay: 2 },
    requirements,
    profile,
  );
  validateNoEnduranceOnClubDays(weekPlan, profile);
  // Własna piłka jest dodawana na końcu, żeby wcześniejsze naprawy siły i
  // wydolności nie mogły jej skasować. Klub i mecz nie spełniają tego minimum.
  addMissingBallSessions(weekPlan, requirements, profile);

  const report = assertFinalPlanMeetsMinimums(weekPlan, requirements, profile);

  const inheritedWeekMeta =
    weekPlan.find((day) => day.weekMeta)?.weekMeta;

  if (inheritedWeekMeta) {
    const repairedWeekMeta: NonNullable<SessionDay["weekMeta"]> = {
      ...inheritedWeekMeta,
      validationStatus:
        report.finalStatus === "valid" ? "rebuilt" : "invalid",
    };

    for (const day of weekPlan) {
      day.weekMeta = repairedWeekMeta;

      if (day.secondSession) {
        day.secondSession.weekMeta = repairedWeekMeta;
      }
    }
  }

  return { weekPlan, requirements, report };
}
// ---------------------------------------------------------------------------
// Wejście na cały plan (28 dni) — grupuje na pełne tygodnie
// ---------------------------------------------------------------------------

/** Dzieli plan na tygodnie kalendarzowe (start w poniedziałek). */
function chunkIntoWeeks(plan: SessionDay[]): SessionDay[][] {
  const weeks: SessionDay[][] = [];
  let current: SessionDay[] = [];
  for (const day of plan) {
    const dow = day.dayOfWeek ?? isoDayOfWeek(parseIso(day.date));
    if (dow === 1 && current.length > 0) {
      weeks.push(current);
      current = [];
    }
    current.push(day);
  }
  if (current.length > 0) weeks.push(current);
  return weeks;
}

function isFullCalendarWeek(week: SessionDay[]): boolean {
  if (week.length !== 7) return false;
  const first = week[0];
  const dow = first.dayOfWeek ?? isoDayOfWeek(parseIso(first.date));
  return dow === 1;
}

export interface FinalizePlanResult {
  plan: SessionDay[];
  reports: WeekValidationReport[];
}

/**
 * Finalizuje cały plan: dla każdego PEŁNEGO tygodnia gwarantuje minima
 * (w szczególności ≥1 endurance_conditioning). Zwraca naprawiony plan i raporty.
 */
export function finalizeWeekPlan(
  plan: SessionDay[],
  profile: Profile,
): FinalizePlanResult {
  const firstPassWeeks = chunkIntoWeeks(plan);

  // Najpierw napraw każdy pełny tydzień osobno.
  for (const week of firstPassWeeks) {
    if (!isFullCalendarWeek(week)) continue;

    validateAndRepairWeekPlan(week, profile);
  }

  const firstPassPlan: SessionDay[] = [];

  for (const week of firstPassWeeks) {
    firstPassPlan.push(...week);
  }

  // Następnie sprawdź przejścia niedziela → poniedziałek.
  repairSpeedAcrossWeekBoundaries(firstPassPlan, profile);

  // Raporty muszą powstać po wszystkich naprawach.
  const finalWeeks = chunkIntoWeeks(firstPassPlan);
  let reports: WeekValidationReport[] = [];

  for (const week of finalWeeks) {
    if (!isFullCalendarWeek(week)) continue;

    const { report } = validateAndRepairWeekPlan(
      week,
      profile,
    );

    reports.push(report);
  }

  const finalPlan: SessionDay[] = [];

  for (const week of finalWeeks) {
    finalPlan.push(...week);
  }

  // Naprawa pojedynczych tygodni może ponownie dodać obowiązkowy sprint
  // w poniedziałek, tuż po niedzielnym RSA z poprzedniego tygodnia.
  // Granica tygodni musi więc być ostatnim etapem mutującym plan.
  repairSpeedAcrossWeekBoundaries(finalPlan, profile);

  // Raportuj stan faktycznie zwracany po naprawie granic, bez ponownego
  // dodawania sesji, które odtworzyłoby właśnie usunięty konflikt.
  reports = chunkIntoWeeks(finalPlan)
    .filter(isFullCalendarWeek)
    .map((week) => assertFinalPlanMeetsMinimums(week, requirementsFor(week, profile), profile));

  return {
    plan: finalPlan,
    reports,
  };
}
