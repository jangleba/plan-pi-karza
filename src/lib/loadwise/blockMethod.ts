import type { TrainingBlock, TrainingExercise } from "./types";

/**
 * How a group of exercises is performed together (superset, contrast pair,
 * complex, circuit), explained in one line for the athlete.
 */
export interface BlockMethod {
  name: string;
  how: string;
}

const METHODS: Partial<Record<TrainingBlock["blockType"], BlockMethod>> = {
  contrast: {
    name: "Seria kontrastowa",
    how: "Najpierw ciężkie ćwiczenie, krótka przerwa, potem dynamiczny skok lub rzut. Po ciężkiej serii mięśnie chwilowo generują więcej mocy.",
  },
  complex: {
    name: "Kompleks",
    how: "Ćwiczenia jedno po drugim w podanej kolejności, przerwa dopiero po całym kompleksie.",
  },
  superset: {
    name: "Superseria",
    how: "Dwa ćwiczenia na różne partie jedno po drugim. Jedna partia odpoczywa, gdy druga pracuje, a przerwa jest dopiero po parze.",
  },
};

const CIRCUIT: BlockMethod = {
  name: "Obwód",
  how: "Ćwiczenia po kolei bez długich przerw, przerwa dopiero po całej rundzie.",
};

/** A block whose exercises are done back to back, not one after another set by set. */
export function isLinkedBlock(block: TrainingBlock): boolean {
  return (
    block.exercises.length > 1 &&
    (block.exercises.some((exercise) => exercise.restAfterPair) ||
      ["superset", "contrast", "complex"].includes(block.blockType))
  );
}

export function blockMethod(block: TrainingBlock): BlockMethod | null {
  if (!isLinkedBlock(block)) return null;
  return (
    METHODS[block.blockType] ??
    (block.exercises.length > 2
      ? CIRCUIT
      : {
          name: "Superseria",
          how: METHODS.superset!.how,
        })
  );
}

/** Label shown before each exercise of a linked block (A1, A2 …), derived when missing. */
export function linkedLabel(block: TrainingBlock, exercise: TrainingExercise): string | null {
  if (!isLinkedBlock(block)) return null;
  if (exercise.label && /^[A-Z]\d$/.test(exercise.label)) return exercise.label;
  const position = block.exercises.findIndex((item) => item.id === exercise.id);
  const letter = block.exercises.find((item) => item.label && /^[A-Z]\d$/.test(item.label))
    ?.label?.[0];
  return position < 0 ? null : `${letter ?? "A"}${position + 1}`;
}

/** What follows the exercise inside its linked block: the partner or the rest. */
export function linkedNextStep(block: TrainingBlock, exercise: TrainingExercise): string | null {
  if (!isLinkedBlock(block)) return null;
  const position = block.exercises.findIndex((item) => item.id === exercise.id);
  const next = block.exercises[position + 1];
  if (next) {
    const label = linkedLabel(block, next);
    const pause = exercise.restAfterExercise?.replace(/\s*do\s+[A-Z]\d.*$/i, "").trim();
    return `Potem ${label}${pause ? ` po ${pause}` : " od razu"}.`;
  }
  const rest = exercise.restAfterPair || block.restAfterBlock;
  const cleaned = rest
    ?.replace(/^przerwa( po bloku)?:\s*/i, "")
    .replace(/\s*po (parze|rundzie|bloku)\s*$/i, "")
    .trim();
  const first = linkedLabel(block, block.exercises[0]);
  return cleaned ? `Przerwa ${cleaned}, potem znowu ${first}.` : `Potem przerwa i znowu ${first}.`;
}
