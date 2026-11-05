import { ExerciseAnimationPreview } from "./ExerciseAnimationPreview";
const METHOD_BLUEPRINT_IDS = [
  "flywheel_squat",
  "band_resisted_squat",
  "overcoming_pin_squat",
  "clean_pull_from_hang",
  "hill_acceleration",
  "band_resisted_acceleration",
  "assisted_straight_sprint",
  "method_interval_run",
  "method_repeated_sprint",
  "method_speed_endurance",
  "method_sprint_interval",
];
export function hasMethodBlueprint(exerciseId?: string) {
  return METHOD_BLUEPRINT_IDS.includes(exerciseId ?? " ");
}
/** Method demonstrations use the same figure, contacts and controls as other exercises. */
export function MethodBlueprint({ exerciseId }: { exerciseId?: string }) {
  if (!exerciseId || !hasMethodBlueprint(exerciseId)) return null;
  return (
    <ExerciseAnimationPreview
      exercise={{ id: exerciseId, exerciseId, name: "Technika ćwiczenia" }}
      autoOpen
    />
  );
}
