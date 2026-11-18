import type { RunningEvidenceId } from "./evidence";
import type { PaceRange } from "./engine";

/**
 * Jedna ustrukturyzowana receptura biegu. Z niej powstają: opis sesji,
 * kroki licznika (rozgrzewka → serie/odcinki/przerwy → schłodzenie) i
 * identyfikatory kroków zapisywanych w wynikach. Tekst nigdy nie jest
 * parsowany z powrotem na liczby.
 */
export const RUN_RECIPE_SCHEMA = "ballwise-run-recipe-v1" as const;

export type RunningMethod =
  | "easy_continuous"
  | "long_continuous"
  | "tempo"
  | "aerobic_intervals"
  | "short_hiit"
  | "rsa"
  | "field_mas_test";

export type RunPopulation = "child" | "early_youth" | "late_youth" | "adult";

export type RunEffortZone = "easy" | "threshold" | "vo2" | "hiit" | "repeat_sprint" | "test";

export interface RunIntensity {
  zone: RunEffortZone;
  /** Skala CR-10 (Foster 2001). */
  rpe: [number, number];
  /** Procent terenowego MAS — tylko gdy istnieje aktualny wynik testu. */
  masPercent?: [number, number];
  /** Zakres tempa — wyłącznie z aktualnego testu, nigdy zgadywany. */
  pace?: PaceRange;
  /** Krótki opis odczucia: zawsze dostępny, także bez testu. */
  label: string;
}

export interface RunRecipeBlock {
  id: string;
  label: string;
  sets: number;
  repsPerSet: number;
  work: {
    seconds: number;
    /** Odcinek na dystans (np. sprint 20 m w RSA); licznik prowadzi wtedy cyklem czasowym. */
    distanceM?: number;
    label: string;
  };
  intensity: RunIntensity;
  recovery: { seconds: number; mode: "jog" | "walk" | "passive" };
  setRest: { seconds: number; mode: "jog" | "walk" | "passive" } | null;
  /** Orientacyjny dystans krótkiego odcinka przy aktualnym MAS. */
  workDistanceHintM?: [number, number];
  cue: string;
}

export interface RunPhaseStep {
  seconds: number;
  label: string;
  instruction: string;
  intensity: RunIntensity;
}

export interface RunningRecipe {
  schema: typeof RUN_RECIPE_SCHEMA;
  id: string;
  method: RunningMethod;
  title: string;
  population: RunPopulation;
  /** Poziom progresji 0–3 użyty do dawki (z rzeczywistego wykonania). */
  level: number;
  paceSource: "field_mas" | "effort";
  warmup: RunPhaseStep;
  blocks: RunRecipeBlock[];
  cooldown: RunPhaseStep;
  intensity: "niska" | "umiarkowana" | "wysoka";
  loadLevel: "low" | "moderate" | "high";
  evidence: RunningEvidenceId[];
  /** Dlaczego wybrano metodę — do diagnostyki i raportów, nie na ekran sesji. */
  reasons: string[];
  /** Zmniejszona dawka (mniej czasu) — progresja nie rośnie z takiej sesji. */
  reducedFrom?: number;
}

function recipeMainSeconds(recipe: Pick<RunningRecipe, "blocks">): number {
  return recipe.blocks.reduce((sum, block) => {
    const reps = block.sets * block.repsPerSet;
    const recoveries = block.sets * Math.max(0, block.repsPerSet - 1);
    const setRests = block.setRest ? Math.max(0, block.sets - 1) : 0;
    return (
      sum +
      reps * block.work.seconds +
      recoveries * block.recovery.seconds +
      setRests * (block.setRest?.seconds ?? 0)
    );
  }, 0);
}

export function recipeTotalSeconds(
  recipe: Pick<RunningRecipe, "blocks" | "warmup" | "cooldown">,
): number {
  return recipe.warmup.seconds + recipeMainSeconds(recipe) + recipe.cooldown.seconds;
}

export function isRunningRecipe(value: unknown): value is RunningRecipe {
  if (!value || typeof value !== "object") return false;
  const recipe = value as Partial<RunningRecipe>;
  return (
    recipe.schema === RUN_RECIPE_SCHEMA &&
    typeof recipe.method === "string" &&
    Array.isArray(recipe.blocks) &&
    recipe.blocks.length > 0 &&
    recipe.blocks.every(
      (block) =>
        Number.isInteger(block.sets) &&
        block.sets >= 1 &&
        Number.isInteger(block.repsPerSet) &&
        block.repsPerSet >= 1 &&
        Number.isFinite(block.work?.seconds) &&
        block.work.seconds > 0 &&
        Number.isFinite(block.recovery?.seconds) &&
        block.recovery.seconds >= 0,
    ) &&
    Number.isFinite(recipe.warmup?.seconds) &&
    Number.isFinite(recipe.cooldown?.seconds)
  );
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes}:${String(rest).padStart(2, "0")} min`;
}
