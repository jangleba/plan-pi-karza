import type { TrainingBlock, TrainingExercise } from "./types";

/**
 * Name of the way a group of exercises is performed together (superset,
 * contrast pair, complex, circuit). The screen says what to do, not why.
 */
export interface BlockMethod {
  name: string;
}

const METHODS: Partial<Record<TrainingBlock["blockType"], BlockMethod>> = {
  contrast: {
    name: "Seria kontrastowa",
  },
  complex: {
    name: "Kompleks",
  },
  superset: {
    name: "Superseria",
  },
};

const CIRCUIT: BlockMethod = {
  name: "Obwód",
};

const PAIR_LABEL = /^[A-Z]\d$/;

/**
 * A block whose exercises are done back to back, not one after another set by set.
 * Only an explicit pair counts: a paired block type, or A1/A2 labels of one
 * letter together with a pair rest. Older speed sessions copied the set rest
 * into `restAfterPair` on every single exercise — that is not a pair.
 */
export function isLinkedBlock(block: TrainingBlock): boolean {
  if (block.exercises.length < 2) return false;
  if (["superset", "contrast", "complex"].includes(block.blockType)) return true;
  const labels = block.exercises.map((exercise) => exercise.label ?? "");
  return (
    labels.every((label) => PAIR_LABEL.test(label)) &&
    new Set(labels.map((label) => label[0])).size === 1 &&
    block.exercises.some((exercise) => exercise.restAfterPair)
  );
}

export function blockMethod(block: TrainingBlock): BlockMethod | null {
  if (!isLinkedBlock(block)) return null;
  return METHODS[block.blockType] ?? (block.exercises.length > 2 ? CIRCUIT : METHODS.superset!);
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
