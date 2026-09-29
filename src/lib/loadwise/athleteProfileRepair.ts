// ============================================================================
// Loadwise — Walidacja i naprawa sesji/planu pod profil zawodnika
// ----------------------------------------------------------------------------
// Centralna warstwa, przez którą przechodzi KAŻDA sesja przed zapisem do planu.
// Zamienia niebezpieczne ćwiczenia na regresje (nie usuwa wymaganych kategorii).
// ============================================================================

import type {
  Profile,
  SessionDay,
  ExerciseItem,
  TrainingExercise,
  TrainingSection,
  Intensity,
} from "./types";
import {
  buildAthleteTrainingProfile,
  replaceUnsafeExercise,
  type AthleteTrainingProfile,
  type WeekContext,
} from "./athleteProfile";

export interface WorkoutAdjustment {
  sessionDate: string;
  original: string;
  replacement: string;
  reason: string;
}

function lower(i: Intensity): Intensity {
  if (i === "wysoka") return "umiarkowana";
  if (i === "umiarkowana") return "niska";
  return "niska";
}

/**
 * validateWorkoutForAthleteProfile — sprawdza i NAPRAWIA wszystkie ćwiczenia
 * w pojedynczej sesji (mutuje kopię). Zwraca listę zmian.
 */
export function validateWorkoutForAthleteProfile(
  session: SessionDay,
  a: AthleteTrainingProfile,
): { session: SessionDay; adjustments: WorkoutAdjustment[] } {
  const adjustments: WorkoutAdjustment[] = [];
  // Kanoniczny silnik sprintu już dobiera dawkę, sprzęt i regresję plyometrii
  // z profilu. Ponowna naprawa po samej nazwie rozrywała kontrakt name/exerciseId.
  if (session.speedGeneratorVersion) return { session, adjustments: [] };

  const fixExercise = <T extends ExerciseItem | TrainingExercise>(exercise: T): T => {
    const fixed = replaceUnsafeExercise(exercise, a);
    if (fixed.wasAdjustedForAthleteProfile && fixed !== exercise) {
      adjustments.push({
        sessionDate: session.date,
        original: fixed.replacementForBlockedExercise ?? exercise.name,
        replacement: fixed.name,
        reason: fixed.athleteProfileAdjustmentReason ?? "",
      });
    }
    return fixed;
  };

  const next: SessionDay = { ...session };

  if (next.sections) {
    next.sections = {
      warmup: next.sections.warmup?.map(fixExercise) ?? [],
      main: next.sections.main?.map(fixExercise) ?? [],
      accessory: next.sections.accessory?.map(fixExercise) ?? [],
      footballTransfer: next.sections.footballTransfer?.map(fixExercise) ?? [],
      cooldown: next.sections.cooldown?.map(fixExercise) ?? [],
    };
  }

  if (next.structuredSections) {
    next.structuredSections = next.structuredSections.map((sec): TrainingSection => ({
      ...sec,
      blocks: sec.blocks.map((b) => ({ ...b, exercises: b.exercises.map(fixExercise) })),
    }));
  }

  if (next.exercises) next.exercises = next.exercises.map(fixExercise);

  // Jeśli były zmiany pod profil — obniż ewentualnie zbyt wysoką intensywność.
  if (adjustments.length && next.intensity === "wysoka") {
    next.intensity = lower(next.intensity);
    next.safetyNote =
      next.safetyNote ?? "Obciążenie dostosowane do profilu zawodnika (wiek/poziom/ból).";
  }

  return { session: next, adjustments };
}

/**
 * repairUnsafeExercisesForAthleteProfile — naprawia cały plan w miejscu reguł:
 * 1) zamień ćwiczenie na regresję, 2) obniż intensywność. Nie usuwa kategorii.
 */
export function repairUnsafeExercisesForAthleteProfile(
  plan: SessionDay[],
  profile: Profile,
  weekContext: WeekContext = {},
): { plan: SessionDay[]; adjustments: WorkoutAdjustment[] } {
  const a = buildAthleteTrainingProfile(profile, {}, weekContext);
  const allAdjustments: WorkoutAdjustment[] = [];

  const repaired = plan.map((session) => {
    const { session: fixed, adjustments } = validateWorkoutForAthleteProfile(session, a);
    allAdjustments.push(...adjustments);
    if (fixed.secondSession) {
      const r2 = validateWorkoutForAthleteProfile(fixed.secondSession, a);
      fixed.secondSession = r2.session;
      allAdjustments.push(...r2.adjustments);
    }
    return fixed;
  });

  return { plan: repaired, adjustments: allAdjustments };
}
