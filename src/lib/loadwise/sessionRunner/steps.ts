import type { TrainingBlock, TrainingExercise, TrainingSection } from "../types";
import { exerciseKey } from "../setLogs";
import { isLinkedBlock } from "../blockMethod";

/**
 * One planned occurrence of an exercise in this session. The same library
 * exercise can appear twice (skip rounds, two sprint blocks); each occurrence
 * keeps its own key, so progress is never merged by name or exerciseId.
 */
export interface RunnerRow {
  key: string;
  section: TrainingSection;
  block: TrainingBlock;
  exercise: TrainingExercise;
  /** 1 for the first occurrence of this history key in the session, 2 for the next … */
  occurrence: number;
}

/** One screen: a single exercise, an explicitly paired block, or a guided cool-down. */
export interface RunnerStep {
  key: string;
  kind: "single" | "linked" | "guided";
  section: TrainingSection;
  rows: RunnerRow[];
}

export const SECTION_LABELS: Record<string, string> = {
  warmup: "Rozgrzewka",
  prep: "Przygotowanie",
  main: "Część główna",
  accessory: "Uzupełnienie",
  footballTransfer: "Z piłką",
  cooldown: "Zakończenie",
};

export function sectionLabel(section: TrainingSection): string {
  return SECTION_LABELS[section.type] ?? section.title;
}

export function buildRunnerSteps(
  sections: TrainingSection[],
  isGuidedSection: (section: TrainingSection) => boolean = () => false,
): RunnerStep[] {
  const seen = new Map<string, number>();
  const usedKeys = new Set<string>();
  const rowFor = (section: TrainingSection, block: TrainingBlock, exercise: TrainingExercise) => {
    const history = exerciseKey(exercise);
    const occurrence = (seen.get(history) ?? 0) + 1;
    seen.set(history, occurrence);
    let key = `${section.id}/${block.id}/${exercise.id}`;
    // Old saved plans may repeat an instance id; keep the occurrences apart.
    for (let n = 2; usedKeys.has(key); n += 1)
      key = `${section.id}/${block.id}/${exercise.id}#${n}`;
    usedKeys.add(key);
    return { key, section, block, exercise, occurrence };
  };
  return sections.flatMap((section): RunnerStep[] => {
    const rows = section.blocks.flatMap((block) =>
      block.exercises.map((exercise) => rowFor(section, block, exercise)),
    );
    if (!rows.length) return [];
    if (isGuidedSection(section))
      return [{ key: `${section.id}:guided`, kind: "guided", section, rows }];
    return section.blocks.flatMap((block): RunnerStep[] => {
      const blockRows = rows.filter((row) => row.block === block);
      return isLinkedBlock(block)
        ? [{ key: `${section.id}/${block.id}`, kind: "linked", section, rows: blockRows }]
        : blockRows.map((row) => ({ key: row.key, kind: "single", section, rows: [row] }));
    });
  });
}

/**
 * Set-log key of an occurrence. The first occurrence keeps the history key,
 * so "Ostatnio" and progression keep working; a repeated occurrence gets its
 * own key instead of overwriting the first one's sets or sprint times.
 */
export function occurrenceLogKey(row: Pick<RunnerRow, "exercise" | "occurrence">): string {
  const key = exerciseKey(row.exercise);
  return row.occurrence > 1 ? `${key}#${row.occurrence}` : key;
}

/** Index of the first step with an unfinished row, warm-up included; last step when all are done. */
export function firstOpenStepIndex(
  steps: RunnerStep[],
  isClosed: (row: RunnerRow) => boolean,
): number {
  const index = steps.findIndex((step) => step.rows.some((row) => !isClosed(row)));
  return index >= 0 ? index : Math.max(0, steps.length - 1);
}

export interface RunnerProgress {
  done: number;
  skipped: number;
  total: number;
}

export function runnerProgress(
  steps: RunnerStep[],
  status: (row: RunnerRow) => "done" | "skipped" | "open",
): RunnerProgress {
  const rows = steps.flatMap((step) => step.rows);
  let done = 0,
    skipped = 0;
  for (const row of rows) {
    const value = status(row);
    if (value === "done") done += 1;
    else if (value === "skipped") skipped += 1;
  }
  return { done, skipped, total: rows.length };
}
