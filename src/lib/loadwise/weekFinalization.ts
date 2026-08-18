// ============================================================================
// Loadwise — FINALNY walidator i naprawa tygodnia (twardy gate przed UI).
// ----------------------------------------------------------------------------
// Działa na realnym wyjściu generatora: SessionDay[] (28 dni). Grupuje plan na
// pełne tygodnie kalendarzowe (poniedziałek–niedziela) i gwarantuje minima:
//
//   - minimum 2 gym_strength,
//   - minimum 1 endurance_conditioning (TWARDA ZASADA, zawsze),
//   - minimum 1 speed_sprint.
//
// Krytyczna zasada: pełny tydzień NIGDY nie może wyjść z 0 endurance_conditioning.
// Regeneracja/prehab NIE zastępuje wydolności. Jeśli tydzień ma 0 endurance i
// >1 recovery/prehab, jeden nadmiarowy recovery/prehab zostaje zamieniony na
// endurance_conditioning. Endurance nigdy nie trafia w dzień klubowy ani meczowy
// i nigdy nie powstaje trzecia sesja dnia.
// ============================================================================

import type { Profile, SessionDay, ExerciseItem, DayType } from "./types";
import { isoDayOfWeek, dayName as dayNameOf, parseIso } from "./labels";
import {
  normalizeSessionCategory,
  isEnduranceSession,
  isMainGymSession,
  isClubSession,
  isMatchSession,
  isRecoverySession,
} from "./sessionClassification";
import { hasRealSpeedExposure } from "./speedLoad";
import { getMaxSessionsPerDay, isYouthOrBeginner as isYouthOrBeginnerSched } from "./dailyScheduling";
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

export interface WeekValidationReport {
  ok: boolean;
  finalStatus: "valid" | "invalid";
  gymSessionsCount: number;
  enduranceSessionsCount: number;
  speedSessionsCount: number;
  requiredGymSessions: number;
  requiredEnduranceSessions: number;
  absoluteMinimumEnduranceSessions: number;
  requiredSpeedSessions: number;
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
    (n, d) => n + eachSession(d).filter((s) => isSpeedSession(s)).length,
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
  });
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
}

function normalEnduranceBuild(index: number): EnduranceBuild {
  const variants: EnduranceBuild[] = [
    {
      title: "Tempo aerobowe (kontrolowane)",
      sessionType: "Wytrzymałość — tempo aerobowe",
      goalOfSession: "Rozwój bazy tlenowej kontrolowanym tempem, bez wyczerpania.",
      main: [
        { name: "Bieg tempo aerobowe", prescription: "6–10 × 100 m luźnym tempem", rest: "trucht powrotny", cue: "Równy rytm, kontroluj oddech." },
        { name: "Blok ciągły w strefie tlenowej", prescription: "2–4 × 4 min, przerwa 2 min", rest: "2 min", cue: "Tempo konwersacyjne, nie na maksa." },
      ],
    },
    {
      title: "Interwały tlenowe ekstensywne",
      sessionType: "Wytrzymałość — interwały tlenowe",
      goalOfSession: "Poprawa wydolności tlenowej kontrolowanymi interwałami.",
      main: [
        { name: "Interwały aerobowe", prescription: "8 × 1 min bieg / 1 min trucht", rest: "1 min trucht", cue: "Równe tempo we wszystkich powtórzeniach." },
        { name: "Powtarzane tempo z piłką", prescription: "4 × 3 min, przerwa 2 min", rest: "2 min", cue: "Kontrola tempa, jakość ruchu." },
      ],
    },
    {
      title: "Strefa 2 — bieg ciągły aerobowy",
      sessionType: "Wytrzymałość — zone 2 aerobowy",
      goalOfSession: "Budowa bazy tlenowej w strefie 2, niski koszt regeneracyjny.",
      main: [
        { name: "Ciągły bieg strefa 2", prescription: "25–35 min, tętno komfortowe", cue: "Tempo konwersacyjne przez cały czas." },
      ],
    },
  ];
  return variants[index % variants.length];
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
  const build = opts.light ? lightEnduranceBuild(profile) : normalEnduranceBuild(opts.index);
  const iso = templateDay.date;
  const name = templateDay.dayName || dayNameOf(parseIso(iso));
  const placementReason = opts.placementReason ?? PLACEMENT_REASON;

  const raw: SessionDay = {
    date: iso,
    dayName: name,
    dayType: "training" as DayType,
    title: build.title,
    goalLabel: "Wydolność",
    intensity: opts.light ? "niska" : "umiarkowana",
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
    normalized.classification.generatedBy = "final-week-validator";
    normalized.classification.repairTag = "missing-endurance";
    normalized.classification.placementReason = placementReason;
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Twarda blokada: endurance nigdy w dzień klubowy
// ---------------------------------------------------------------------------

export function validateNoEnduranceOnClubDays(weekPlan: SessionDay[]): { removed: number } {
  let removed = 0;
  for (const day of weekPlan) {
    if (!isClubSession(day)) continue;
    if (day.secondSession && isEnduranceSession(day.secondSession)) {
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

  for (const day of weekPlan) {
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

  let guard = 0;
  while (guard < 14) {
    guard += 1;
    const report = validateNoBackToBackSpeedDays(weekPlan);
    if (report.ok) break;

    const [, laterIndex] = report.tooClosePairs[0];
    const laterDay = weekPlan[laterIndex];

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
        idx !== laterIndex &&
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
        candidate[laterIndex] = {
          ...laterDay,
          dayType: "rest" as DayType,
          title: "Odpoczynek",
          slotLabel: null,
          secondSession: laterDay.secondSession ?? null,
          exercises: [],
          reason: "Szybkość przeniesiona — zachowano min. 1 dzień przerwy między speed.",
          whyToday: "Szybkość przeniesiona — zachowano min. 1 dzień przerwy między speed.",
        };
      }
      if (!passesGlobalWeekGate(candidate, profile)) {
        if (isSpeedSession(laterDay)) {
          weekPlan[laterIndex] = candidate[laterIndex];
        }
        removed += 1;
        unresolvedIssues.push(
          `Usunięto szybkość w dniu ${laterDay.date} — przeniesienie narusza globalne reguły tygodnia.`,
        );
        continue;
      }
      weekPlan[idx] = relocated;
      // Jeśli źródłem był główny dzień (nie secondSession), zamień go na rest.
      if (isSpeedSession(laterDay) && laterDay === weekPlan[laterIndex]) {
        weekPlan[laterIndex] = {
          ...laterDay,
          dayType: "rest" as DayType,
          title: "Odpoczynek",
          slotLabel: null,
          secondSession: laterDay.secondSession ?? null,
          exercises: [],
          reason: "Szybkość przeniesiona — zachowano min. 1 dzień przerwy między speed.",
          whyToday: "Szybkość przeniesiona — zachowano min. 1 dzień przerwy między speed.",
        };
      }
      moved += 1;
    } else {
      // Brak miejsca — zamień późniejszy dzień na rest (usuń szybkość).
      if (isSpeedSession(laterDay) && laterDay === weekPlan[laterIndex] && !laterDay.secondSession) {
        weekPlan[laterIndex] = {
          ...laterDay,
          dayType: "rest" as DayType,
          title: "Odpoczynek",
          slotLabel: null,
          secondSession: null,
          exercises: [],
          reason: "Usunięto szybkość dzień po dniu — brak dnia z min. 1 dniem przerwy.",
          whyToday: "Usunięto szybkość dzień po dniu — brak dnia z min. 1 dniem przerwy.",
        };
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
 *  4. Nigdy w dzień klubowy/meczowy, nigdy 3. sesja dnia.
 *  5. Lekka wersja tylko gdy są powody (readiness/przeciążenie/MD+1/youth/ból).
 */
export function addMissingEnduranceSessions(
  weekPlan: SessionDay[],
  weekContext: WeekRequirementContext,
  userSettings: Pick<Profile, "doubleSessionsAllowed"> | null | undefined,
  weeklyRequirements: WeeklyRequirements,
  profile: Profile,
): AddMissingEnduranceResult {
  const unresolvedIssues: string[] = [];
  void weekContext;

  validateNoEnduranceOnClubDays(weekPlan);

  const required = Math.max(1, weeklyRequirements.requiredEnduranceSessions);
  const absoluteMinimum = Math.max(1, weeklyRequirements.absoluteMinimumEnduranceSessions);
  const maxPerDay = getMaxSessionsPerDay({
    doubleSessionsAllowed: userSettings?.doubleSessionsAllowed ?? profile.doubleSessionsAllowed,
  });
  const overloaded = weekIsOverloaded(weekPlan);

  const lowReadinessReasons = (day: SessionDay): boolean =>
    overloaded || isYouthOrBeginner(profile) || hasLowerLimbPain(profile) || isDayAfterMatch(day);

  let added = 0;
  let converted = 0;
  let guard = 0;

  while (countEnduranceSessions(weekPlan) < required && guard < 14) {
    guard += 1;
    let idx = countEnduranceSessions(weekPlan);

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
      (d) =>!d.isUnavailable && d.dayType === "rest" && !isClubSession(d) && !isMatchSession(d),
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
        const light = isDayBeforeMatch(host) || lowReadinessReasons(host) || true; // 2. sesja zawsze lekka
        const second = buildEnduranceSessionDay(profile, host, {
          light,
          index: idx,
          slotLabel: "Sesja 2 (lekka)",
          placementReason:
            "Dodano wydolność jako drugą (lekką) sesję dnia — bez łamania limitu i bez dnia klubowego.",
        });
        host.secondSession = second;
        host.slotLabel = host.slotLabel ?? "Sesja 1";
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
    "Dodano brakującą sesję siłowni — pełny tydzień wymaga minimum 2 gym_strength.";

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
      warmup: [{ name: "Rozgrzewka dynamiczna", prescription: "5–8 min mobilizacja" }],
      main: youth
        ? [
            { name: "Przysiad z masą ciała", prescription: "3 × 10", cue: "Kolana w linii stóp." },
            { name: "Plank", prescription: "3 × 30 s", cue: "Napięty brzuch, biodra w linii." },
          ]
        : [
            { name: "Przysiad goblet", prescription: "3 × 8", rest: "90 s", cue: "Pełen zakres." },
            { name: "RDL / Hip hinge", prescription: "3 × 8", rest: "75 s", cue: "Biodra w tył, proste plecy." },
          ],
      accessory: [
        { name: "Stabilizacja core", prescription: "2 × 30 s plank boczny", cue: "Linia ciała prosta." },
      ],
      footballTransfer: [],
      cooldown: [{ name: "Rozciąganie", prescription: "5 min" }],
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
  const maxPerDay = getMaxSessionsPerDay({
    doubleSessionsAllowed: profile.doubleSessionsAllowed,
  });

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
          "Wybrano wolny dzień na brakującą siłownię — min. 2 gym_strength w pełnym tygodniu.",
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
        const second = buildGymSessionDay(profile, host, {
          light: true, // druga sesja zawsze lekka
          slotLabel: "Sesja 2 (siłownia lekka)",
          placementReason:
            "Dodano siłownię jako drugą (lekką) sesję dnia — bez łamania limitu.",
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

    const hasFootballExposure = weekPlan.some(
      (day) =>
        isClubSession(day) || isMatchSession(day),
    );

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
            return hasFootballExposure || ballCount > 1;
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
): WeekValidationReport {
  const unresolvedIssues: string[] = [];

  const gymSessionsCount = countGymSessions(weekPlan);
  const enduranceSessionsCount = countEnduranceSessions(weekPlan);
  const speedSessionsCount = countSpeedSessions(weekPlan);

  const requiredGymSessions = weeklyRequirements.requiredGymSessions;
  const requiredEnduranceSessions = weeklyRequirements.requiredEnduranceSessions;
  const absoluteMinimumEnduranceSessions = Math.max(
    1,
    weeklyRequirements.absoluteMinimumEnduranceSessions,
  );
  const requiredSpeedSessions = weeklyRequirements.requiredSpeedSessions;

  const noEnduranceOnClubDays = !weekPlan.some(
    (d) => isClubSession(d) && eachSession(d).some((s) => isEnduranceSession(s)),
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
  if (!noEnduranceOnClubDays) unresolvedIssues.push("Endurance w dzień klubowy.");
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
    requiredGymSessions,
    requiredEnduranceSessions,
    absoluteMinimumEnduranceSessions,
    requiredSpeedSessions,
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

function requirementsFor(weekPlan: SessionDay[], profile: Profile): WeeklyRequirements {
  const ctx = weekContextFor(weekPlan, profile);
  const athlete = buildAthleteTrainingProfile(profile);
  return calculateWeeklyMinimumRequirements(
    ctx,
    { hasGym: profile.hasGym, clubTrainingDays: profile.clubTrainingDays, matchDate: profile.matchDate },
    profile.goal,
    {
      developmentStage: athlete.developmentStage,
      gymExperienceLevel: athlete.gymExperienceLevel,
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

  validateNoEnduranceOnClubDays(weekPlan);
  addMissingEnduranceSessions(
    weekPlan,
    ctx,
    { doubleSessionsAllowed: profile.doubleSessionsAllowed },
    requirements,
    profile,
  );
  // Naprawa brakujących sesji siłowni (analogicznie do endurance).
  addMissingGymSessions(weekPlan, requirements, profile);
  validateNoEnduranceOnClubDays(weekPlan);
  // Ponowna naprawa na wypadek, gdyby endurance zajęło slot (idempotentna).
  repairDuplicateSpeedSameDay(weekPlan, profile);
  repairBackToBackSpeedSessions(weekPlan, profile);

  const report = assertFinalPlanMeetsMinimums(weekPlan, requirements);

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
  const reports: WeekValidationReport[] = [];

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

  return {
    plan: finalPlan,
    reports,
  };
}
