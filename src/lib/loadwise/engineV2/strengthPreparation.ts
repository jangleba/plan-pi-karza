import { buildWarmupProtocol } from "../preparation/protocols";
import type { EngineSession, ExerciseDecision } from "./model";

const WARMUP_EXERCISES: Record<string, string> = {
  walk: "warmup_walk",
  ankle: "ankle_rock_forward",
  adductor: "adductor_rockback",
  squat: "bodyweight_squat",
  bridge: "glute_bridge",
};

/** The existing strength preparation protocol becomes actual, eligible plan rows. */
export function buildStrengthPreparation(eligible: (id: string) => boolean): ExerciseDecision[] {
  const protocol = buildWarmupProtocol("strength");
  return protocol.exercises.flatMap((move) => {
    const exerciseId = WARMUP_EXERCISES[move.id];
    if (!exerciseId || !eligible(exerciseId)) return [];
    return [
      {
        exerciseId,
        role: "warmup" as const,
        dose: {
          sets: move.sets ?? 1,
          ...(move.seconds !== undefined ? { seconds: move.seconds } : { reps: move.reps }),
          ...(move.sides ? { perSide: true } : {}),
          restSeconds: move.restSec ?? 0,
          intent: "easy" as const,
        },
        reason: `Rozgrzewka przed siłownią: ${move.id === "walk" ? protocol.goal : move.doseReason}`,
      },
    ];
  });
}

/** Legacy saved prescriptions retain their old allowance; new ones include preparation rows. */
export const strengthPreparationOverhead = (
  recipe: Pick<EngineSession, "strengthPreparationVersion">,
): 0 | 8 => (recipe.strengthPreparationVersion === 1 ? 0 : 8);
