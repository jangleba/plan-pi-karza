import {
  buildRunningSessionPrescription,
  isFieldMasCurrent,
  paceRangeFromMas,
  type RunningSessionMethod,
} from "@/lib/running/engine";
import { recipeTotalSeconds, type RunningRecipe, type RunIntensity } from "@/lib/running/recipe";
import type { Profile } from "../types";
import { eligibleExercise } from "./exercises";
import { trainingTier, type EngineSession } from "./model";

function validDate(value: string): boolean {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** A measured speed needs a traceable test, not a value inferred from sport/gym level. */
export function hasCurrentVerifiedMas(p: Profile, date: string): boolean {
  return (
    validDate(date) &&
    typeof p.fieldMasKmh === "number" &&
    Number.isFinite(p.fieldMasKmh) &&
    p.fieldMasKmh >= 7 &&
    p.fieldMasKmh <= 26 &&
    typeof p.fieldMasTestedAt === "string" &&
    validDate(p.fieldMasTestedAt) &&
    isFieldMasCurrent(p.fieldMasTestedAt, date) &&
    typeof p.fieldMasSourceSessionId === "string" &&
    p.fieldMasSourceSessionId.trim().length > 0
  );
}

function recordedLevel(p: Profile): number {
  const value = p.runningProgressionLevel;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
    ? p.age < 18
      ? Math.min(value, 1)
      : value
    : 0;
}

type NumericInterval = {
  sets: number;
  workSeconds: number;
  restSeconds: number;
  mas: [number, number];
  method: RunningRecipe["method"];
  zone: RunIntensity["zone"];
  rpe: [number, number];
};

/** Numeric counterparts of the existing running-engine methods; never parse its display text. */
function intervalFor(method: RunningSessionMethod, level: number, youth: boolean): NumericInterval {
  if (method === "tempo_intervals")
    return {
      sets: youth ? 3 : level >= 2 ? 4 : 3,
      workSeconds: youth ? 180 : 360,
      restSeconds: 120,
      mas: [80, 86],
      method: "tempo",
      zone: "threshold",
      rpe: [6, 7],
    };
  if (method === "short_hiit")
    return {
      sets: youth ? 4 : level >= 2 ? 8 : 6,
      workSeconds: 60,
      restSeconds: 60,
      mas: [100, 105],
      method: "short_hiit",
      zone: "hiit",
      rpe: [8, 9],
    };
  return {
    sets: youth ? 3 : 4,
    workSeconds: youth ? 120 : [180, 210, 240, 270][level],
    restSeconds: 120,
    mas: [90, 95],
    method: "aerobic_intervals",
    zone: "vo2",
    rpe: [7, 8],
  };
}

/**
 * Sport preparation and a current test decide the running route; gym experience does not.
 * The numeric defaults are inherited product recipes, not individually validated thresholds.
 */
export function buildEnduranceForDate(
  p: Profile,
  date: string,
  phase: EngineSession["phase"],
  forceLight = false,
): EngineSession | null {
  if (
    !validDate(date) ||
    !Number.isFinite(p.age) ||
    p.age < 13 ||
    p.painInjury ||
    p.seasonPhase === "return_injury"
  )
    return null;
  const verified = hasCurrentVerifiedMas(p, date);
  const sportPrepared = ["intermediate", "advanced", "elite"].includes(p.level);
  const light =
    forceLight ||
    phase === "deload" ||
    p.seasonPhase === "transition" ||
    p.goal !== "endurance" ||
    !verified ||
    !sportPrepared ||
    p.age < 16;
  const level = recordedLevel(p);
  const selection = buildRunningSessionPrescription({
    fieldMasKmh: verified ? p.fieldMasKmh : null,
    fieldMasTestedAt: verified ? p.fieldMasTestedAt : null,
    date,
    sessionIndex: phase === "development" ? 1 : phase === "peak" ? 2 : 0,
    progressionLevel: level,
    scheduleFieldMasTest: false,
    forceLight: light,
  });
  const interval =
    !light && selection.method !== "easy_aerobic" && eligibleExercise("method_interval_run", p);
  const exerciseId = interval ? "method_interval_run" : "easy_aerobic_run";
  if (!eligibleExercise(exerciseId, p)) return null;
  const easy: RunIntensity = {
    zone: "easy",
    rpe: [3, 4],
    label: "Swobodny oddech; rozmawiasz pełnymi zdaniami.",
  };
  const reasons = [
    interval
      ? "Bodźcem głównym jest wydolność: aktualny wynik testu i przygotowanie sportowe pozwalają wybrać interwały."
      : "Wybrano spokojną pracę tlenową bez dokładania mocnych interwałów.",
    verified
      ? "Tempo pochodzi z aktualnego, wskazanego testu terenowego."
      : "Brak aktualnego, wiarygodnie powiązanego testu: nie wyznaczono tempa MAS i nie dodano obowiązkowego testu.",
    "Poziom siłowni nie wyznacza przygotowania do biegania. Czasy i progi MAS są zachowanymi regułami produktu, nie indywidualnym pomiarem progu metabolicznego.",
  ];
  if (p.age < 16)
    reasons.push("Dla wczesnej młodzieży pozostawiono konserwatywny wariant tlenowy.");
  const recipe: RunningRecipe = {
    schema: "ballwise-run-recipe-v1",
    id: `v2:endurance:${interval ? selection.method : "easy"}:${date}:l${level}`,
    method: "easy_continuous",
    title: interval ? selection.title : "Spokojny bieg tlenowy",
    population: p.age < 16 ? "early_youth" : p.age < 18 ? "late_youth" : "adult",
    level: interval ? level : 0,
    paceSource: interval ? "field_mas" : "effort",
    warmup: {
      seconds: interval ? 600 : 300,
      label: "Rozgrzewka",
      instruction: interval
        ? "Zacznij od lekkiego truchtu; przejdź do pracy właściwej dopiero po spokojnym przygotowaniu."
        : "Marsz przechodzący w lekki trucht.",
      intensity: easy,
    },
    blocks: [],
    cooldown: {
      seconds: 300,
      label: "Schłodzenie",
      instruction: "Zwolnij do marszu i uspokój oddech.",
      intensity: easy,
    },
    intensity: interval ? selection.intensity : "umiarkowana",
    loadLevel: interval ? selection.loadLevel : "low",
    evidence: ["foster2001"],
    reasons,
  };
  if (interval) {
    const d = intervalFor(selection.method, level, p.age < 18);
    const intensity: RunIntensity = {
      zone: d.zone,
      rpe: d.rpe,
      masPercent: d.mas,
      pace: paceRangeFromMas(p.fieldMasKmh!, ...d.mas) ?? undefined,
      label:
        "Równo w zadanym zakresie, bez maksymalnego sprintu; zakończ odcinek przy utracie kontroli.",
    };
    recipe.method = d.method;
    recipe.blocks = [
      {
        id: "interval",
        label: "Odcinki",
        sets: 1,
        repsPerSet: d.sets,
        work: { seconds: d.workSeconds, label: `${d.workSeconds} s biegu` },
        intensity,
        recovery: { seconds: d.restSeconds, mode: "jog" },
        setRest: null,
        cue: "Pierwszy i ostatni odcinek mają być porównywalne. Zapisuj faktycznie wykonany czas.",
      },
    ];
  } else {
    const seconds = (phase === "deload" || p.age < 16 ? 15 : 20) * 60;
    recipe.blocks = [
      {
        id: "easy",
        label: "Spokojny bieg",
        sets: 1,
        repsPerSet: 1,
        work: { seconds, label: `${seconds / 60} min spokojnie` },
        intensity: easy,
        recovery: { seconds: 0, mode: "walk" },
        setRest: null,
        cue: easy.label,
      },
    ];
  }
  const block = recipe.blocks[0];
  return {
    roles: ["endurance"],
    tier: trainingTier(p),
    phase,
    highLower: interval,
    exercises: [
      {
        exerciseId,
        role: "endurance",
        dose: {
          sets: block.repsPerSet,
          seconds: block.work.seconds,
          restSeconds: block.recovery.seconds,
          intent: interval ? "controlled" : "easy",
        },
        reason: reasons[0],
      },
    ],
    missing: [],
    sprintMetres: 0,
    minutes: recipeTotalSeconds(recipe) / 60,
    runningRecipe: recipe,
  };
}
