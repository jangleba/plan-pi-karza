import {
  exercisePrescriptionKey,
  plannedExerciseSets,
  type ExerciseSessionLog,
} from "../setLogHistory";
import type { TrainingExercise } from "../types";

/** Advisory only: a product step, never an automatic edit of the saved prescription. */
export function recommendStrengthLoad(
  exercise: TrainingExercise,
  history: ExerciseSessionLog[],
): { weightKg: number; reason: string } | null {
  if (
    exercise.duration ||
    exercise.engineDose?.intent === "hold" ||
    exercise.engineDose?.intent === "explosive"
  )
    return null;
  const sets = plannedExerciseSets(exercise),
    minimum = Number(exercise.reps?.match(/^\d+/)?.[0]),
    maximum = Number(exercise.reps?.match(/^\d+\s*[–-]\s*(\d+)/)?.[1] ?? minimum),
    target = Number(exercise.rir?.match(/\d+/)?.[0]);
  if (!sets || !minimum || !Number.isFinite(target)) return null;
  const key = exercisePrescriptionKey(exercise);
  const recent = history.slice(0, 2);
  if (
    recent.some(
      (s) => s.verification?.prescriptionKey !== key || s.verification.expectedSets !== sets,
    )
  )
    return null;
  if (recent.length !== 2 || recent[0].sessionKey === recent[1].sessionKey) return null;
  const all = recent.flatMap((s) => s.sets);
  if (
    recent.some(
      (s) =>
        s.sets.length !== sets ||
        new Set(s.sets.map((x) => x.setNumber)).size !== sets ||
        s.sets.some((x) => x.setNumber < 1 || x.setNumber > sets),
    )
  )
    return null;
  if (
    all.some(
      (s) =>
        !Number.isFinite(s.weightKg) ||
        s.weightKg! <= 0 ||
        !Number.isFinite(s.reps) ||
        s.reps! < 0 ||
        !Number.isInteger(s.reps) ||
        !Number.isFinite(s.rir) ||
        s.rir! < 0 ||
        s.rir! > 10,
    )
  )
    return null;
  const weight = all[0].weightKg!;
  if (all.some((s) => s.weightKg !== weight)) return null;
  if (
    all.every((s) => s.rir! >= target && s.reps! >= maximum) &&
    Math.round(weight * 1.025 * 2) / 2 > weight
  )
    return {
      weightKg: Math.round(weight * 1.025 * 2) / 2,
      reason:
        "Dwie potwierdzone sesje z tą samą dawką, ciężarem i wymaganym zapasem. Propozycja +2,5%; dobierz dostępny skok obciążenia.",
    };
  if (recent.every((s) => s.sets.some((x) => x.rir === 0 || x.reps! < minimum)))
    return {
      weightKg: Math.round(weight * 0.975 * 2) / 2,
      reason:
        "W obu porównywalnych sesjach zabrakło zapasu. Propozycja mniejszego ciężaru; zachowaj wymaganą technikę i RIR.",
    };
  return null;
}
