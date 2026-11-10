import type { TrainingExercise } from "../types";
import { getExerciseDefinition, resolveExerciseByName } from "../exerciseLibrary";
import { getSkipGuide } from "../skipGuides";
import { skipRhythmCue } from "../skipRounds";
import { resolveQuickGuide } from "@/lib/courseMeasure/quickGuide";
import {
  resolveExerciseAnimation,
  usesSharedAnimation,
  type AnimationSelection,
} from "@/lib/trainingCoach/animationCatalog";

/**
 * "Jak wykonać" for one exercise occurrence: about three steps (set-up,
 * execution, finish), one or two things to watch, and an animation only when
 * it shows exactly this exercise and variant. Without a matching drawing the
 * text stays and the gap is named — no other movement is shown instead.
 */
export interface HowTo {
  steps: string[];
  watch: string[];
  animation: AnimationSelection | null;
  /** Why no animation is shown; null when one is shown. */
  animationGap: string | null;
}

const MAX_STEPS = 4;
const MAX_WATCH = 2;

/** Absolute bans without a stated source read as rules; keep them out of short cues. */
const UNVERIFIED_ABSOLUTE = /\bnigdy\b|\babsolutnie\b|\bzawsze\b|\bzakazan/i;

function clean(text: string | null | undefined): string | null {
  const value = text
    ?.replace(/\s+/g, " ")
    .replace(/^krok\s*\d+\s*[—–:-]\s*/i, "")
    .replace(/\.{2}(?!\.)/g, ".")
    .trim();
  if (!value) return null;
  return /[.!?…]$/.test(value) ? value : `${value}.`;
}

/** Same text, or the same error named twice ("Zaokrąglone plecy" / "Zaokrąglenie pleców"). */
function sameMeaning(a: string, b: string): boolean {
  const norm = (t: string) =>
    t
      .toLocaleLowerCase("pl-PL")
      .replace(/[^\p{L}\d ]+/gu, "")
      .trim();
  const x = norm(a),
    y = norm(b);
  if (x === y || (y.length > 8 && x.includes(y)) || (x.length > 8 && y.includes(x))) return true;
  const stem = (t: string) => t.split(" ")[0]?.slice(0, 6) ?? "";
  return stem(x).length >= 6 && stem(x) === stem(y);
}

function uniquePush(list: string[], value: string | null, limit: number) {
  if (!value || list.length >= limit || UNVERIFIED_ABSOLUTE.test(value)) return;
  if (list.some((item) => sameMeaning(item, value))) return;
  list.push(value);
}

const definitionOf = (exercise: TrainingExercise) =>
  (exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined) ??
  resolveExerciseByName(exercise.name);

export function resolveHowTo(exercise: TrainingExercise): HowTo {
  const definition = definitionOf(exercise);
  const steps: string[] = [];
  const watch: string[] = [];
  const skip = getSkipGuide(definition?.id ?? exercise.exerciseId);
  if (skip) {
    uniquePush(steps, clean(skip.setup), MAX_STEPS);
    const rhythm = skipRhythmCue(definition?.id ?? exercise.exerciseId, exercise.animationVariant);
    for (const step of skip.steps)
      uniquePush(steps, clean(step), rhythm ? MAX_STEPS - 1 : MAX_STEPS);
    uniquePush(steps, clean(rhythm), MAX_STEPS);
    for (const error of skip.errors) uniquePush(watch, clean(error), MAX_WATCH);
  } else {
    const specific = (exercise.instructionSteps ?? [])
      .map((step) => clean([step.title, step.description].filter(Boolean).join(" — ")))
      .filter((step): step is string => Boolean(step));
    const library = (definition?.instructionsPl ?? []).map(clean);
    const source = specific.length ? specific : library;
    if (source.length) {
      if (!specific.length) uniquePush(steps, clean(exercise.setup), MAX_STEPS);
      for (const step of source) uniquePush(steps, step, 3);
    } else {
      const guide = resolveQuickGuide(exercise, definition);
      uniquePush(steps, clean(guide.setup), MAX_STEPS);
      uniquePush(steps, clean(guide.action), MAX_STEPS);
    }
    if (!steps.length) uniquePush(steps, clean(exercise.technique), MAX_STEPS);
    uniquePush(watch, clean(exercise.commonMistake), MAX_WATCH);
    for (const error of definition?.commonErrors ?? []) uniquePush(watch, clean(error), MAX_WATCH);
    if (!watch.length)
      uniquePush(watch, clean(resolveQuickGuide(exercise, definition).error), MAX_WATCH);
  }
  if (exercise.tempo?.trim())
    uniquePush(steps, `Tempo z planu: ${exercise.tempo.trim()}.`, MAX_STEPS + 1);

  const selection = resolveExerciseAnimation(exercise);
  let animation: AnimationSelection | null = null;
  let animationGap: string | null = null;
  if (!selection) animationGap = "Brak animacji tego ćwiczenia.";
  else if (usesSharedAnimation(definition?.id ?? exercise.exerciseId))
    animationGap =
      "Brak animacji tego ćwiczenia. Ogólny przykład pracy z piłką nie pokazuje tego zadania.";
  else if (selection.needsChoice)
    animationGap =
      (selection.choices?.length ?? 0) > 1
        ? "Plan nie zapisuje jednego wariantu tego ruchu, więc animacja nie jest pokazywana."
        : "Dostępny jest tylko schemat części ruchu, więc animacja nie jest pokazywana.";
  else animation = selection;
  return { steps, watch, animation, animationGap };
}
