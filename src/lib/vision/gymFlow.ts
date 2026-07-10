import type { GymPlanExercise } from "./gymExercises";

/** Wybrane ćwiczenie z planu — przekazywane między ekranem wyboru a analizą. */
let selected: GymPlanExercise | null = null;

export function setSelectedGymExercise(e: GymPlanExercise | null): void {
  selected = e;
}

export function getSelectedGymExercise(): GymPlanExercise | null {
  return selected;
}
