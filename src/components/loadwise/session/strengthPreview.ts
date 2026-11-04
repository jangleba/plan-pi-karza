import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  canonicalExerciseName,
  resolveDefinitionForExercise,
  type StrengthStageView,
} from "@/lib/loadwise/sessionPresentation";

/** Instruction-only grouping. Never changes the stored prescription or set-log identities. */
export function groupStrengthPreview(stages: StrengthStageView[]) {
  const first = new Map<string, string>();
  const occurrences = new Map<string, TrainingExercise[]>();
  const result = stages
    .map((stage) => ({
      ...stage,
      blocks: stage.blocks
        .map((block) => ({
          ...block,
          exercises: block.exercises.filter((exercise) => {
            const scope = stage.key === "warmup" || stage.key === "cooldown" ? stage.key : "work";
            const key = `${scope}:${resolveDefinitionForExercise(exercise)?.id ?? canonicalExerciseName(exercise).trim().toLocaleLowerCase("pl-PL")}`;
            const id = first.get(key);
            if (id !== undefined) {
              occurrences.get(id)!.push(exercise);
              return false;
            }
            first.set(key, exercise.id);
            occurrences.set(exercise.id, [exercise]);
            return true;
          }),
        }))
        .filter((block) => block.exercises.length),
    }))
    .filter((stage) => stage.blocks.length);
  return { stages: result, occurrences };
}
