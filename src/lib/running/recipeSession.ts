import type { ExerciseItem, SessionDay } from "@/lib/loadwise/types";
import { runningCooldown, runningPreparation } from "@/lib/loadwise/recoveryContent";
import {
  formatClock,
  isRunningRecipe,
  recipeTotalSeconds,
  type RunIntensity,
  type RunRecipeBlock,
  type RunningMethod,
  type RunningRecipe,
} from "./recipe";
import type { RunningIntervalProtocol, RunningIntervalStep, RunningIntervalTarget } from "./types";

/**
 * Receptura → opis, kroki licznika i sesja planu. To jedyne miejsce, które
 * zamienia liczby receptury na tekst; licznik i zapis korzystają z tych
 * samych liczb, więc opis, prowadzenie i wynik nie mogą się rozjechać.
 */

const EXERCISE_ID: Record<RunningMethod, string> = {
  easy_continuous: "easy_aerobic_run",
  long_continuous: "easy_aerobic_run",
  tempo: "tempo_conditioning_block",
  aerobic_intervals: "method_interval_run",
  short_hiit: "method_interval_run",
  rsa: "method_repeated_sprint",
  field_mas_test: "field_mas_5_min_test",
};

const SESSION_TYPE: Record<RunningMethod, string> = {
  easy_continuous: "Wytrzymałość — spokojny bieg ciągły",
  long_continuous: "Wytrzymałość — dłuższy bieg ciągły",
  tempo: "Wytrzymałość — bieg tempowy",
  aerobic_intervals: "Wytrzymałość — interwały tlenowe",
  short_hiit: "Wytrzymałość — krótkie interwały",
  rsa: "Wytrzymałość — powtarzane sprinty (RSA)",
  field_mas_test: "Wydolność — test terenowego MAS",
};

const GOAL: Record<RunningMethod, string> = {
  easy_continuous: "Spokojna praca tlenowa w równym tempie.",
  long_continuous: "Dłuższa praca tlenowa w spokojnym tempie.",
  tempo: "Dłuższe odcinki w mocnym, kontrolowanym tempie.",
  aerobic_intervals: "Mocne odcinki tlenowe z truchtem pomiędzy.",
  short_hiit: "Krótkie mocne odcinki z krótką przerwą, w seriach.",
  rsa: "Powtarzane krótkie zrywy z niepełnym odpoczynkiem.",
  field_mas_test: "Pomiar Twojego tempa do kolejnych biegów. Test jest dobrowolny.",
};

const TECHNIQUE: Record<RunningMethod, string> = {
  easy_continuous:
    "Wybierz płaską trasę lub pętlę. Biegnij swobodnie, krótkim krokiem, z rozluźnionymi barkami.",
  long_continuous:
    "Wybierz płaską trasę lub pętlę. Utrzymuj równe, swobodne tempo; jeśli zaczynasz łapać zadyszkę, zwolnij.",
  tempo:
    "Płaska trasa bez ostrych nawrotów. Każdy odcinek zacznij spokojnie i dojdź do równego, mocnego tempa.",
  aerobic_intervals:
    "Płaska trasa bez ostrych nawrotów. Licznik prowadzi odcinki i przerwy; w przerwie truchtaj, nie stój.",
  short_hiit:
    "Wyznacz prostą lub pętlę. Na sygnał biegnij mocno 15 s, potem 15 s przerwy. Licznik prowadzi serie.",
  rsa: "Odmierz 20 m i miejsce na wyhamowanie. Sprint na sygnał, wyhamuj spokojnie, wróć marszem na start.",
  field_mas_test:
    "Płaska, otwarta trasa z dobrym sygnałem GPS. Po rozgrzewce biegnij równo przez pełne 5 minut.",
};

const MODE: Record<RunRecipeBlock["recovery"]["mode"], string> = {
  jog: "truchtu",
  walk: "marszu",
  passive: "stania",
};

function intensityText(intensity: RunIntensity): string {
  return intensity.pace ? `${intensity.label} · ${intensity.pace.label}` : intensity.label;
}

/** Jedna linijka dawki bloku, np. „4 × 3 min, przerwa 3 min truchtu”. */
export function blockDoseText(block: RunRecipeBlock): string {
  if (block.sets === 1 && block.repsPerSet === 1) return block.work.label;
  const reps = block.work.distanceM
    ? `${block.repsPerSet} × sprint ${block.work.distanceM} m`
    : `${block.repsPerSet} × ${block.work.label}`;
  const cycle = block.work.distanceM
    ? `, start co ${block.work.seconds + block.recovery.seconds} s`
    : block.recovery.seconds > 0
      ? `, przerwa ${formatClock(block.recovery.seconds)} ${MODE[block.recovery.mode]}`
      : "";
  const sets =
    block.sets > 1
      ? `${block.sets} serie: ${reps}${cycle}; między seriami ${formatClock(block.setRest?.seconds ?? 0)} ${MODE[block.setRest?.mode ?? "walk"]}`
      : `${reps}${cycle}`;
  return sets;
}

function mainItem(recipe: RunningRecipe, block: RunRecipeBlock): ExerciseItem {
  const hint = block.workDistanceHintM
    ? ` · ok. ${block.workDistanceHintM[0]}–${block.workDistanceHintM[1]} m na odcinek`
    : "";
  const prescription = `${blockDoseText(block)} · ${intensityText(block.intensity)}${hint}`;
  return {
    exerciseId: EXERCISE_ID[recipe.method],
    visualId: EXERCISE_ID[recipe.method],
    name:
      recipe.method === "field_mas_test"
        ? "Test 5 min — równy maksymalny wysiłek"
        : recipe.method === "rsa"
          ? "Powtarzane sprinty"
          : block.label,
    prescription,
    displayPrescription: blockDoseText(block),
    technique: TECHNIQUE[recipe.method],
    ...(block.recovery.seconds > 0 && !(block.sets === 1 && block.repsPerSet === 1)
      ? { rest: `${formatClock(block.recovery.seconds)} ${MODE[block.recovery.mode]}` }
      : {}),
    cue: block.cue,
  };
}

const PHASE_NAMES = {
  warmupJog: "Trucht rozgrzewkowy",
  warmupWalk: "Marsz i rozruch",
  cooldownJog: "Trucht i marsz na schłodzenie",
  cooldownWalk: "Marsz na schłodzenie",
} as const;

/** Pozycja opisu, którą prowadzi licznik (rozgrzewka/schłodzenie z receptury). */
export function isRecipePhaseItem(item: { name: string }): boolean {
  return (Object.values(PHASE_NAMES) as string[]).includes(item.name);
}

function phaseItem(recipe: RunningRecipe, kind: "warmup" | "cooldown"): ExerciseItem {
  const step = kind === "warmup" ? recipe.warmup : recipe.cooldown;
  // Spokojny bieg sam zaczyna się i kończy lekko — wokół niego jest marsz, nie drugi bieg.
  const easy = recipe.method === "easy_continuous" || recipe.method === "long_continuous";
  const id = easy ? "sprint_cooldown_walk" : "easy_aerobic_run";
  return {
    exerciseId: id,
    visualId: easy && kind === "warmup" ? "bwprep:walk" : id,
    name:
      kind === "warmup"
        ? easy
          ? PHASE_NAMES.warmupWalk
          : PHASE_NAMES.warmupJog
        : easy
          ? PHASE_NAMES.cooldownWalk
          : PHASE_NAMES.cooldownJog,
    prescription: `${formatClock(step.seconds)} · ${step.intensity.label}`,
    displayPrescription: formatClock(step.seconds),
    technique:
      kind === "warmup"
        ? "Zacznij marszem, potem lekki trucht. Oddychaj swobodnie."
        : "Zwolnij do lekkiego truchtu, potem marsz, aż oddech się wyrówna.",
    cue: step.instruction,
  };
}

const easyMethod = (recipe: RunningRecipe) =>
  recipe.method === "easy_continuous" || recipe.method === "long_continuous";

export function recipeSections(recipe: RunningRecipe): SessionDay["sections"] {
  return {
    // Spokojny bieg: tylko marsz i lekki trucht — bez przebieżek i rozciągania statycznego.
    warmup: easyMethod(recipe)
      ? [phaseItem(recipe, "warmup")]
      : [phaseItem(recipe, "warmup"), ...runningPreparation()],
    main: recipe.blocks.map((block) => mainItem(recipe, block)),
    accessory: [],
    footballTransfer: [],
    // Marsz z biblioteki zastępuje osobny krok marszu: czas schłodzenia jest w recepturze.
    cooldown: [phaseItem(recipe, "cooldown"), ...runningCooldown().slice(1)],
  };
}

export function recipeSummary(recipe: RunningRecipe): string {
  return recipe.blocks.map(blockDoseText).join(" · ");
}

/** Sesja planu zbudowana w całości z receptury (bez treści z innego źródła). */
export function applyRunningRecipe(session: SessionDay, recipe: RunningRecipe): SessionDay {
  return {
    ...session,
    title: recipe.title,
    sessionType: SESSION_TYPE[recipe.method],
    goalOfSession: GOAL[recipe.method],
    intensity: recipe.intensity,
    durationMin: Math.ceil(recipeTotalSeconds(recipe) / 60),
    sections: recipeSections(recipe),
    exercises: undefined,
    structuredSections: undefined,
    trainingMethods: undefined,
    runningRecipe: recipe,
    loadTags: undefined,
  };
}

// ---------------------------------------------------------------------------
// Kroki licznika
// ---------------------------------------------------------------------------

function timeTarget(seconds: number, label?: string): RunningIntervalTarget {
  return { mode: "time", value: seconds, label: label ?? formatClock(seconds), autoAdvance: true };
}

export function recipeToProtocol(recipe: RunningRecipe): RunningIntervalProtocol {
  const steps: RunningIntervalStep[] = [];
  const effort = (intensity: RunIntensity) => ({ rpe: intensity.rpe, label: intensity.label });
  steps.push({
    id: `${recipe.id}:warmup`,
    kind: "recovery",
    phase: "warmup",
    label: "Rozgrzewka",
    instruction: recipe.warmup.instruction,
    repeatIndex: 1,
    repeatTotal: 1,
    target: timeTarget(recipe.warmup.seconds),
    effort: effort(recipe.warmup.intensity),
  });
  recipe.blocks.forEach((block, blockIndex) => {
    const total = block.sets * block.repsPerSet;
    let index = 0;
    for (let set = 1; set <= block.sets; set++) {
      for (let rep = 1; rep <= block.repsPerSet; rep++) {
        index += 1;
        const work = timeTarget(
          block.work.seconds,
          block.work.distanceM ? `${block.work.distanceM} m` : undefined,
        );
        if (block.intensity.pace) work.paceTarget = { ...block.intensity.pace };
        steps.push({
          id: `${recipe.id}:b${blockIndex}:s${set}:r${rep}:work`,
          kind: "work",
          phase: "main",
          label: block.work.distanceM ? "Sprint" : "Bieg",
          instruction: block.cue,
          repeatIndex: index,
          repeatTotal: total,
          ...(block.sets > 1 ? { setIndex: set, setTotal: block.sets } : {}),
          target: work,
          effort: effort(block.intensity),
        });
        const lastRep = rep === block.repsPerSet;
        const lastSet = set === block.sets;
        const pause = lastRep ? (lastSet ? null : block.setRest) : block.recovery;
        if (pause && pause.seconds > 0)
          steps.push({
            id: `${recipe.id}:b${blockIndex}:s${set}:r${rep}:rest`,
            kind: "recovery",
            phase: "main",
            label: lastRep ? "Przerwa między seriami" : "Przerwa",
            instruction:
              pause.mode === "jog"
                ? "Lekki trucht."
                : pause.mode === "walk"
                  ? block.work.distanceM
                    ? "Wróć marszem na start."
                    : "Spokojny marsz."
                  : "Stój i oddychaj spokojnie.",
            repeatIndex: index,
            repeatTotal: total,
            ...(block.sets > 1 ? { setIndex: set, setTotal: block.sets } : {}),
            target: timeTarget(pause.seconds),
          });
      }
    }
  });
  steps.push({
    id: `${recipe.id}:cooldown`,
    kind: "recovery",
    phase: "cooldown",
    label: "Schłodzenie",
    instruction: recipe.cooldown.instruction,
    repeatIndex: 1,
    repeatTotal: 1,
    target: timeTarget(recipe.cooldown.seconds),
    effort: effort(recipe.cooldown.intensity),
  });
  return { title: recipe.title, summary: recipeSummary(recipe), steps, recipeId: recipe.id };
}

export function sessionRunningRecipe(session: SessionDay | null | undefined): RunningRecipe | null {
  return session && isRunningRecipe(session.runningRecipe) ? session.runningRecipe : null;
}
