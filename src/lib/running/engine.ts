import type { RunningActivity, RunningIntervalResult } from "./types";

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
  | "field_mas_test"
  | "easy_aerobic"
  | "extensive_intervals"
  | "tempo_intervals"
  | "short_hiit";

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

export function calculateFieldMasKmh(distanceM: number, durationSec = FIELD_MAS_TEST_DURATION_SEC): number | null {
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationSec) || distanceM < 600 || durationSec < 240) {
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
}): RunningSessionPrescription {
  const hasCurrentMas =
    typeof input.fieldMasKmh === "number" &&
    isFieldMasCurrent(input.fieldMasTestedAt, input.date);

  if (!hasCurrentMas && input.sessionIndex === 0) {
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
          prescription: "20–30 min, tempo konwersacyjne (RPE 3–4/10)",
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
  const workMin = level >= 3 ? 4 : 3;
  const reps = level === 0 ? 4 : level === 1 ? 5 : 4;
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

export function fieldMasFromActivity(activity: Pick<RunningActivity, "distanceM" | "durationSec" | "intervalResults">): number | null {
  const test = activity.intervalResults.find(
    (result) => result.kind === "work" && result.completed && result.durationSec >= 285 && result.durationSec <= 330,
  );
  return test
    ? calculateFieldMasKmh(test.distanceM, test.durationSec)
    : calculateFieldMasKmh(activity.distanceM, activity.durationSec);
}

function isFieldMasTestActivity(activity: Pick<RunningActivity, "intervalResults">): boolean {
  const work = activity.intervalResults.filter((result) => result.kind === "work" && result.completed);
  return work.length === 1 && work[0].durationSec >= 285 && work[0].durationSec <= 330;
}

/**
 * Odtwarza trwały stan silnika z istniejącej historii biegów. Dzięki temu wynik
 * testu i poziom progresji nie wymagają nowych kolumn ani ręcznej migracji SQL.
 */
export function deriveRunningEngineState(
  activities: RunningActivity[],
  rpeBySession: Record<string, number | null> = {},
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
    if (!fieldMasTestedAt || activity.date < fieldMasTestedAt) continue;
    const next = nextRunningProgressionLevel({
      currentLevel: runningProgressionLevel,
      rpe: rpeBySession[activity.sessionId] ?? null,
      results: activity.intervalResults,
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
  const work = completedWork(input.results);
  if (work.length === 0) return current;
  const completionRate = work.length / Math.max(1, input.results.filter((r) => r.kind === "work").length);
  const paces = work.map((r) => r.paceSecPerKm).filter((p): p is number => typeof p === "number" && p > 0);
  const consistency = paces.length < 2 ? 1 : Math.min(...paces) / Math.max(...paces);
  if ((input.rpe ?? 7) >= 9 || completionRate < 0.75 || consistency < 0.88) return Math.max(0, current - 1);
  if ((input.rpe ?? 7) <= 7 && completionRate >= 0.95 && consistency >= 0.94) return Math.min(3, current + 1);
  return current;
}
