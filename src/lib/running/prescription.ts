import type { Goal, SecondaryLimiter } from "@/lib/loadwise/types";
import { isFieldMasCurrent, paceRangeFromMas } from "./engine";
import type { RunningEvidenceId } from "./evidence";
import {
  RUN_RECIPE_SCHEMA,
  recipeIdentity,
  recipeTotalSeconds,
  type RunEffortZone,
  type RunIntensity,
  type RunPhaseStep,
  type RunPopulation,
  type RunRecipeBlock,
  type RunningMethod,
  type RunningRecipe,
} from "./recipe";

/**
 * Dobór i dawkowanie biegu. Metoda wynika z sytuacji zawodnika (cel, wiek,
 * poziom, wynik testu, poziom progresji z wykonania, dostępny czas oraz
 * obciążenia klubu, meczu, siłowni i sprintu wokół dnia), a nie z numeru sesji.
 */

export type RunningPhase = "in_season" | "base" | "preseason" | "transition";

export interface RunningDayLoad {
  /** Dzień treningu klubowego (bieg jest wtedy sesją dodatkową). */
  club: boolean;
  match: boolean;
  /** Siłownia tego dnia z ciężką pracą nóg. */
  heavyLegs: boolean;
  /** Prawdziwy bodziec szybkości (sprint maksymalny/przyspieszenia). */
  sprint: boolean;
  /** Mocny bieg (interwały, RSA, test). */
  hardRun: boolean;
}

export interface RunningPlanContext {
  date: string;
  age: number | null | undefined;
  level: "beginner" | "intermediate" | "advanced" | "elite";
  goal: Goal;
  limiter?: SecondaryLimiter | null;
  fieldMasKmh?: number | null;
  fieldMasTestedAt?: string | null;
  progressionLevel?: number | null;
  phase: RunningPhase;
  /** Minuty przewidziane na tę sesję (dostępność / limit dnia). */
  availableMin: number;
  mdLabel?: string | null;
  sameDay: RunningDayLoad;
  previousDay: RunningDayLoad;
  nextDay: RunningDayLoad;
  week: {
    hardRuns: number;
    methods: RunningMethod[];
    lastMethod: RunningMethod | null;
    matches: number;
    clubSessions: number;
  };
  /** Zawodnik może łączyć mocną pracę z klubem (wiek, poziom, brak bólu). */
  doubleHeavyAllowed: boolean;
  /** Bieg dzieli dzień z inną własną sesją lub z klubem (druga sesja dnia). */
  sharesDay?: boolean;
  /** Wymuszenie lekkiej wersji (np. ból, ograniczenie, niska gotowość z planu). */
  forceEasy?: boolean;
}

export const EMPTY_DAY_LOAD: RunningDayLoad = {
  club: false,
  match: false,
  heavyLegs: false,
  sprint: false,
  hardRun: false,
};

export function runPopulationOf(age: number | null | undefined): RunPopulation {
  // Brak wieku → wariant młodzieżowy, tak jak w pozostałych silnikach.
  if (age == null || Number.isNaN(age)) return "early_youth";
  if (age <= 12) return "child";
  if (age <= 15) return "early_youth";
  if (age <= 17) return "late_youth";
  return "adult";
}

function clampLevel(value: number | null | undefined): number {
  return Math.min(3, Math.max(0, Math.round(value ?? 0)));
}

function regularOf(ctx: Pick<RunningPlanContext, "level">): boolean {
  return ctx.level !== "beginner";
}

// ---------------------------------------------------------------------------
// Intensywność: odczucie zawsze, tempo wyłącznie z aktualnego testu
// ---------------------------------------------------------------------------

const ZONE: Record<RunEffortZone, { rpe: [number, number]; mas: [number, number]; label: string }> =
  {
    easy: {
      rpe: [3, 4],
      mas: [60, 70],
      label: "Spokojnie — rozmawiasz pełnymi zdaniami (RPE 3–4/10)",
    },
    threshold: {
      rpe: [6, 7],
      mas: [80, 86],
      label: "Mocno, ale równo — mówisz krótkie zdania (RPE 6–7/10)",
    },
    vo2: {
      rpe: [8, 8],
      mas: [90, 95],
      label: "Bardzo mocno i równo — tylko pojedyncze słowa (RPE 8/10)",
    },
    hiit: {
      rpe: [8, 9],
      mas: [105, 115],
      label: "Mocno i równo, bez sprintu na maksa (RPE 8–9/10)",
    },
    repeat_sprint: {
      rpe: [9, 10],
      mas: [0, 0],
      label: "Sprint z pełnym zaangażowaniem, każdy tak samo szybki",
    },
    test: {
      rpe: [9, 10],
      mas: [0, 0],
      label: "Najszybsze równe tempo, które utrzymasz przez 5 minut",
    },
  };

function hasCurrentMas(ctx: Pick<RunningPlanContext, "fieldMasKmh" | "fieldMasTestedAt" | "date">) {
  return (
    typeof ctx.fieldMasKmh === "number" &&
    Number.isFinite(ctx.fieldMasKmh) &&
    isFieldMasCurrent(ctx.fieldMasTestedAt, ctx.date)
  );
}

function intensityFor(
  zone: RunEffortZone,
  ctx: Pick<RunningPlanContext, "fieldMasKmh" | "fieldMasTestedAt" | "date">,
  workSeconds?: number,
): RunIntensity {
  const def = ZONE[zone];
  const base: RunIntensity = { zone, rpe: def.rpe, label: def.label };
  if (!hasCurrentMas(ctx) || def.mas[1] === 0) return base;
  const masPercent = def.mas;
  // Tempo min/km pokazujemy tylko dla odcinków, które GPS mierzy wiarygodnie.
  const pace =
    workSeconds == null || workSeconds >= 60
      ? (paceRangeFromMas(ctx.fieldMasKmh!, masPercent[0], masPercent[1]) ?? undefined)
      : undefined;
  return { ...base, masPercent, ...(pace ? { pace } : {}) };
}

// ---------------------------------------------------------------------------
// Dawki — jedna zmienna progresji na poziom (czas, liczba odcinków lub serii)
// ---------------------------------------------------------------------------

interface ContinuousDose {
  minutes: number;
  step: number;
  cap: number;
}

function easyDose(population: RunPopulation, regular: boolean): ContinuousDose {
  if (population === "child") return { minutes: 10, step: 2, cap: 16 };
  if (population === "early_youth") return { minutes: regular ? 20 : 15, step: 5, cap: 30 };
  if (population === "late_youth") return { minutes: regular ? 25 : 20, step: 5, cap: 35 };
  return { minutes: regular ? 30 : 20, step: 5, cap: 45 };
}

function longDose(population: RunPopulation): ContinuousDose {
  return population === "adult"
    ? { minutes: 45, step: 5, cap: 60 }
    : { minutes: 35, step: 5, cap: 45 };
}

type IntervalTable = Array<{ sets: number; reps: number; workSec: number }>;

function tempoTable(population: RunPopulation, regular: boolean): IntervalTable {
  if (population === "early_youth")
    return [
      { sets: 1, reps: 2, workSec: 300 },
      { sets: 1, reps: 3, workSec: 300 },
      { sets: 1, reps: 3, workSec: 360 },
      { sets: 1, reps: 3, workSec: 360 },
    ];
  if (population === "late_youth" || !regular)
    return [
      { sets: 1, reps: 2, workSec: 360 },
      { sets: 1, reps: 3, workSec: 360 },
      { sets: 1, reps: 3, workSec: 420 },
      { sets: 1, reps: 3, workSec: 480 },
    ];
  return [
    { sets: 1, reps: 3, workSec: 360 },
    { sets: 1, reps: 4, workSec: 360 },
    { sets: 1, reps: 4, workSec: 420 },
    { sets: 1, reps: 4, workSec: 480 },
  ];
}

function aerobicIntervalTable(population: RunPopulation, regular: boolean): IntervalTable {
  if (!regular)
    return [
      { sets: 1, reps: 3, workSec: 120 },
      { sets: 1, reps: 3, workSec: 180 },
      { sets: 1, reps: 4, workSec: 180 },
      { sets: 1, reps: 4, workSec: 210 },
    ];
  if (population === "early_youth")
    return [
      { sets: 1, reps: 3, workSec: 180 },
      { sets: 1, reps: 4, workSec: 180 },
      { sets: 1, reps: 4, workSec: 210 },
      { sets: 1, reps: 4, workSec: 240 },
    ];
  return [
    { sets: 1, reps: 4, workSec: 180 },
    { sets: 1, reps: 4, workSec: 210 },
    { sets: 1, reps: 4, workSec: 240 },
    population === "adult"
      ? { sets: 1, reps: 5, workSec: 240 }
      : { sets: 1, reps: 4, workSec: 240 },
  ];
}

function shortHiitTable(population: RunPopulation, regular: boolean): IntervalTable {
  if (population === "child")
    return [
      { sets: 1, reps: 6, workSec: 15 },
      { sets: 1, reps: 7, workSec: 15 },
      { sets: 1, reps: 8, workSec: 15 },
      { sets: 2, reps: 6, workSec: 15 },
    ];
  if (population === "early_youth" || !regular)
    return [
      { sets: 2, reps: 6, workSec: 15 },
      { sets: 2, reps: 8, workSec: 15 },
      { sets: 2, reps: 10, workSec: 15 },
      { sets: 3, reps: 8, workSec: 15 },
    ];
  if (population === "late_youth")
    return [
      { sets: 2, reps: 8, workSec: 15 },
      { sets: 2, reps: 10, workSec: 15 },
      { sets: 2, reps: 12, workSec: 15 },
      { sets: 3, reps: 10, workSec: 15 },
    ];
  return [
    { sets: 2, reps: 10, workSec: 15 },
    { sets: 2, reps: 12, workSec: 15 },
    { sets: 2, reps: 14, workSec: 15 },
    { sets: 3, reps: 12, workSec: 15 },
  ];
}

function rsaTable(
  population: RunPopulation,
): Array<{ sets: number; reps: number; cycleSec: number }> {
  if (population === "early_youth")
    return [
      { sets: 2, reps: 5, cycleSec: 30 },
      { sets: 2, reps: 6, cycleSec: 30 },
      { sets: 3, reps: 5, cycleSec: 30 },
      { sets: 3, reps: 6, cycleSec: 30 },
    ];
  return [
    { sets: 2, reps: 6, cycleSec: 25 },
    { sets: 3, reps: 5, cycleSec: 25 },
    { sets: 3, reps: 6, cycleSec: 25 },
    { sets: 3, reps: 6, cycleSec: 20 },
  ];
}

const RSA_SPRINT_M = 20;
const RSA_SPRINT_SEC = 5;

// ---------------------------------------------------------------------------
// Rozgrzewka i schłodzenie — część receptury, prowadzone przez licznik
// ---------------------------------------------------------------------------

function phase(
  seconds: number,
  label: string,
  instruction: string,
  ctx: Pick<RunningPlanContext, "fieldMasKmh" | "fieldMasTestedAt" | "date">,
): RunPhaseStep {
  return { seconds, label, instruction, intensity: intensityFor("easy", ctx) };
}

function warmupFor(method: RunningMethod, ctx: RunningPlanContext): RunPhaseStep {
  if (method === "easy_continuous" || method === "long_continuous")
    return phase(
      runPopulationOf(ctx.age) === "child" ? 180 : 300,
      "Rozgrzewka",
      "Zacznij od marszu, potem przejdź w bardzo lekki trucht.",
      ctx,
    );
  if (method === "tempo")
    return phase(600, "Rozgrzewka", "Lekki trucht. W ostatniej minucie 2 krótkie przebieżki.", ctx);
  if (method === "rsa")
    return phase(
      720,
      "Rozgrzewka",
      "Trucht, potem skipy i 3 przebieżki narastające do szybkiego biegu.",
      ctx,
    );
  if (method === "field_mas_test")
    return phase(720, "Rozgrzewka", "Trucht, potem 3 przebieżki. Ostatnia minuta spokojnie.", ctx);
  return phase(
    600,
    "Rozgrzewka",
    "Lekki trucht. W ostatnich 2 minutach 3 przebieżki po 15 s.",
    ctx,
  );
}

function cooldownFor(method: RunningMethod, ctx: RunningPlanContext): RunPhaseStep {
  const easy = method === "easy_continuous" || method === "long_continuous";
  return phase(
    easy ? 180 : 360,
    "Schłodzenie",
    easy ? "Zwolnij do marszu i wyrównaj oddech." : "Bardzo lekki trucht, na końcu marsz.",
    ctx,
  );
}

// ---------------------------------------------------------------------------
// Budowa receptury
// ---------------------------------------------------------------------------

const TITLES: Record<RunningMethod, string> = {
  easy_continuous: "Spokojny bieg ciągły",
  long_continuous: "Dłuższy bieg ciągły",
  tempo: "Bieg tempowy",
  aerobic_intervals: "Długie interwały tlenowe",
  short_hiit: "Krótkie interwały 15/15",
  rsa: "Powtarzane sprinty (RSA)",
  field_mas_test: "Test biegowy 5 min",
};

const EVIDENCE: Record<RunningMethod, RunningEvidenceId[]> = {
  easy_continuous: ["seiler2010", "stoggl2014", "foster2001"],
  long_continuous: ["seiler2010", "faude2013"],
  tempo: ["seiler2010", "foster2001", "buchheit2013a"],
  aerobic_intervals: ["helgerud2001", "mcmillan2005", "buchheit2013a"],
  short_hiit: ["dupont2004", "buchheit2013a", "engel2018"],
  rsa: ["buchheit2010rsa", "bishop2011", "taylor2015"],
  field_mas_test: ["berthon1997"],
};

function loadOf(method: RunningMethod): Pick<RunningRecipe, "intensity" | "loadLevel"> {
  if (method === "easy_continuous") return { intensity: "niska", loadLevel: "low" };
  // Dłuższy bieg ma niską intensywność (RPE 3–4), ale większą objętość.
  if (method === "long_continuous") return { intensity: "niska", loadLevel: "moderate" };
  if (method === "tempo") return { intensity: "umiarkowana", loadLevel: "moderate" };
  return { intensity: "wysoka", loadLevel: "high" };
}

function continuousBlock(
  minutes: number,
  zone: RunEffortZone,
  ctx: RunningPlanContext,
  label: string,
  cue: string,
): RunRecipeBlock {
  const seconds = Math.round(minutes * 60);
  return {
    id: "main",
    label,
    sets: 1,
    repsPerSet: 1,
    work: { seconds, label: `${Math.round(minutes)} min` },
    intensity: intensityFor(zone, ctx, seconds),
    recovery: { seconds: 0, mode: "jog" },
    setRest: null,
    cue,
  };
}

function finish(
  method: RunningMethod,
  ctx: RunningPlanContext,
  level: number,
  blocks: RunRecipeBlock[],
  reasons: string[],
): RunningRecipe {
  const draft: Omit<RunningRecipe, "id"> = {
    schema: RUN_RECIPE_SCHEMA,
    method,
    title: TITLES[method],
    population: runPopulationOf(ctx.age),
    level,
    paceSource: blocks.some((b) => b.intensity.masPercent) ? "field_mas" : "effort",
    warmup: warmupFor(method, ctx),
    blocks,
    cooldown: cooldownFor(method, ctx),
    ...loadOf(method),
    evidence: EVIDENCE[method],
    reasons,
  };
  return { ...draft, id: recipeIdentity(draft) };
}

export function buildRunningRecipe(
  method: RunningMethod,
  ctx: RunningPlanContext,
  reasons: string[] = [],
): RunningRecipe {
  const population = runPopulationOf(ctx.age);
  const regular = regularOf(ctx);
  const level = clampLevel(ctx.progressionLevel);

  if (method === "field_mas_test") {
    return finish(
      method,
      ctx,
      level,
      [
        {
          id: "test",
          label: "Test 5 min",
          sets: 1,
          repsPerSet: 1,
          work: { seconds: 300, label: "5 min" },
          intensity: intensityFor("test", ctx),
          recovery: { seconds: 0, mode: "walk" },
          setRest: null,
          cue: "Zacznij kontrolowanie i biegnij możliwie równo przez pełne 5 minut.",
        },
      ],
      reasons,
    );
  }

  if (method === "easy_continuous" || method === "long_continuous") {
    const dose =
      method === "easy_continuous" ? easyDose(population, regular) : longDose(population);
    const minutes = Math.min(dose.cap, dose.minutes + dose.step * level);
    return finish(
      method,
      ctx,
      level,
      [
        continuousBlock(
          minutes,
          "easy",
          ctx,
          method === "easy_continuous" ? "Bieg ciągły" : "Dłuższy bieg ciągły",
          population === "child"
            ? "Możesz przeplatać bieg marszem. Ma być swobodnie."
            : "Równe, swobodne tempo przez cały czas.",
        ),
      ],
      reasons,
    );
  }

  if (method === "rsa") {
    const row = rsaTable(population)[level];
    return finish(
      method,
      ctx,
      level,
      [
        {
          id: "rsa",
          label: "Sprinty",
          sets: row.sets,
          repsPerSet: row.reps,
          work: { seconds: RSA_SPRINT_SEC, distanceM: RSA_SPRINT_M, label: `${RSA_SPRINT_M} m` },
          intensity: intensityFor("repeat_sprint", ctx),
          recovery: { seconds: row.cycleSec - RSA_SPRINT_SEC, mode: "walk" },
          setRest: { seconds: 240, mode: "walk" },
          cue: `Sprint ${RSA_SPRINT_M} m, spokojny powrót marszem. Start co ${row.cycleSec} s.`,
        },
      ],
      reasons,
    );
  }

  const table =
    method === "tempo"
      ? tempoTable(population, regular)
      : method === "aerobic_intervals"
        ? aerobicIntervalTable(population, regular)
        : shortHiitTable(population, regular);
  const row = table[level];
  const zone: RunEffortZone =
    method === "tempo" ? "threshold" : method === "aerobic_intervals" ? "vo2" : "hiit";
  const intensity = intensityFor(zone, ctx, row.workSec);
  const block: RunRecipeBlock = {
    id: method,
    label: method === "tempo" ? "Odcinki tempowe" : "Odcinki",
    sets: row.sets,
    repsPerSet: row.reps,
    work: { seconds: row.workSec, label: formatWork(row.workSec) },
    intensity,
    recovery:
      method === "tempo"
        ? { seconds: 120, mode: "jog" }
        : method === "aerobic_intervals"
          ? { seconds: 180, mode: "jog" }
          : {
              seconds: 15,
              mode: population === "child" || population === "early_youth" ? "walk" : "passive",
            },
    setRest: row.sets > 1 ? { seconds: 180, mode: "walk" } : null,
    cue:
      method === "tempo"
        ? "Wszystkie odcinki w tym samym tempie. Zostaw zapas."
        : method === "aerobic_intervals"
          ? "Nie ścigaj pierwszego odcinka. Ostatni ma być równie mocny."
          : "Każde 15 s równo mocno. To nie jest sprint maksymalny.",
  };
  if (method === "short_hiit" && intensity.masPercent && ctx.fieldMasKmh) {
    const metersPerSec = ctx.fieldMasKmh / 3.6;
    block.workDistanceHintM = [
      Math.round((metersPerSec * intensity.masPercent[0] * row.workSec) / 100 / 5) * 5,
      Math.round((metersPerSec * intensity.masPercent[1] * row.workSec) / 100 / 5) * 5,
    ];
  }
  return finish(method, ctx, level, [block], reasons);
}

function formatWork(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}:${String(rest).padStart(2, "0")} min` : `${minutes} min`;
}

// ---------------------------------------------------------------------------
// Dopasowanie do dostępnego czasu — zmniejszamy objętość, nigdy nie
// podnosimy intensywności ani nie skracamy przerw.
// ---------------------------------------------------------------------------

const MIN_CONTINUOUS_SEC: Record<RunPopulation, number> = {
  child: 6 * 60,
  early_youth: 10 * 60,
  late_youth: 12 * 60,
  adult: 12 * 60,
};

function withId(recipe: RunningRecipe): RunningRecipe {
  const { id: _id, ...rest } = recipe;
  return { ...rest, id: recipeIdentity(rest) };
}

/** Zwraca recepturę mieszczącą się w `minutes` albo null, gdy metoda się nie zmieści. */
export function fitRecipeToMinutes(recipe: RunningRecipe, minutes: number): RunningRecipe | null {
  const limit = Math.max(0, minutes) * 60;
  if (recipeTotalSeconds(recipe) <= limit) return recipe;
  let next: RunningRecipe = {
    ...recipe,
    blocks: recipe.blocks.map((b) => ({ ...b, work: { ...b.work } })),
  };
  // Krótsza rozgrzewka przed lekkim biegiem, ale co najmniej 3 min marszu/truchtu.
  const easy = next.method === "easy_continuous" || next.method === "long_continuous";
  const minWarmup = easy ? 180 : 480;
  if (next.warmup.seconds > minWarmup)
    next = {
      ...next,
      warmup: {
        ...next.warmup,
        seconds: Math.max(minWarmup, next.warmup.seconds - (recipeTotalSeconds(next) - limit)),
      },
    };
  const block = next.blocks[0];
  for (let guard = 0; guard < 60 && recipeTotalSeconds(next) > limit; guard++) {
    if (block.sets === 1 && block.repsPerSet === 1) {
      const over = recipeTotalSeconds(next) - limit;
      // Dłuższy bieg skrócony poniżej 30 min nie jest już dłuższym biegiem.
      const floor =
        recipe.method === "long_continuous" ? 30 * 60 : MIN_CONTINUOUS_SEC[recipe.population];
      const seconds = Math.max(floor, Math.floor((block.work.seconds - over) / 60) * 60);
      if (seconds === block.work.seconds) break;
      block.work = { ...block.work, seconds, label: `${Math.round(seconds / 60)} min` };
      continue;
    }
    const minReps = next.method === "short_hiit" ? 4 : next.method === "rsa" ? 4 : 2;
    if (block.sets > 1 && block.repsPerSet <= minReps) {
      block.sets -= 1;
      if (block.sets === 1) block.setRest = null;
    } else if (block.repsPerSet > minReps) block.repsPerSet -= 1;
    else if (block.sets > 1) block.sets -= 1;
    else break;
  }
  if (recipeTotalSeconds(next) > limit) return null;
  next = { ...next, reducedFrom: recipe.reducedFrom ?? recipeTotalSeconds(recipe) };
  return withId(next);
}

/** „Mam mniej czasu”: ta sama metoda i intensywność, mniejsza objętość. */
export function scaleRunningRecipe(recipe: RunningRecipe, factor: number): RunningRecipe {
  if (factor >= 1) return recipe;
  const minutes = Math.ceil((recipeTotalSeconds(recipe) * factor) / 60);
  return (
    fitRecipeToMinutes(recipe, minutes) ??
    fitRecipeToMinutes(recipe, Math.ceil(recipeTotalSeconds(recipe) / 60) - 1) ??
    recipe
  );
}

// ---------------------------------------------------------------------------
// Wybór metody — potrzeby tygodnia zamiast sztywnej rotacji
// ---------------------------------------------------------------------------

export type RunningTier = "easy" | "moderate" | "hard";

export function maxHardRunsPerWeek(ctx: RunningPlanContext): number {
  const population = runPopulationOf(ctx.age);
  if (ctx.phase === "transition") return 0;
  if (population === "child") return 1;
  if (ctx.phase === "in_season") return ctx.week.matches > 0 ? 1 : 2;
  if (!regularOf(ctx) || population === "early_youth") return 1;
  return 2;
}

/** Najwyższa dopuszczalna intensywność biegu tego dnia, z powodami. */
export function runningTierFor(ctx: RunningPlanContext): { tier: RunningTier; reasons: string[] } {
  const easy: string[] = [];
  if (ctx.forceEasy) easy.push("lekka wersja wymagana przez plan");
  if (ctx.mdLabel === "MD-1" || ctx.nextDay.match) easy.push("jutro mecz");
  if (ctx.mdLabel === "MD+1" || ctx.previousDay.match) easy.push("dzień po meczu");
  if (ctx.sameDay.match) easy.push("dzień meczowy");
  if (ctx.sameDay.heavyLegs && !ctx.doubleHeavyAllowed)
    easy.push("tego dnia siłownia z ciężką pracą nóg");
  if (ctx.phase === "transition") easy.push("roztrenowanie po sezonie");
  // Dodatkowa sesja w dzień klubu to zawsze lekki bieg: klub już daje bodziec.
  if (ctx.sameDay.club) easy.push("druga sesja w dzień klubu");
  if (ctx.sharesDay && !ctx.doubleHeavyAllowed) easy.push("druga sesja dnia");
  if (ctx.week.hardRuns >= maxHardRunsPerWeek(ctx))
    easy.push("limit mocnych biegów w tym tygodniu wykorzystany");
  if (easy.length) return { tier: "easy", reasons: easy };

  const moderate: string[] = [];
  if (ctx.mdLabel === "MD-2") moderate.push("dwa dni do meczu");
  if (ctx.sameDay.sprint) moderate.push("tego dnia sprint");
  if (ctx.sameDay.heavyLegs) moderate.push("tego dnia siłownia nóg (bieg jako druga sesja)");
  if (ctx.previousDay.hardRun || ctx.previousDay.heavyLegs || ctx.previousDay.sprint)
    moderate.push("wczoraj mocny bodziec");
  if (ctx.nextDay.sprint || ctx.nextDay.heavyLegs) moderate.push("jutro sprint lub siła nóg");
  if (moderate.length) return { tier: "moderate", reasons: moderate };
  return { tier: "hard", reasons: ["brak kolizji z klubem, meczem, siłą i sprintem"] };
}

function methodAllowed(method: RunningMethod, ctx: RunningPlanContext): boolean {
  const population = runPopulationOf(ctx.age);
  const regular = regularOf(ctx);
  switch (method) {
    case "easy_continuous":
      return true;
    case "long_continuous":
      return (
        regular &&
        (population === "adult" || population === "late_youth") &&
        !ctx.sameDay.club &&
        !ctx.sameDay.heavyLegs &&
        !ctx.sharesDay &&
        ctx.availableMin >= 50 &&
        !["MD-2", "MD-1", "MD+1", "MD+2"].includes(ctx.mdLabel ?? "") &&
        (ctx.phase === "base" || ctx.phase === "preseason" || ctx.goal === "endurance")
      );
    case "tempo":
      return population !== "child" && (regular || population === "adult");
    case "aerobic_intervals":
      return population !== "child";
    case "short_hiit":
      return true;
    case "rsa":
      return (
        regular &&
        population !== "child" &&
        !ctx.sameDay.sprint &&
        !ctx.previousDay.sprint &&
        !ctx.nextDay.sprint &&
        ctx.phase !== "base" &&
        !ctx.week.methods.includes("rsa")
      );
    case "field_mas_test":
      return false;
  }
}

function score(method: RunningMethod, ctx: RunningPlanContext): number {
  let value = { aerobic_intervals: 3, short_hiit: 3, rsa: 2, tempo: 2 }[
    method as "aerobic_intervals" | "short_hiit" | "rsa" | "tempo"
  ];
  if (value == null) return -Infinity;
  const goal = ctx.goal;
  const limiter = ctx.limiter;
  if (goal === "endurance" || limiter === "endurance") {
    if (method === "aerobic_intervals") value += 2;
    if (method === "tempo") value += 1;
  }
  if (goal === "speed" || goal === "agility" || goal === "matchready" || limiter === "speed") {
    if (method === "rsa") value += 2;
    if (method === "short_hiit") value += 1;
  }
  if (goal === "general" && method === "short_hiit") value += 1;
  if (ctx.phase === "in_season" && method === "short_hiit") value += 2;
  if (ctx.phase === "base") {
    if (method === "aerobic_intervals") value += 2;
    if (method === "tempo") value += 1;
  }
  if (ctx.phase === "preseason") {
    if (method === "aerobic_intervals" || method === "rsa") value += 1;
  }
  const used = ctx.week.methods.filter((m) => m === method).length;
  value -= used * 3;
  if (ctx.week.lastMethod === method) value -= 2;
  return value;
}

const HARD_ORDER: RunningMethod[] = ["aerobic_intervals", "short_hiit", "rsa", "tempo"];

export interface RunningSelection {
  method: RunningMethod;
  tier: RunningTier;
  reasons: string[];
  recipe: RunningRecipe;
}

/** Wybiera metodę i dawkę mieszczącą się w dostępnym czasie. */
export function selectRunningRecipe(ctx: RunningPlanContext): RunningSelection {
  const { tier, reasons } = runningTierFor(ctx);
  const candidates: RunningMethod[] = [];
  if (tier === "hard")
    candidates.push(
      ...HARD_ORDER.filter((m) => methodAllowed(m, ctx)).sort(
        (a, b) => score(b, ctx) - score(a, ctx),
      ),
    );
  if (tier !== "easy" && methodAllowed("tempo", ctx) && !candidates.includes("tempo"))
    candidates.push("tempo");
  const easyFirst =
    tier === "easy" || ctx.week.methods.includes("tempo") || ctx.week.lastMethod === "tempo";
  if (methodAllowed("long_continuous", ctx) && !ctx.week.methods.includes("long_continuous")) {
    // Dłuższy bieg tylko wtedy, gdy jest na niego czas i nie ma mocniejszej potrzeby.
    if (easyFirst || tier === "moderate")
      candidates.splice(tier === "easy" ? 0 : 1, 0, "long_continuous");
    else candidates.push("long_continuous");
  }
  if (tier === "moderate" && easyFirst) {
    const index = candidates.indexOf("tempo");
    if (index >= 0) candidates.push(...candidates.splice(index, 1));
  }
  candidates.push("easy_continuous");

  for (const method of candidates) {
    const full = buildRunningRecipe(method, ctx, [
      `poziom: ${tier}`,
      ...reasons,
      `cel: ${ctx.goal}`,
      `okres: ${ctx.phase}`,
    ]);
    const fitted = fitRecipeToMinutes(full, ctx.availableMin);
    if (fitted) return { method, tier, reasons, recipe: fitted };
  }
  // Nawet najkrótszy bieg się nie mieści — zostaje najkrótszy spokojny bieg.
  const fallback = buildRunningRecipe("easy_continuous", ctx, [...reasons, "minimum czasu"]);
  for (let minutes = Math.max(1, Math.ceil(ctx.availableMin)); minutes <= 120; minutes++) {
    const fitted = fitRecipeToMinutes(fallback, minutes);
    if (fitted) return { method: "easy_continuous", tier: "easy", reasons, recipe: fitted };
  }
  return { method: "easy_continuous", tier: "easy", reasons, recipe: fallback };
}
