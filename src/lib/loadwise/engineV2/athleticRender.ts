import type { SectionType } from "../types";
import type { EngineSession, ExerciseDecision } from "./model";

/**
 * A sport A/B day has an explicit sequence of parts. A hamstring hold can prepare
 * the main work or be working assistance; its movement role alone cannot decide
 * where the athlete should do it. These parts never imply paired execution.
 */
export function athleticSectionType(
  recipe: EngineSession,
  exercise: ExerciseDecision,
): SectionType | null {
  if (recipe.strengthStructure !== "athletic_ab") return null;
  if (exercise.role === "warmup") return "warmup";
  return exercise.strengthStage ?? (exercise.role === "mobility" ? "cooldown" : "main");
}
