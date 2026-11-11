import type { ExerciseItem, SessionDay, TrainingExercise } from "./types";
import { reducePrescription } from "./doseAdjustment";
import { syncGroundContacts } from "./equipmentReplacement";

/** Product preset, not a medical threshold or a validated fatigue assessment. */
const DEFAULT_FACTOR = 0.75;
const reduceCount = (value: string | undefined, factor: number): string | undefined => {
  if (!value) return value;
  // Preserve percentages, load, distances, tempo and time per repetition.
  if (!/^\s*\d+(?:\s*[–-]\s*\d+)?\s*$/.test(value)) return value;
  return value.replace(/\d+/g, (n) => String(Math.max(1, Math.floor(Number(n) * factor))));
};
const reduceWork = (
  value: string | undefined,
  factor: number,
  preserveSprintDose = false,
): string | undefined => {
  if (!value) return value;
  if (/^\s*\d+(?:\s*[–-]\s*\d+)?\s*[×x]/i.test(value))
    return value.replace(
      /^(\s*)(\d+)(?:\s*[–-]\s*(\d+))?(\s*[×x])/i,
      (_, space, low, high, times) =>
        `${space}${Math.max(1, Math.floor(Number(low) * factor))}${high ? `–${Math.max(1, Math.floor(Number(high) * factor))}` : ""}${times}`,
    );
  if (preserveSprintDose && /^\s*\d+(?:\s*[–-]\s*\d+)?\s*(?:m|km|s|sek)\b/i.test(value))
    return value;
  const duration = /^\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*(min|sek|s|powt\.?|razy)\b/i;
  if (duration.test(value))
    return value.replace(
      duration,
      (_, low, high, unit) =>
        `${Math.max(1, Math.floor(Number(low) * factor))}${high ? `–${Math.max(1, Math.floor(Number(high) * factor))}` : ""} ${unit}`,
    );
  return reducePrescription(value, factor);
};

/**
 * Fewer work sets/intervals. Warm-up, preparation, cooldown, load and rest are retained.
 * `factor` is the share of work kept for a shorter time window, not a fatigue model.
 */
export function reduceDailySessionDose(session: SessionDay, factor = DEFAULT_FACTOR): SessionDay {
  const speed = /sprint|speed|szybko|przyspiesz/i.test(`${session.type} ${session.sessionType}`);
  const workValue = (value: string | undefined) => reduceWork(value, factor, speed);
  const strength = /strength|sił/i.test(`${session.type} ${session.sessionType}`);
  const flat = (item: ExerciseItem): ExerciseItem => ({
    ...item,
    prescription: workValue(item.prescription) ?? item.prescription,
    displayPrescription: workValue(item.displayPrescription),
  });
  const structured = (item: TrainingExercise): TrainingExercise => {
    const sets = reduceCount(item.sets, factor);
    const fewerSets = sets !== item.sets;
    const reps = fewerSets ? item.reps : strength ? item.reps : workValue(item.reps);
    const duration =
      fewerSets || reps !== item.reps
        ? item.duration
        : strength || speed
          ? item.duration
          : workValue(item.duration);
    // Human-readable dose is rebuilt from the same fields the runner executes.
    const display =
      fewerSets && item.displayPrescription
        ? /^\s*\d+(?:\s*[–-]\s*\d+)?\s*[×x]/i.test(item.displayPrescription)
          ? item.displayPrescription.replace(/^\s*\d+(?:\s*[–-]\s*\d+)?\s*(?=[×x])/i, `${sets} `)
          : undefined
        : reps !== item.reps || duration !== item.duration
          ? workValue(item.displayPrescription)
          : item.displayPrescription;
    // Ground contacts follow the repetitions, so a shorter dose never shows old jump counts.
    return syncGroundContacts({ ...item, sets, reps, duration, displayPrescription: display });
  };
  const next: SessionDay = {
    ...session,
    sections: {
      ...session.sections,
      main: session.sections.main.map(flat),
      accessory: session.sections.accessory.map(flat),
      footballTransfer: session.sections.footballTransfer.map(flat),
    },
    exercises: session.exercises?.map(flat),
    structuredSections: session.structuredSections?.map((section) =>
      ["warmup", "prep", "cooldown"].includes(section.type)
        ? section
        : {
            ...section,
            blocks: section.blocks.map((block) => ({
              ...block,
              exercises: block.exercises.map(structured),
            })),
          },
    ),
  };
  const work = (s: SessionDay) =>
    JSON.stringify(s.structuredSections?.length ? s.structuredSections : s.sections);
  if (work(next) === work(session))
    throw new Error(
      "Nie ma tu dawki, którą można jednoznacznie zmniejszyć. Wybierz zamianę lub pomiń sesję.",
    );
  // Planned time is only an estimate. Actual time is entered after training.
  return { ...next, durationMin: Math.max(1, Math.round(session.durationMin * factor)) };
}
