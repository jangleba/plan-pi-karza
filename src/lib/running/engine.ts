import { measureMasEvidence, verifiedMasKmh, masTrial } from "./masQuality";
import type { RunningActivity, RunningIntervalResult } from "./types";
import type { RunningRecipe } from "./recipe";

export const FIELD_MAS_TEST_DURATION_SEC = 5 * 60;
export const FIELD_MAS_RETEST_DAYS = 28;

export interface PaceRange {
  /** Szybsza granica zakresu (mniej sekund na kilometr). */
  fastestSecPerKm: number;
  /** Wolniejsza granica zakresu (więcej sekund na kilometr). */
  slowestSecPerKm: number;
  label: string;
}

export type RunningSessionMethod =
  "field_mas_test" | "easy_aerobic" | "extensive_intervals" | "tempo_intervals" | "short_hiit";

export interface RunningSessionPrescription {
  method: RunningSessionMethod;
  title: string;
  sessionType: string;
  goal: string;
  durationMin: number;
  intensity: "niska" | "umiarkowana" | "wysoka";
  loadLevel: "low" | "moderate" | "high";
  main: Array<{ name: string; prescription: string; rest?: string; cue?: string }>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateFieldMasKmh(
  distanceM: number,
  durationSec = FIELD_MAS_TEST_DURATION_SEC,
): number | null {
  if (
    !Number.isFinite(distanceM) ||
    !Number.isFinite(durationSec) ||
    distanceM < 600 ||
    durationSec < 240
  ) {
    return null;
  }
  const kmh = (distanceM / durationSec) * 3.6;
  if (kmh < 7 || kmh > 26) return null;
  return Math.round(kmh * 100) / 100;
}

export function formatPaceTarget(secondsPerKm: number): string {
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

export function paceRangeFromMas(
  fieldMasKmh: number,
  minPercent: number,
  maxPercent: number,
): PaceRange | null {
  if (!Number.isFinite(fieldMasKmh) || fieldMasKmh <= 0) return null;
  const low = clamp(Math.min(minPercent, maxPercent), 40, 130) / 100;
  const high = clamp(Math.max(minPercent, maxPercent), 40, 130) / 100;
  const fastestSecPerKm = Math.round(3600 / (fieldMasKmh * high));
  const slowestSecPerKm = Math.round(3600 / (fieldMasKmh * low));
  return {
    fastestSecPerKm,
    slowestSecPerKm,
    label: `${formatPaceTarget(fastestSecPerKm).replace("/km", "")}–${formatPaceTarget(slowestSecPerKm)}`,
  };
}

export function isFieldMasCurrent(testedAt: string | null | undefined, todayIso: string): boolean {
  if (!testedAt) return false;
  const tested = Date.parse(`${testedAt.slice(0, 10)}T12:00:00Z`);
  const today = Date.parse(`${todayIso.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(tested) || !Number.isFinite(today) || today < tested) return false;
  return today - tested < FIELD_MAS_RETEST_DAYS * 86_400_000;
}

function paceText(range: PaceRange | null): string {
  return range ? `tempo ${range.label}` : "tempo konwersacyjne (RPE 3–4/10)";
}

/**
 * Dobiera metodę i dawkę. Kolejne poziomy zmieniają tylko jeden parametr
 * głównego bodźca naraz; prędkość odniesienia zmienia dopiero ponowny test MAS.
 */
export function buildRunningSessionPrescription(input: {
  fieldMasKmh?: number | null;
  fieldMasTestedAt?: string | null;
  date: string;
  sessionIndex: number;
  progressionLevel?: number | null;
  /** Jawnie wskaż pierwszą sesję tygodnia jako miejsce testu, jeśli MAS wygasł. */
  scheduleFieldMasTest?: boolean;
  /** Wymusza lekki wariant, np. drugi slot, niski readiness albo okolice meczu. */
  forceLight?: boolean;
}): RunningSessionPrescription {
  const hasCurrentMas =
    typeof input.fieldMasKmh === "number" && isFieldMasCurrent(input.fieldMasTestedAt, input.date);

  if (input.forceLight) {
    const range = hasCurrentMas ? paceRangeFromMas(input.fieldMasKmh!, 65, 75) : null;
    return {
      method: "easy_aerobic",
      title: "Spokojny bieg tlenowy",
      sessionType: "Wytrzymałość — easy aerobic",
      goal: "Lekka praca tlenowa bez dokładania dużego zmęczenia mechanicznego.",
      durationMin: 30,
      intensity: "niska",
      loadLevel: "low",
      main: [
        {
          name: "Bieg ciągły bez piłki",
          prescription: `1 × 20 min bieg, ${paceText(range)}`,
          cue: "Równe tempo, swobodny oddech i pełne zdania bez zadyszki.",
        },
      ],
    };
  }

  // Test 5 min jest dobrowolny: powstaje tylko na wyraźną prośbę, nigdy z numeru sesji.
  const shouldScheduleTest = input.scheduleFieldMasTest === true;
  if (!hasCurrentMas && shouldScheduleTest) {
    return {
      method: "field_mas_test",
      title: "Test biegowy 5 min",
      sessionType: "Wydolność — test terenowego MAS",
      goal: "Ustalenie własnego tempa do kolejnych treningów biegowych.",
      durationMin: 25,
      intensity: "wysoka",
      loadLevel: "high",
      main: [
        {
          name: "Test 5-minutowy — równy maksymalny wysiłek",
          prescription: "1 × 5 min bieg, bez przerwy",
          cue: "Zacznij kontrolowanie i utrzymaj możliwie równe, najwyższe tempo przez pełne 5 minut.",
        },
      ],
    };
  }

  if (!hasCurrentMas) {
    return {
      method: "easy_aerobic",
      title: "Spokojny bieg tlenowy",
      sessionType: "Wytrzymałość — easy aerobic",
      goal: "Budowa bazy tlenowej przed wyznaczeniem indywidualnego tempa.",
      durationMin: 30,
      intensity: "niska",
      loadLevel: "low",
      main: [
        {
          name: "Bieg ciągły bez piłki",
          prescription: "1 × 20 min bieg, tempo konwersacyjne (RPE 3–4/10)",
          cue: "Pełne zdania bez zadyszki. Nie przyspieszaj przed wykonaniem testu 5-minutowego.",
        },
      ],
    };
  }

  const mas = input.fieldMasKmh!;
  const level = clamp(Math.round(input.progressionLevel ?? 0), 0, 3);
  const slot = Math.max(0, input.sessionIndex) % 3;

  if (slot === 1) {
    const range = paceRangeFromMas(mas, 80, 86);
    const reps = level >= 2 ? 4 : 3;
    return {
      method: "tempo_intervals",
      title: "Tempo tlenowe",
      sessionType: "Wytrzymałość — tempo aerobowe",
      goal: "Dłuższa praca w równym tempie bez wchodzenia w maksymalny wysiłek.",
      durationMin: 45,
      intensity: "umiarkowana",
      loadLevel: "moderate",
      main: [
        {
          name: "Dłuższe odcinki tempowe bez piłki",
          prescription: `${reps} × 6 min bieg, przerwa 2 min trucht, ${paceText(range)}`,
          rest: "2 min trucht",
          cue: "Pierwszy i ostatni odcinek mają wyglądać podobnie. Zostaw zapas.",
        },
      ],
    };
  }

  if (slot === 2) {
    const range = paceRangeFromMas(mas, 100, 105);
    const reps = level >= 2 ? 8 : 6;
    return {
      method: "short_hiit",
      title: "Krótkie interwały 1/1",
      sessionType: "Wytrzymałość — krótkie interwały tlenowe",
      goal: "Mocny bodziec tlenowy przy odcinkach wystarczająco długich do stabilnego prowadzenia GPS.",
      durationMin: 40,
      intensity: "wysoka",
      loadLevel: "high",
      main: [
        {
          name: "Krótkie interwały bez piłki",
          prescription: `${reps} × 1 min bieg / 1 min trucht, ${paceText(range)}`,
          rest: "1 min trucht",
          cue: "Równo, bez sprintu na maksa. GPS ocenia tempo dopiero po ustabilizowaniu odcinka.",
        },
      ],
    };
  }

  const range = paceRangeFromMas(mas, 90, 95);
  // Stała liczba powtórzeń; zwiększamy wyłącznie czas pracy.
  const workMin = [3, 3.5, 4, 4.5][level];
  const reps = 4;
  return {
    method: "extensive_intervals",
    title: "Interwały tlenowe",
    sessionType: "Wytrzymałość — interwały ekstensywne",
    goal: "Rozwój zdolności do powtarzania mocnego biegu w równym tempie.",
    durationMin: 45,
    intensity: "wysoka",
    loadLevel: "high",
    main: [
      {
        name: "Interwały ekstensywne bez piłki",
        prescription: `${reps} × ${workMin} min bieg, przerwa 2 min trucht, ${paceText(range)}`,
        rest: "2 min trucht",
        cue: "Nie ścigaj pierwszego odcinka. Utrzymaj wszystkie powtórzenia w podanym zakresie.",
      },
    ],
  };
}

export function fieldMasFromActivity(
  activity: Pick<RunningActivity, "distanceM" | "durationSec" | "intervalResults"> &
    Partial<Pick<RunningActivity, "masTestEvidence" | "route" | "source">>,
): number | null {
  // Full local traces take precedence over uploaded summaries; a bad trace cannot borrow good evidence.
  const evidence = activity.route?.length
    ? measureMasEvidence(
        { ...activity, route: activity.route, source: activity.source ?? "gps" },
        activity.masTestEvidence?.interrupted ?? false,
      )
    : activity.masTestEvidence;
  const trial = masTrial(activity.intervalResults);
  if (
    !trial ||
    !evidence ||
    trial.recipeId !== evidence.recipeId ||
    Math.abs(trial.distanceM - evidence.distanceM) > 0.1 ||
    activity.durationSec < evidence.startElapsedSec + 300
  )
    return null;
  return verifiedMasKmh(evidence);
}

/** Wynikiem testu jest tylko zapis sesji oznaczonej jako test 5 min. */
function isFieldMasTestActivity(
  activity: Pick<RunningActivity, "intervalResults" | "isFieldMasTest">,
): boolean {
  if (activity.isFieldMasTest !== true) return false;
  const work = activity.intervalResults.filter(
    (result) => result.kind === "work" && result.completed,
  );
  return work.length === 1 && work[0].durationSec >= 298 && work[0].durationSec <= 302;
}

/**
 * Odtwarza trwały stan silnika z istniejącej historii biegów. Dzięki temu wynik
 * testu i poziom progresji nie wymagają nowych kolumn ani ręcznej migracji SQL.
 */
export function deriveRunningEngineState(
  activities: RunningActivity[],
  rpeBySession: Record<string, number | null> = {},
  executionBySession: Record<string, RunningFeedbackPrescription> = {},
): {
  fieldMasKmh: number | null;
  fieldMasTestedAt: string | null;
  runningProgressionLevel: number;
  runningProgressionUpdatedAt: string | null;
} {
  const ordered = [...activities].sort((a, b) =>
    `${a.date}|${a.endedAt}`.localeCompare(`${b.date}|${b.endedAt}`),
  );
  let fieldMasKmh: number | null = null;
  let fieldMasTestedAt: string | null = null;
  let runningProgressionLevel = 0;
  let runningProgressionUpdatedAt: string | null = null;

  for (const activity of ordered) {
    if (isFieldMasTestActivity(activity)) {
      const measured = fieldMasFromActivity(activity);
      if (measured) {
        fieldMasKmh = measured;
        fieldMasTestedAt = activity.date;
        runningProgressionLevel = 0;
        runningProgressionUpdatedAt = activity.date;
      }
      continue;
    }
    if (activity.masTestAttempt || !fieldMasTestedAt || activity.date < fieldMasTestedAt) continue;
    const next = nextRunningProgressionLevelForSession({
      currentLevel: runningProgressionLevel,
      rpe: rpeBySession[activity.sessionId] ?? null,
      results: activity.intervalResults,
      executionSnapshot: executionBySession[activity.sessionId],
    });
    if (next !== runningProgressionLevel) {
      runningProgressionLevel = next;
      runningProgressionUpdatedAt = activity.date;
    }
  }

  return {
    fieldMasKmh,
    fieldMasTestedAt,
    runningProgressionLevel,
    runningProgressionUpdatedAt,
  };
}

function completedWork(results: RunningIntervalResult[]): RunningIntervalResult[] {
  return results.filter((result) => result.kind === "work" && result.completed);
}

/** Progresuje, utrzymuje lub cofa dawkę — bez automatycznego zmieniania MAS. */
export function nextRunningProgressionLevel(input: {
  currentLevel: number;
  rpe: number | null;
  results: RunningIntervalResult[];
}): number {
  const current = clamp(Math.round(input.currentLevel), 0, 3);
  const observed = input.results.filter((result) => result.kind === "work");
  const work = completedWork(input.results).filter((result) => {
    if (result.targetMode === "time" && result.targetValue)
      return result.durationSec >= result.targetValue * 0.95;
    if (result.targetMode === "distance" && result.targetValue)
      return result.distanceM >= result.targetValue * 0.95;
    return true;
  });
  if (observed.length === 0) return current;
  const plannedCount = Math.max(
    observed.length,
    ...observed.map((result) => result.repeatTotal || 1),
  );
  const completionRate = work.length / plannedCount;
  const paces = work
    .map((r) => r.paceSecPerKm)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
  const consistency = paces.length < 2 ? null : Math.min(...paces) / Math.max(...paces);
  if (
    (input.rpe != null && input.rpe >= 9) ||
    completionRate < 0.75 ||
    (consistency != null && consistency < 0.88)
  )
    return Math.max(0, current - 1);
  // Brak oceny lub tempa nie jest dowodem gotowości do zwiększenia dawki.
  const hasFeedback =
    input.rpe != null && Number.isFinite(input.rpe) && input.rpe >= 1 && input.rpe <= 7;
  const targetAdherence = work.every(
    (r) =>
      r.targetPaceFastestSecPerKm == null ||
      r.targetPaceSlowestSecPerKm == null ||
      (r.paceSecPerKm != null &&
        r.paceSecPerKm >= r.targetPaceFastestSecPerKm * 0.97 &&
        r.paceSecPerKm <= r.targetPaceSlowestSecPerKm * 1.03),
  );
  if (
    hasFeedback &&
    paces.length === work.length &&
    consistency != null &&
    consistency >= 0.94 &&
    completionRate >= 0.95 &&
    targetAdherence
  )
    return Math.min(3, current + 1);
  return current;
}

/** The pinned prescription, never a newly generated recipe or the current profile. */
export interface RunningFeedbackPrescription {
  engineV2?: { roles: readonly string[] };
  runningRecipe?: RunningRecipe;
}

/** Mirrors SQL next_running_level_for_session; high planned HIIT effort is not failure. */
export function nextRunningProgressionLevelForSession(input: {
  currentLevel: number;
  rpe: number | null;
  results: RunningIntervalResult[];
  executionSnapshot?: RunningFeedbackPrescription;
}): number {
  if (input.rpe == null) return clamp(Math.round(input.currentLevel), 0, 3);
  const recipe = input.executionSnapshot?.runningRecipe;
  const block = recipe?.blocks?.[0];
  const hardHiit =
    input.executionSnapshot?.engineV2?.roles?.includes("endurance") &&
    recipe?.schema === "ballwise-run-recipe-v1" &&
    recipe.method === "short_hiit" &&
    typeof recipe.id === "string" &&
    recipe.id.startsWith("v2:endurance:short_hiit:") &&
    recipe.paceSource === "field_mas" &&
    recipe.blocks.length === 1 &&
    Array.isArray(block?.intensity?.rpe) &&
    block.intensity.rpe.length === 2 &&
    block.intensity.rpe[0] === 8 &&
    block.intensity.rpe[1] === 9 &&
    block.work?.seconds === 60 &&
    block.recovery?.seconds === 60;
  return nextRunningProgressionLevel({
    ...input,
    // Retain the actual RPE in history. Only the policy's effort condition differs:
    // no automatic increase from HIIT; incomplete or uneven work can still regress.
    rpe: hardHiit && input.rpe <= 9 ? null : input.rpe,
  });
}
