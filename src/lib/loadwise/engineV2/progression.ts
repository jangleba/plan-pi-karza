import {
  exercisePrescriptionKey,
  plannedExerciseSets,
  type ExerciseSessionLog,
} from "../setLogHistory";
import type { TrainingExercise } from "../types";

export interface ProgressionAdvice {
  kind: "load" | "resume" | "repetitions" | "review";
  weightKg?: number;
  reps?: number;
  label: string;
  reason: string;
}
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const performed = (s: ExerciseSessionLog) => s.verification?.sessionDate ?? s.performedAt;
const chronological = (history: ExerciseSessionLog[]) =>
  [...history].sort((a, b) => performed(b).localeCompare(performed(a)));
const complete = (s: ExerciseSessionLog, sets: number) =>
  s.sets.length === sets &&
  new Set(s.sets.map((x) => x.setNumber)).size === sets &&
  s.sets.every((x) => Number.isInteger(x.setNumber) && x.setNumber >= 1 && x.setNumber <= sets);

/** No progression across missing/incomplete evidence. A reduced session is a
 * deliberate interruption: the next normal session resumes, never jumps load. */
export function recommendStrengthProgression(
  exercise: TrainingExercise,
  history: ExerciseSessionLog[],
  asOf?: string,
): ProgressionAdvice | null {
  if (
    exercise.progressionPhase === "reduced" ||
    exercise.duration ||
    exercise.engineDose?.intent === "hold" ||
    exercise.engineDose?.intent === "explosive" ||
    exercise.engineDose?.cluster
  )
    return null;
  const sets = plannedExerciseSets(exercise);
  const minimum = Number(exercise.reps?.match(/^\d+/)?.[0]);
  const maximum = Number(exercise.reps?.match(/^\d+\s*[–-]\s*(\d+)/)?.[1] ?? minimum);
  const target = Number(exercise.rir?.match(/\d+/)?.[0]);
  if (!sets || !minimum || !Number.isFinite(target)) return null;
  const key = exercisePrescriptionKey(exercise);
  const ordered = chronological(history);
  if (asOf && ordered[0]) {
    const age = (Date.parse(asOf) - Date.parse(performed(ordered[0]))) / 86400000;
    if (!Number.isFinite(age) || age < -1 || age > 14) return null;
  }
  if (ordered[0]?.verification?.phase === "reduced") {
    // Only bridge explicitly verified, recent reduced exposures. Any other
    // intervening dose or unknown record blocks the bridge.
    let i = 0;
    while (ordered[i]?.verification?.phase === "reduced") {
      const row = ordered[i];
      if (!row.verification || !complete(row, row.verification.expectedSets)) return null;
      i++;
    }
    const prior = ordered[i];
    const gap = prior
      ? (Date.parse(performed(ordered[0])) - Date.parse(performed(prior))) / 86400000
      : Infinity;
    if (
      !prior ||
      !Number.isFinite(gap) ||
      gap < 0 ||
      gap > 21 ||
      prior.verification?.prescriptionKey !== key ||
      !complete(prior, sets)
    )
      return null;
    const weight = prior.sets[0]?.weightKg;
    if (
      !finite(weight) ||
      weight <= 0 ||
      prior.sets.some(
        (s) =>
          s.weightKg !== weight ||
          !finite(s.reps) ||
          s.reps < minimum ||
          !finite(s.rir) ||
          s.rir < target,
      )
    )
      return null;
    return {
      kind: "resume",
      weightKg: weight,
      label: `Po lżejszym tygodniu: punkt odniesienia ${weight} kg`,
      reason:
        "Ostatnia porównywalna zwykła sesja była wykonana z wymaganym zapasem. Oceń ciężar w seriach wprowadzających; lżejszy tydzień nie potwierdza gotowości do podwyżki.",
    };
  }
  const recent = ordered.slice(0, 2);
  if (
    recent.length !== 2 ||
    recent[0].sessionKey === recent[1].sessionKey ||
    recent.some(
      (s) =>
        s.verification?.prescriptionKey !== key ||
        s.verification.expectedSets !== sets ||
        !complete(s, sets),
    )
  )
    return null;
  // Old sessions are not evidence of today's capacity after a long interruption.
  const gap = (Date.parse(performed(recent[0])) - Date.parse(performed(recent[1]))) / 86400000;
  if (!Number.isFinite(gap) || gap < 0 || gap > 21) return null;
  const all = recent.flatMap((s) => s.sets);
  if (
    all.some(
      (s) =>
        !finite(s.reps) ||
        s.reps < 0 ||
        !Number.isInteger(s.reps) ||
        !finite(s.rir) ||
        s.rir < 0 ||
        s.rir > 10,
    )
  )
    return null;
  const success = all.every((s) => s.rir! >= target && s.reps! >= maximum);
  const failed = recent.every((s) => s.sets.some((x) => x.rir! < target || x.reps! < minimum));
  const weight = all[0].weightKg;
  const bodyweight = all.every((s) => s.weightKg === null || s.weightKg === 0);
  if (bodyweight) {
    if (success)
      return {
        kind: "review",
        label: "Dwie udane sesje: możesz ocenić trudniejszy wariant",
        reason:
          "Zachowaj kontrolę i zapas. Zmiana wariantu wymaga ponownego dopasowania ćwiczenia, sprzętu i dawki; nie dodajemy bez końca powtórzeń.",
      };
    if (failed)
      return {
        kind: "review",
        label: "Oceń łatwiejszy wariant z tym samym celem ruchowym",
        reason:
          "Dwie porównywalne sesje bez wymaganego zapasu. Nie trzeba dokładać objętości ani ćwiczyć do upadku.",
      };
    const reps = all[0].reps!;
    if (reps < maximum && all.every((s) => s.reps === reps && s.rir! >= target))
      return {
        kind: "repetitions",
        reps: Math.min(maximum, reps + 1),
        label: `Propozycja: ${Math.min(maximum, reps + 1)} powtórzeń w zapisanym zakresie`,
        reason:
          "Najpierw powtórzenia w zakresie planu; bez jednoczesnej zmiany wariantu lub liczby serii.",
      };
    return null;
  }
  if (!finite(weight) || weight <= 0 || all.some((s) => s.weightKg !== weight)) return null;
  // The 2.5% and 0.5 kg steps are product defaults; available equipment and RIR win.
  const proposed = Math.round(weight * (success ? 1.025 : 0.975) * 2) / 2;
  if (success && proposed > weight)
    return {
      kind: "load",
      weightKg: proposed,
      label: `Propozycja: ${proposed} kg`,
      reason:
        "Dwie pełne porównywalne sesje z tą samą dawką i wymaganym zapasem. Mały skok ciężaru, bez dokładania serii; dobierz dostępne obciążenie.",
    };
  if (failed && proposed < weight && proposed > 0)
    return {
      kind: "load",
      weightKg: proposed,
      label: `Propozycja: ${proposed} kg`,
      reason:
        "W obu porównywalnych sesjach zabrakło wymaganego zapasu lub powtórzeń. Oceń mniejszy ciężar w rozgrzewce.",
    };
  if (failed)
    return {
      kind: "review",
      label: "Wybierz dostępne mniejsze obciążenie",
      reason:
        "Zaokrąglenie procentowej zmiany nie dałoby mniejszego ciężaru. Nie przedstawiamy tego samego ciężaru jako redukcji.",
    };
  return null;
}

/** Backwards-compatible load-only API. All advice remains optional, not a saved-plan mutation. */
export function recommendStrengthLoad(
  exercise: TrainingExercise,
  history: ExerciseSessionLog[],
): { weightKg: number; reason: string } | null {
  const advice = recommendStrengthProgression(exercise, history);
  return advice?.kind === "load" && advice.weightKg !== undefined
    ? { weightKg: advice.weightKg, reason: advice.reason }
    : null;
}

/** Prefill only comparable work. Never carry a deload load or a different
 * angle/assistance/tempo into a normal prescription as its new baseline. */
export function comparablePreviousSets(exercise: TrainingExercise, history: ExerciseSessionLog[]) {
  if (exercise.progressionPhase === "reduced") return {};
  const newest = chronological(history)[0];
  if (!newest || newest.verification?.prescriptionKey !== exercisePrescriptionKey(exercise))
    return {};
  return Object.fromEntries(newest.sets.map((s) => [s.setNumber, s]));
}
