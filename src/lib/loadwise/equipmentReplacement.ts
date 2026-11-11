import type { ExerciseDefinition } from "./exerciseLibrary";
import type { TrainingExercise } from "./types";

/**
 * Dose units never convert into each other. Seconds stay seconds, metres stay
 * metres, and a repetition count is not turned into a time. When the replacement
 * measures work differently, it takes that exercise's own default dose.
 */
export type DoseUnit = "count" | "time" | "distance" | "none";

const PER_SIDE = /na stron|każd(?:ą|a) stron|po jednej stronie/i;

export function doseUnit(exercise: Pick<TrainingExercise, "reps" | "duration">): DoseUnit {
  if (exercise.duration && /\d/.test(exercise.duration)) return "time";
  const reps = exercise.reps ?? "";
  if (/\d\s*(?:s|sek|min)\b/i.test(reps)) return "time";
  if (/\d\s*m\b/i.test(reps)) return "distance";
  if (/\d/.test(reps)) return "count";
  return "none";
}

/** Upper bound of the leading count in a prescription such as „3”, „6–8” or „4 kontakty na stronę”. */
function leadingCount(text: string | undefined): number | undefined {
  const match = text?.match(/^\s*(?:\d+\s*[×x]\s*)?(\d+)(?:\s*[–-]\s*(\d+))?/i);
  if (!match) return undefined;
  return Number(match[2] ?? match[1]);
}

/**
 * Ground contacts of ONE set equal the jumps in that set: one per jump, two per
 * jump when the prescription is per side. The number follows the repetitions.
 */
export function groundContactsForReps(reps: string | undefined): number | undefined {
  const count = leadingCount(reps);
  if (count === undefined) return undefined;
  return count * (reps && PER_SIDE.test(reps) ? 2 : 1);
}

/** Keeps a contacts value that is shown or logged equal to the repetitions it belongs to. */
export function syncGroundContacts(exercise: TrainingExercise): TrainingExercise {
  if (exercise.groundContacts === undefined) return exercise;
  const contacts = groundContactsForReps(exercise.reps);
  if (contacts === undefined || contacts === exercise.groundContacts) return exercise;
  return { ...exercise, groundContacts: contacts };
}

function defaultDose(def: ExerciseDefinition): Partial<TrainingExercise> {
  if (def.movementPattern === "isometric")
    return { reps: undefined, duration: "15–20 s", rpe: "RPE 5–6", rir: "3–4" };
  const plyo = ["power", "plyometric"].includes(def.category);
  return {
    reps: plyo ? "3" : "6–8",
    duration: undefined,
    rpe: "RPE 5–6",
    rir: "3–4",
  };
}

function displayFor(
  exercise: Pick<TrainingExercise, "sets" | "reps" | "duration">,
): string | undefined {
  const work = exercise.reps || exercise.duration;
  if (!work) return undefined;
  return exercise.sets ? `${exercise.sets} × ${work}` : work;
}

/**
 * Builds the replacement for a blocked exercise. The replacement starts with a
 * conservative dose of its own: two sets and the default repetitions or time of
 * the new movement. The old dose, load and tempo do not carry over, and the
 * athlete keeps the rests of the planned session as safety pauses.
 */
export function buildEquipmentReplacement(
  original: TrainingExercise,
  def: ExerciseDefinition,
): TrainingExercise {
  const bodyweight = def.loadingType === "bodyweight";
  const next: TrainingExercise = {
    ...original,
    exerciseId: def.id,
    name: def.displayNamePl,
    equipment: def.equipmentRequired.join(", "),
    visualId: def.id,
    setup: undefined,
    technique: undefined,
    cue: undefined,
    purpose: undefined,
    instructionSteps: undefined,
    commonMistake: undefined,
    progression: undefined,
    regression: undefined,
    contraindications: undefined,
    displayPrescription: undefined,
    tempo: undefined,
    loadTarget: bodyweight ? "Masa ciała, kontrola ruchu" : undefined,
    loadGuidance: "Przy zmianie wariantu zacznij lekko. Nie przenoś ciężaru ze starego ćwiczenia.",
    loadReduceWhen: undefined,
    replacementForBlockedExercise: original.name,
    wasAdjustedForAthleteProfile: true,
    sets: "2",
    ...defaultDose(def),
    groundContacts:
      def.plyometricIntensity && def.plyometricIntensity !== "none"
        ? groundContactsForReps(defaultDose(def).reps)
        : undefined,
  };
  next.displayPrescription = displayFor(next);
  return next;
}

/**
 * Final alignment for generated structured sections: a jump exercise shows as
 * many repetitions as it has ground contacts per set. Only mismatched values are
 * rewritten; a consistent prescription is returned unchanged.
 */
export function alignJumpRepetitions(exercise: TrainingExercise): TrainingExercise {
  const contacts = exercise.groundContacts;
  if (!contacts || contacts <= 0) return exercise;
  if (groundContactsForReps(exercise.reps) === contacts) return exercise;
  const perSide = Boolean(exercise.reps && PER_SIDE.test(exercise.reps));
  if (perSide && contacts % 2 !== 0) return exercise;
  const jumps = perSide ? contacts / 2 : contacts;
  return {
    ...exercise,
    reps: `${jumps} ${perSide ? "kontakty na stronę" : "kontaktów"}`,
  };
}
