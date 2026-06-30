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
  validateExerciseForAthleteProfile,
  validateExerciseAgainstInjuries,
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

/** Czy sesja ma w treści zaawansowane bodźce niezgodne z profilem. */
function sessionHasUnsafe(session: SessionDay, a: AthleteTrainingProfile): boolean {
  const names = collectNames(session);
  return names.some(
    (n) =>
      !validateExerciseForAthleteProfile(n, a).ok ||
      !validateExerciseAgainstInjuries(n, a).ok,
  );
}

function collectNames(session: SessionDay): string[] {
  const out: string[] = [];
  const s = session.sections;
  if (s) {
    for (const key of ["warmup", "main", "accessory", "footballTransfer", "cooldown"] as const) {
      for (const e of s[key] ?? []) out.push(e.name);
    }
  }
  for (const sec of session.structuredSections ?? []) {
    for (const b of sec.blocks) for (const e of b.exercises) out.push(e.name);
  }
  for (const e of session.exercises ?? []) out.push(e.name);
  return out;
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

  const fixItems = (items: ExerciseItem[] | undefined): ExerciseItem[] | undefined => {
    if (!items) return items;
    return items.map((e) => {
      const fixed = replaceUnsafeExercise(e, a);
      if (fixed.wasAdjustedForAthleteProfile && fixed !== e) {
        adjustments.push({
          sessionDate: session.date,
          original: fixed.replacementForBlockedExercise ?? e.name,
          replacement: fixed.name,
          reason: fixed.athleteProfileAdjustmentReason ?? "",
        });
      }
      return fixed;
    });
  };

  const fixTraining = (items: TrainingExercise[]): TrainingExercise[] =>
    items.map((e) => {
      const fixed = replaceUnsafeExercise(e, a);
      if (fixed.wasAdjustedForAthleteProfile && fixed !== e) {
        adjustments.push({
          sessionDate: session.date,
          original: fixed.replacementForBlockedExercise ?? e.name,
          replacement: fixed.name,
          reason: fixed.athleteProfileAdjustmentReason ?? "",
        });
      }
      return fixed;
    });

  const next: SessionDay = { ...session };

  if (next.sections) {
    next.sections = {
      warmup: fixItems(next.sections.warmup) ?? [],
      main: fixItems(next.sections.main) ?? [],
      accessory: fixItems(next.sections.accessory) ?? [],
      footballTransfer: fixItems(next.sections.footballTransfer) ?? [],
      cooldown: fixItems(next.sections.cooldown) ?? [],
    };
  }

  if (next.structuredSections) {
    next.structuredSections = next.structuredSections.map(
      (sec): TrainingSection => ({
        ...sec,
        blocks: sec.blocks.map((b) => ({ ...b, exercises: fixTraining(b.exercises) })),
      }),
    );
  }

  if (next.exercises) next.exercises = fixItems(next.exercises);

  // Jeśli były zmiany pod profil — obniż ewentualnie zbyt wysoką intensywność.
  if (adjustments.length && next.intensity === "wysoka") {
    next.intensity = lower(next.intensity);
    next.safetyNote =
      next.safetyNote ??
      "Obciążenie dostosowane do profilu zawodnika (wiek/poziom/ból).";
  }

  return { session: next, adjustments };
}

/**
 * validatePlanAgainstAthleteProfile — raport (bez mutacji), wykrywa
 * niezgodności w całym tygodniu/planie.
 */
export function validatePlanAgainstAthleteProfile(
  plan: SessionDay[],
  a: AthleteTrainingProfile,
): { date: string; names: string[] }[] {
  const issues: { date: string; names: string[] }[] = [];
  for (const session of plan) {
    const bad = collectNames(session).filter(
      (n) =>
        !validateExerciseForAthleteProfile(n, a).ok ||
        !validateExerciseAgainstInjuries(n, a).ok,
    );
    if (bad.length) issues.push({ date: session.date, names: [...new Set(bad)] });
    if (session.secondSession) {
      const bad2 = collectNames(session.secondSession).filter(
        (n) =>
          !validateExerciseForAthleteProfile(n, a).ok ||
          !validateExerciseAgainstInjuries(n, a).ok,
      );
      if (bad2.length)
        issues.push({ date: session.date + " (sesja 2)", names: [...new Set(bad2)] });
    }
  }
  return issues;
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

export { sessionHasUnsafe };
