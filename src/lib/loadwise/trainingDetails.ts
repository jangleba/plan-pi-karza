import type { TrainingExercise } from "./types";

export type TrainingFields = { weight: string; reps: string; rir: string; value: string };
export const EMPTY_TRAINING_FIELDS: TrainingFields = { weight: "", reps: "", rir: "", value: "" };

/** Form drafts contain user input, never completed sets or estimated measurements. */
export function parseTrainingFields(value: unknown): TrainingFields | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  if (
    !["weight", "reps", "rir", "value"].every(
      (key) => typeof source[key] === "string" && (source[key] as string).length <= 32,
    )
  )
    return undefined;
  return {
    weight: source.weight as string,
    reps: source.reps as string,
    rir: source.rir as string,
    value: source.value as string,
  };
}

export function parseExerciseNote(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, 500) : undefined;
}

export function trainingStorageKey(
  kind: string,
  userId: string | null | undefined,
  ...parts: string[]
): string {
  return `loadwise:details:v1:${kind}:${[userId ?? "guest", ...parts].map(encodeURIComponent).join(":")}`;
}

export function parseTrainingNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function validateTrainingFields(values: TrainingFields, kind: string): string | null {
  for (const id of kind === "load"
    ? (["weight", "reps", "rir"] as const)
    : (["value", "rir"] as const)) {
    if (values[id].trim() && parseTrainingNumber(values[id]) === null)
      return "Wpisz poprawną liczbę. Możesz użyć przecinka.";
  }
  if (kind === "load" && parseTrainingNumber(values.weight) === null)
    return "Wpisz używany ciężar. Przy pracy bez dodatkowego obciążenia wpisz 0.";
  const result = parseTrainingNumber(kind === "load" ? values.reps : values.value);
  if (result === null || result <= 0)
    return kind === "load" ? "Wpisz liczbę wykonanych powtórzeń." : "Wpisz wykonany wynik serii.";
  if ((kind === "load" || kind === "contacts") && !Number.isInteger(result))
    return "Powtórzenia i kontakty zapisuj jako liczby całkowite.";
  const rir = parseTrainingNumber(values.rir);
  if (rir !== null && (rir > 10 || !Number.isInteger(rir)))
    return "RIR musi być liczbą całkowitą od 0 do 10.";
  return null;
}

export function exerciseDose(exercise: TrainingExercise): string {
  return (
    exercise.displayPrescription?.trim() ||
    [
      exercise.sets && `${exercise.sets} serie`,
      exercise.reps && `${exercise.reps} powt.`,
      exercise.duration,
    ]
      .filter(Boolean)
      .join(" · ")
  );
}

export type ExerciseProgress = {
  done: Record<string, boolean>;
  started: boolean;
  currentBlockIdx: number;
  fingerprint?: string;
};

export function parseExerciseProgress(value: unknown): ExerciseProgress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const done = input.done;
  if (!done || typeof done !== "object" || Array.isArray(done)) return undefined;
  const entries = Object.entries(done).filter(
    ([key, value]) => key.length <= 200 && typeof value === "boolean",
  );
  if (entries.length > 500) return undefined;
  return {
    done: Object.fromEntries(entries),
    started: input.started === true,
    currentBlockIdx:
      typeof input.currentBlockIdx === "number" && Number.isInteger(input.currentBlockIdx)
        ? Math.max(0, input.currentBlockIdx)
        : 0,
    fingerprint: typeof input.fingerprint === "string" ? input.fingerprint : undefined,
  };
}

/** A changed prescription must not inherit completion marks from an old plan. */
export function trainingFingerprint(exercises: TrainingExercise[]): string {
  return JSON.stringify(
    exercises.map((e) => [
      e.id,
      e.exerciseId,
      e.name,
      e.displayPrescription,
      e.sets,
      e.reps,
      e.duration,
      e.loadTarget,
      e.rir,
      e.rpe,
      e.tempo,
      e.restAfterExercise,
      e.restAfterPair,
    ]),
  );
}

export function progressForPrescription(
  progress: ExerciseProgress,
  fingerprint: string,
): ExerciseProgress {
  return progress.fingerprint && progress.fingerprint !== fingerprint
    ? { done: {}, started: false, currentBlockIdx: 0, fingerprint }
    : progress;
}
