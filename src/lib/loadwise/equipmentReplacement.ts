import type { ExerciseDefinition } from "./exerciseLibrary";
import type { TrainingExercise } from "./types";

const PER_SIDE = /na stron|każd(?:ą|a) stron|po jednej stronie/i;

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
function groundContactsForReps(reps: string | undefined): number | undefined {
  const count = leadingCount(reps);
  if (count === undefined) return undefined;
  return count * (reps && PER_SIDE.test(reps) ? 2 : 1);
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
